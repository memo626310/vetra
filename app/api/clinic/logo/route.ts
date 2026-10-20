import { randomUUID } from "node:crypto";
import { getCoreAdminClient, PushSetupError, resolveClinicPushContext } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bucket = "clinic-branding";
const maxBytes = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function isValidImage(bytes: Uint8Array, type: string) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  return type === "image/jpeg" ? jpeg : type === "image/png" ? png : type === "image/webp" ? webp : false;
}

function respondError(error: unknown) {
  if (error instanceof PushSetupError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  console.error("CLINIC LOGO API ERROR:", error);
  return Response.json({ error: "تعذر تحديث شعار العيادة." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > maxBytes || !allowedTypes.has(file.type)) {
      return Response.json({ error: "اختر صورة PNG أو JPG أو WebP لا يتجاوز حجمها 5 ميجابايت." }, { status: 400 });
    }

    const { clinicId, role } = await resolveClinicPushContext(request);
    if (!["owner", "admin"].includes(role)) throw new PushSetupError("ليس لديك صلاحية لتعديل شعار العيادة.", 403);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isValidImage(bytes, file.type)) return Response.json({ error: "محتوى الصورة لا يطابق نوع الملف." }, { status: 400 });

    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${clinicId}/${randomUUID()}.${extension}`;
    const admin = getCoreAdminClient();
    const { error } = await admin.storage.from(bucket).upload(path, bytes, { contentType: file.type, cacheControl: "3600", upsert: false });
    if (error) throw error;
    const url = admin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    return Response.json({ path, url }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respondError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { clinicId, role } = await resolveClinicPushContext(request);
    if (!["owner", "admin"].includes(role)) throw new PushSetupError("ليس لديك صلاحية لتعديل شعار العيادة.", 403);
    const body = await request.json().catch(() => null) as { path?: unknown } | null;
    if (typeof body?.path !== "string" || !body.path.startsWith(`${clinicId}/`) || body.path.includes("..")) {
      return Response.json({ error: "مسار الشعار غير صالح." }, { status: 400 });
    }
    const { error } = await getCoreAdminClient().storage.from(bucket).remove([body.path]);
    if (error) throw error;
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return respondError(error);
  }
}
