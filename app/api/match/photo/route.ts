import { randomUUID } from "node:crypto";
import { getCoreAdminClient } from "@/lib/push-server";
import { matchError } from "@/lib/match-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return Response.json({ error: "سجّل الدخول بحساب Tinder مؤكد لرفع الصورة." }, { status: 401 });
    const url = process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_PUBLISHABLE_KEY!;
    const { createClient } = await import("@supabase/supabase-js");
    const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user?.email_confirmed_at) return Response.json({ error: "يجب تأكيد البريد الإلكتروني أولًا." }, { status: 401 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return Response.json({ error: "اختر صورة JPG أو PNG أو WebP بحجم أقل من ٥ ميجابايت." }, { status: 400 });
    }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${data.user.id}/${randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    const isWebp = bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
    if ((file.type === "image/jpeg" && !isJpeg) || (file.type === "image/png" && !isPng) || (file.type === "image/webp" && !isWebp)) return Response.json({ error: "محتوى الصورة لا يطابق نوع الملف." }, { status: 400 });
    const admin = getCoreAdminClient();
    const { data: profile, error: profileError } = await admin.from("vetra_match_profiles").select("user_id").eq("user_id", data.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return Response.json({ error: "أكمل ملف VETRA Tinder قبل رفع الصور." }, { status: 403 });
    const { error: uploadError } = await admin.storage.from("vetra-match-pets").upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const photo_url = admin.storage.from("vetra-match-pets").getPublicUrl(path).data.publicUrl;
    return Response.json({ photo_path: path, photo_url }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return matchError(error); }
}
