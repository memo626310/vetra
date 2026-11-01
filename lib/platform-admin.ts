import { createClient } from "@supabase/supabase-js";
import { getCoreAdminClient, PushSetupError } from "@/lib/push-server";

type PlatformRole = "admin" | "moderator" | "veterinarian";

function readBearer(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

export async function requirePlatformAdmin(request: Request) {
  const token = readBearer(request);
  const url = process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!token || !url || !key) throw new PushSetupError("تسجيل الدخول للوحة المنصة مطلوب.", 401);
  const authClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userResult, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userResult.user) throw new PushSetupError("جلسة الدخول غير صالحة.", 401);
  const admin = getCoreAdminClient();
  const { data: moderator, error: moderatorError } = await admin.from("vetra_match_moderators").select("role,active").eq("user_id", userResult.user.id).maybeSingle();
  if (moderatorError) {
    if (moderatorError.code === "PGRST205") throw new PushSetupError("إعداد مدير المنصة غير مكتمل. طبّق ترحيل مديري المنصة على VETRA Core.", 503);
    throw moderatorError;
  }
  if (!moderator?.active || moderator.role !== "admin") throw new PushSetupError("لوحة التحكم المركزية متاحة لمدير المنصة فقط.", 403);
  return { admin, userId: userResult.user.id, role: moderator.role as PlatformRole };
}
