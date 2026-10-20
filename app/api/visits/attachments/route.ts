import { randomUUID } from "node:crypto";
import { PushSetupError, resolveClinicPushContext } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bucket = "visit-attachments";
const maxBytes = 10 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function errorResponse(error: unknown) {
  if (error instanceof PushSetupError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("VISIT ATTACHMENT API ERROR:", error);
  return Response.json({ error: "تعذر رفع المرفق الطبي." }, { status: 500 });
}

export async function POST(request: Request) {
  let uploadedPath = "";
  let clinicDb: Awaited<ReturnType<typeof resolveClinicPushContext>>["clinicDb"] | null = null;
  try {
    const form = await request.formData();
    const file = form.get("file");
    const visitId = String(form.get("visit_id") || "");
    const clientId = String(form.get("client_id") || "");
    const petId = String(form.get("pet_id") || "");
    const category = String(form.get("category") || "analysis");

    if (!(file instanceof File) || !visitId || !clientId || !petId || !["analysis", "xray"].includes(category)) {
      return Response.json({ error: "بيانات المرفق غير مكتملة." }, { status: 400 });
    }
    if (file.size < 1 || file.size > maxBytes || !allowedTypes.has(file.type)) {
      return Response.json({ error: "يسمح بملفات PDF أو الصور بحد أقصى 10 ميجابايت." }, { status: 400 });
    }

    const context = await resolveClinicPushContext(request);
    clinicDb = context.clinicDb;
    const { clinicId } = context;
    const fileName = file.name.replace(/[^\w.-]+/g, "_");
    uploadedPath = `${clinicId}/${petId}/${visitId}/${randomUUID()}-${fileName}`;
    const { error: uploadError } = await clinicDb.storage.from(bucket).upload(uploadedPath, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data, error: metadataError } = await clinicDb.from("visit_attachments").insert({
      clinic_id: clinicId,
      visit_id: visitId,
      client_id: clientId,
      pet_id: petId,
      file_name: file.name,
      storage_path: uploadedPath,
      mime_type: file.type,
      size_bytes: file.size,
      category,
    }).select("id,file_name,storage_path,mime_type,category").single();
    if (metadataError) throw metadataError;

    return Response.json({ attachment: data }, { status: 201 });
  } catch (error) {
    if (uploadedPath) {
      try {
        await clinicDb?.storage.from(bucket).remove([uploadedPath]);
      } catch {
        // Preserve the original upload error.
      }
    }
    return errorResponse(error);
  }
}
