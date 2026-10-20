import { randomUUID } from "node:crypto";
import { getSocialAdmin, socialActor, socialResponseError } from "@/lib/match-social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validImage(bytes: Uint8Array, type: string) {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isWebp = bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  return type === "image/jpeg" ? isJpeg : type === "image/png" ? isPng : type === "image/webp" ? isWebp : false;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const body = { clientCode: String(form.get("clientCode") || ""), phone: String(form.get("phone") || "") };
    if (!(file instanceof File) || file.size < 1 || file.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return Response.json({ error: "اختر صورة JPG أو PNG أو WebP بحجم أقل من ٨ ميجابايت." }, { status: 400 });
    }
    const actor = await socialActor(request, body);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validImage(bytes, file.type)) return Response.json({ error: "محتوى الصورة لا يطابق نوع الملف." }, { status: 400 });
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${actor.key}/social/${randomUUID()}.${ext}`;
    const admin = getSocialAdmin();
    const { error } = await admin.storage.from("vetra-match-pets").upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) throw error;
    return Response.json({ media_path: path, media_url: admin.storage.from("vetra-match-pets").getPublicUrl(path).data.publicUrl }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return socialResponseError(error);
  }
}
