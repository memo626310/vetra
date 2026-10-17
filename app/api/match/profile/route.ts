import { getCoreAdminClient } from "@/lib/push-server";
import { matchError } from "@/lib/match-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

async function verifiedUser(request: Request) {
  const token = getToken(request);
  if (!token) throw Object.assign(new Error("Verify your email to continue."), { status: 401 });
  const url = process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_PUBLISHABLE_KEY!;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user || !data.user.email_confirmed_at) throw Object.assign(new Error("Verify your email before continuing."), { status: 401 });
  return data.user;
}

export async function GET(request: Request) {
  try {
    const user = await verifiedUser(request);
    const admin = getCoreAdminClient();
    const [{ data: profile, error: profileError }, { data: pets, error: petsError }] = await Promise.all([
      admin.from("vetra_match_profiles").select("user_id,display_name,created_at").eq("user_id", user.id).maybeSingle(),
      admin.from("vetra_match_pets").select("id,name,species,breed,color,birth_date,gender,city,description,photo_path,created_at").eq("owner_user_id", user.id).order("created_at", { ascending: false }),
    ]);
    if (profileError) throw profileError;
    if (petsError) throw petsError;
    if (!profile) return Response.json({ profile: null, pets: [] }, { headers: { "Cache-Control": "no-store" } });
    const withPhotos = await Promise.all((pets || []).map(async (pet) => {
      const photo_url = pet.photo_path ? admin.storage.from("vetra-match-pets").getPublicUrl(pet.photo_path).data.publicUrl : null;
      return { ...pet, photo_url };
    }));
    return Response.json({ profile, pets: withPhotos }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    if (status !== 500) return Response.json({ error: error instanceof Error ? error.message : "Unauthorized." }, { status });
    return matchError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await verifiedUser(request);
    const body = await request.json() as Record<string, unknown>;
    const admin = getCoreAdminClient();
    const action = body.action;
    if (action === "profile") {
      const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
      const { data: existing } = await admin.from("vetra_match_profiles").select("user_id,display_name").eq("user_id", user.id).maybeSingle();
      if (displayName.length < 2 || displayName.length > 80) return Response.json({ error: "اكتب اسمًا من حرفين إلى ٨٠ حرفًا." }, { status: 400 });
      if (!existing && body.termsAccepted !== true) return Response.json({ error: "يجب الموافقة على شروط الاستخدام وسياسة الخصوصية لإنشاء الحساب." }, { status: 400 });
      if (!existing && body.adultConfirmed !== true) return Response.json({ error: "يجب تأكيد أن عمرك ١٨ عامًا أو أكثر." }, { status: 400 });
      const profileData: Record<string, unknown> = { user_id: user.id, display_name: displayName };
      if (!existing) { profileData.terms_version = "2026-10-v1"; profileData.terms_accepted_at = new Date().toISOString(); profileData.adult_confirmed_at = new Date().toISOString(); }
      const { data, error } = await admin.from("vetra_match_profiles").upsert(profileData, { onConflict: "user_id" }).select("user_id,display_name,terms_version,terms_accepted_at").single();
      if (error) throw error;
      return Response.json({ profile: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    if (action === "add-pet") {
      const value = (key: string, max: number) => typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max) : "";
      const species = value("species", 10);
      const name = value("name", 80);
      const city = value("city", 100);
      const description = value("description", 1200);
      const gender = value("gender", 10) || "unknown";
      if (!["cat", "dog", "other"].includes(species) || name.length < 1 || city.length < 2 || description.length < 10 || !["male", "female", "unknown"].includes(gender)) {
        return Response.json({ error: "راجع اسم الحيوان ونوعه ومدينة الإقامة والوصف." }, { status: 400 });
      }
      const birthDate = value("birth_date", 10);
      if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return Response.json({ error: "تاريخ الميلاد غير صحيح." }, { status: 400 });
      const photoPath = typeof body.photo_path === "string" && body.photo_path.startsWith(`${user.id}/`) ? body.photo_path : null;
      const { data, error } = await admin.from("vetra_match_pets").insert({
        owner_user_id: user.id, name, species, breed: value("breed", 100) || null, color: value("color", 100) || null,
        birth_date: birthDate || null, gender, city, description, photo_path: photoPath,
      }).select("id,name,species,breed,color,birth_date,gender,city,description,photo_path,created_at").single();
      if (error) throw error;
      const photo_url = data.photo_path ? admin.storage.from("vetra-match-pets").getPublicUrl(data.photo_path).data.publicUrl : null;
      return Response.json({ pet: { ...data, photo_url } }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "الإجراء غير مدعوم." }, { status: 400 });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    if (status !== 500) return Response.json({ error: error instanceof Error ? error.message : "Unauthorized." }, { status });
    return matchError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await verifiedUser(request);
    const admin = getCoreAdminClient();
    const key = `user:${user.id}`;
    const { data: files, error: fileListError } = await admin.storage.from("vetra-match-pets").list(user.id, { limit: 1000 });
    if (fileListError) throw fileListError;
    if (files?.length) {
      const { error } = await admin.storage.from("vetra-match-pets").remove(files.map((file) => `${user.id}/${file.name}`));
      if (error) throw error;
    }
    const cleanup = await Promise.all([
      admin.from("vetra_match_messages").delete().eq("sender_key", key),
      admin.from("vetra_match_interactions").delete().eq("actor_key", key),
      admin.from("vetra_match_reports").delete().eq("reporter_key", key),
      admin.from("vetra_match_notifications").delete().or(`recipient_key.eq.${key},actor_key.eq.${key}`),
      admin.from("vetra_match_blocks").delete().or(`owner_key.eq.${key},blocked_owner_key.eq.${key}`),
      admin.from("vetra_match_threads").delete().or(`requester_key.eq.${key},listing_owner_key.eq.${key}`),
    ]);
    const failure = cleanup.find((result) => result.error)?.error;
    if (failure) throw failure;
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    if (status !== 500) return Response.json({ error: error instanceof Error ? error.message : "Unauthorized." }, { status });
    return matchError(error);
  }
}
