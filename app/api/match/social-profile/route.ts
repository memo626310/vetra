import { PushSetupError } from "@/lib/push-server";
import { ensureSocialProfile, getSocialAdmin, socialActor, socialResponseError } from "@/lib/match-social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadProfile(request: Request, body: Record<string, unknown> = {}) {
  try {
    const actor = await socialActor(request, body);
    const admin = getSocialAdmin();
    const profile = await ensureSocialProfile(admin, actor);
    const [{ count: followers }, { count: following }, { count: posts }] = await Promise.all([
      admin.from("vetra_match_follows").select("follower_key", { count: "exact", head: true }).eq("following_key", actor.key),
      admin.from("vetra_match_follows").select("following_key", { count: "exact", head: true }).eq("follower_key", actor.key),
      admin.from("vetra_match_posts").select("id", { count: "exact", head: true }).eq("author_key", actor.key).eq("status", "published"),
    ]);
    return Response.json({ profile, stats: { followers: followers || 0, following: following || 0, posts: posts || 0 } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return socialResponseError(error);
  }
}

export async function GET(request: Request) {
  return loadProfile(request);
}

export async function POST(request: Request) {
  try {
    return loadProfile(request, await request.json() as Record<string, unknown>);
  } catch (error) {
    return socialResponseError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const actor = await socialActor(request, body);
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const bio = typeof body.bio === "string" ? body.bio.trim() : "";
    const city = typeof body.city === "string" ? body.city.trim().slice(0, 100) : null;
    if (displayName.length < 2 || displayName.length > 80 || bio.length > 500) throw new PushSetupError("راجع الاسم والوصف قبل الحفظ.", 400);
    const admin = getSocialAdmin();
    const { data, error } = await admin.from("vetra_match_social_profiles").upsert({ owner_key: actor.key, display_name: displayName, bio, city: city || null, is_public: body.isPublic !== false, updated_at: new Date().toISOString() }, { onConflict: "owner_key" }).select("owner_key,display_name,bio,city,avatar_path,is_public,created_at,updated_at").single();
    if (error) throw error;
    if (actor.externalUserId) {
      const { error: syncError } = await admin.from("vetra_match_profiles").update({ display_name: displayName, updated_at: new Date().toISOString() }).eq("user_id", actor.externalUserId);
      if (syncError) throw syncError;
    }
    return Response.json({ profile: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return socialResponseError(error);
  }
}
