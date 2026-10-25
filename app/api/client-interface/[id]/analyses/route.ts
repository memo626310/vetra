import { randomUUID } from "node:crypto";
import { getCoreAdminClient, PushSetupError, resolveOwnerPushContext } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reuse the private medical bucket already provisioned for visit attachments.
const bucket = "visit-attachments";
const maxBytes = 10 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function errorResponse(error: unknown) {
  if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
  console.error("CLIENT LAB RESULT API ERROR:", error);
  return Response.json({ error: error instanceof Error ? error.message : "تعذر تنفيذ العملية." }, { status: 500 });
}

function cleanFileName(value: string) {
  return value.replace(/[^\w.-]+/g, "_").slice(-120) || "lab-result";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let uploadedPath = "";
  try {
    const { id: routeClientId } = await context.params;
    const contentType = request.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await request.json() as Record<string, unknown> : null;
    const form = isJson ? null : await request.formData();
    const clientCode = String(body?.clientCode || form?.get("clientCode") || "");
    const phone = String(body?.phone || form?.get("phone") || "");
    const { identity, tenantDb } = await resolveOwnerPushContext({ clientCode, phone });
    if (identity.ownerClientId !== routeClientId) throw new PushSetupError("لا يمكنك الوصول إلى نتائج هذا الحساب.", 403);

    if (isJson && body?.action === "signed-url") {
      const attachmentId = String(body.attachmentId || "");
      if (!attachmentId) throw new PushSetupError("معرّف الملف مطلوب.", 400);
      const { data: rows, error } = await tenantDb.rpc("vetra_get_pet_lab_attachments", { p_pet_id: body.petId || null });
      if (error) throw error;
      const attachment = (rows || []).find((row: { id?: string }) => row.id === attachmentId);
      if (!attachment) throw new PushSetupError("الملف غير موجود أو غير متاح.", 404);
      const { data, error: signedError } = await getCoreAdminClient().storage.from(bucket).createSignedUrl(attachment.storage_path, 300);
      if (signedError || !data?.signedUrl) throw signedError || new Error("Could not create a secure file link.");
      return Response.json({ url: data.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const file = form?.get("file");
    const petId = String(form?.get("petId") || "");
    const title = String(form?.get("title") || "").trim();
    const notes = String(form?.get("notes") || "").trim();
    const performedAt = String(form?.get("performedAt") || "").trim();
    const resultRows = String(form?.get("resultRows") || "[]");
    if (!(file instanceof File) || !petId || !title) throw new PushSetupError("اسم التحليل والملف والحيوان مطلوبة.", 400);
    if (file.size < 1 || file.size > maxBytes || !allowedTypes.has(file.type)) throw new PushSetupError("يسمح بملفات PDF أو الصور بحد أقصى 10 ميجابايت.", 400);

    const { data: pet, error: petError } = await tenantDb.from("pets").select("id").eq("id", petId).eq("client_id", routeClientId).maybeSingle();
    if (petError || !pet) throw new PushSetupError("الحيوان غير موجود في حسابك.", 404);
    JSON.parse(resultRows);

    const admin = getCoreAdminClient();
    const fileName = cleanFileName(file.name);
    uploadedPath = `${identity.clinicId}/${routeClientId}/${petId}/${randomUUID()}-${fileName}`;
    const { error: uploadError } = await admin.storage.from(bucket).upload(uploadedPath, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: record, error: recordError } = await tenantDb.rpc("vetra_submit_pet_lab_result", {
      p_pet_id: petId,
      p_title: title,
      p_result: resultRows,
      p_notes: notes,
      p_performed_at: performedAt ? new Date(performedAt).toISOString() : new Date().toISOString(),
    });
    if (recordError || !record) throw recordError || new Error("تعذر حفظ نتيجة التحليل.");
    const savedRecord = Array.isArray(record) ? record[0] : record;
    const { data: attachment, error: attachmentError } = await tenantDb.rpc("vetra_attach_pet_lab_file", {
      p_record_id: savedRecord.id,
      p_file_name: file.name,
      p_storage_path: uploadedPath,
      p_mime_type: file.type,
      p_size_bytes: file.size,
    });
    if (attachmentError) throw attachmentError;
    return Response.json({ record: savedRecord, attachment: Array.isArray(attachment) ? attachment[0] : attachment }, { status: 201 });
  } catch (error) {
    if (uploadedPath) {
      try { await getCoreAdminClient().storage.from(bucket).remove([uploadedPath]); } catch { /* keep original error */ }
    }
    return errorResponse(error);
  }
}
