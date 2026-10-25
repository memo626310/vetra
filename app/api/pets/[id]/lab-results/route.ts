import { randomUUID } from "node:crypto";
import { getClinicStaffPermissions, requireClinicPermission } from "@/lib/staff-api-auth";
import { getCoreAdminClient, PushSetupError, resolveClinicPushContext } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reuse the private medical bucket already provisioned for visit attachments.
// This keeps lab uploads working on tenant databases where the optional lab bucket
// migration has not been applied yet.
const bucket = "visit-attachments";
const maxBytes = 10 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function errorResponse(error: unknown) {
  if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
  console.error("CLINIC LAB RESULT API ERROR:", error);
  return Response.json({ error: error instanceof Error ? error.message : "تعذر حفظ نتيجة التحليل." }, { status: 500 });
}

function safeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, "_").slice(-120) || "lab-result";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let uploadedPath = "";
  let recordId = "";
  try {
    const { id: petId } = await context.params;
    const actor = await resolveClinicPushContext(request);
    const permissions = await getClinicStaffPermissions(actor);
    if (!permissions.medical_records?.create && !permissions.medical_records?.edit) throw new PushSetupError("لا تملك صلاحية إضافة نتائج التحاليل.", 403);

    const form = await request.formData();
    const file = form.get("file");
    const title = String(form.get("title") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const performedAt = String(form.get("performed_at") || "").trim();
    const resultRows = String(form.get("result_rows") || "[]");
    if (!title) throw new PushSetupError("اسم التحليل مطلوب.", 400);
    if (!(file instanceof File)) throw new PushSetupError("ملف نتيجة التحليل مطلوب.", 400);
    if (file.size < 1 || file.size > maxBytes || !allowedTypes.has(file.type)) throw new PushSetupError("يسمح بملفات PDF أو الصور بحد أقصى 10 ميجابايت.", 400);
    try { JSON.parse(resultRows); } catch { throw new PushSetupError("قيم التحليل غير صالحة.", 400); }

    const { data: pet, error: petError } = await actor.clinicDb.from("pets").select("id,client_id").eq("id", petId).eq("clinic_id", actor.clinicId).maybeSingle();
    if (petError || !pet) throw new PushSetupError("الحيوان غير موجود أو غير متاح.", 404);

    const admin = getCoreAdminClient();
    const fileName = safeFileName(file.name);
    uploadedPath = `${actor.clinicId}/${pet.client_id}/${petId}/${randomUUID()}-${fileName}`;
    const { error: uploadError } = await admin.storage.from(bucket).upload(uploadedPath, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data: record, error: recordError } = await actor.clinicDb.from("pet_medical_records").insert({
      clinic_id: actor.clinicId,
      pet_id: petId,
      client_id: pet.client_id,
      record_type: "lab",
      title,
      status: "completed",
      result: resultRows === "[]" ? null : resultRows,
      notes: notes || null,
      performed_at: performedAt ? new Date(performedAt).toISOString() : new Date().toISOString(),
    }).select("id,pet_id,client_id,visit_id,record_type,title,status,result,notes,performed_at,created_at").single();
    if (recordError || !record) throw recordError || new Error("تعذر حفظ نتيجة التحليل.");
    recordId = record.id;

    const { data: attachment, error: attachmentError } = await actor.clinicDb.from("pet_medical_record_attachments").insert({
      clinic_id: actor.clinicId,
      record_id: record.id,
      pet_id: petId,
      client_id: pet.client_id,
      file_name: file.name,
      storage_path: uploadedPath,
      mime_type: file.type,
      size_bytes: file.size,
    }).select("id,record_id,pet_id,file_name,storage_path,mime_type,size_bytes,created_at").single();
    if (attachmentError || !attachment) throw attachmentError || new Error("تعذر حفظ مرفق التحليل.");
    return Response.json({ record, attachment }, { status: 201 });
  } catch (error) {
    if (recordId) {
      try { const actor = await resolveClinicPushContext(request); await actor.clinicDb.from("pet_medical_records").delete().eq("id", recordId); } catch { /* keep original error */ }
    }
    if (uploadedPath) {
      try { await getCoreAdminClient().storage.from(bucket).remove([uploadedPath]); } catch { /* keep original error */ }
    }
    return errorResponse(error);
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: petId } = await context.params;
    const actor = await requireClinicPermission(request, "medical_records", "view");
    const attachmentId = new URL(request.url).searchParams.get("attachment_id");
    if (!attachmentId) throw new PushSetupError("معرّف الملف مطلوب.", 400);
    const { data: attachment, error } = await actor.clinicDb.from("pet_medical_record_attachments").select("storage_path").eq("id", attachmentId).eq("pet_id", petId).eq("clinic_id", actor.clinicId).maybeSingle();
    if (error || !attachment) throw new PushSetupError("الملف غير موجود أو غير متاح.", 404);
    const { data, error: signedError } = await getCoreAdminClient().storage.from(bucket).createSignedUrl(attachment.storage_path, 300);
    if (signedError || !data?.signedUrl) throw signedError || new Error("Could not create a secure file link.");
    return Response.json({ url: data.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  let replacementPath = "";
  try {
    const { id: petId } = await context.params;
    const actor = await resolveClinicPushContext(request);
    const permissions = await getClinicStaffPermissions(actor);
    if (!permissions.medical_records?.edit) throw new PushSetupError("لا تملك صلاحية تعديل نتائج التحاليل.", 403);
    const form = await request.formData();
    const recordId = String(form.get("record_id") || "");
    const title = String(form.get("title") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const performedAt = String(form.get("performed_at") || "").trim();
    const resultRows = String(form.get("result_rows") || "[]");
    const file = form.get("file");
    if (!recordId || !title) throw new PushSetupError("بيانات التقرير غير مكتملة.", 400);
    try { JSON.parse(resultRows); } catch { throw new PushSetupError("قيم التحليل غير صالحة.", 400); }
    if (file instanceof File && (file.size < 1 || file.size > maxBytes || !allowedTypes.has(file.type))) throw new PushSetupError("يسمح بملفات PDF أو الصور بحد أقصى 10 ميجابايت.", 400);

    const { data: existing, error: existingError } = await actor.clinicDb.from("pet_medical_records").select("id,pet_id,client_id").eq("id", recordId).eq("pet_id", petId).eq("clinic_id", actor.clinicId).eq("record_type", "lab").maybeSingle();
    if (existingError || !existing) throw new PushSetupError("التقرير غير موجود أو غير متاح.", 404);
    const { error: updateError } = await actor.clinicDb.from("pet_medical_records").update({ title, notes: notes || null, result: resultRows === "[]" ? null : resultRows, performed_at: performedAt ? new Date(performedAt).toISOString() : new Date().toISOString() }).eq("id", recordId).eq("pet_id", petId).eq("clinic_id", actor.clinicId);
    if (updateError) throw updateError;

    if (file instanceof File) {
      const admin = getCoreAdminClient();
      replacementPath = `${actor.clinicId}/${existing.client_id}/${petId}/${randomUUID()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await admin.storage.from(bucket).upload(replacementPath, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: oldAttachment } = await actor.clinicDb.from("pet_medical_record_attachments").select("id,storage_path").eq("record_id", recordId).maybeSingle();
      if (oldAttachment) {
        const { error: attachmentUpdateError } = await actor.clinicDb.from("pet_medical_record_attachments").update({ file_name: file.name, storage_path: replacementPath, mime_type: file.type, size_bytes: file.size }).eq("id", oldAttachment.id);
        if (attachmentUpdateError) throw attachmentUpdateError;
      } else {
        const { error: attachmentInsertError } = await actor.clinicDb.from("pet_medical_record_attachments").insert({
          clinic_id: actor.clinicId,
          record_id: recordId,
          pet_id: petId,
          client_id: existing.client_id,
          file_name: file.name,
          storage_path: replacementPath,
          mime_type: file.type,
          size_bytes: file.size,
        });
        if (attachmentInsertError) throw attachmentInsertError;
      }
      if (oldAttachment?.storage_path) await admin.storage.from(bucket).remove([oldAttachment.storage_path]);
    }
    const { data: record, error: recordError } = await actor.clinicDb.from("pet_medical_records").select("id,pet_id,client_id,visit_id,record_type,title,status,result,notes,performed_at,created_at").eq("id", recordId).single();
    if (recordError || !record) throw recordError || new Error("تعذر تحميل التقرير بعد التعديل.");
    const { data: attachment } = await actor.clinicDb.from("pet_medical_record_attachments").select("id,record_id,pet_id,file_name,storage_path,mime_type,size_bytes,created_at").eq("record_id", recordId).maybeSingle();
    return Response.json({ record, attachment: attachment || null });
  } catch (error) {
    if (replacementPath) { try { await getCoreAdminClient().storage.from(bucket).remove([replacementPath]); } catch { /* keep original error */ } }
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: petId } = await context.params;
    const actor = await resolveClinicPushContext(request);
    const permissions = await getClinicStaffPermissions(actor);
    if (!permissions.medical_records?.delete) throw new PushSetupError("لا تملك صلاحية حذف نتائج التحاليل.", 403);
    const recordId = new URL(request.url).searchParams.get("record_id") || "";
    if (!recordId) throw new PushSetupError("معرّف التقرير مطلوب.", 400);
    const { data: attachments } = await actor.clinicDb.from("pet_medical_record_attachments").select("storage_path").eq("record_id", recordId).eq("pet_id", petId).eq("clinic_id", actor.clinicId);
    const { error } = await actor.clinicDb.from("pet_medical_records").delete().eq("id", recordId).eq("pet_id", petId).eq("clinic_id", actor.clinicId).eq("record_type", "lab");
    if (error) throw error;
    const paths = (attachments || []).map((item) => item.storage_path).filter(Boolean);
    if (paths.length) await getCoreAdminClient().storage.from(bucket).remove(paths);
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
