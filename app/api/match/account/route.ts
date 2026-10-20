import { getCoreAdminClient } from "@/lib/push-server";
import { matchError, resolveMatchActor } from "@/lib/match-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const actor = await resolveMatchActor(request, body);
    if (!actor.ownerClientId) return Response.json({ error: "استخدم حذف الحساب المستقل من إعداداته." }, { status: 400 });
    const admin = getCoreAdminClient();
    const work = await Promise.all([
      admin.from("vetra_adoption_listings").delete().eq("owner_key", actor.key),
      admin.from("vetra_breeding_listings").delete().eq("owner_key", actor.key),
      admin.from("vetra_match_interactions").delete().eq("actor_key", actor.key),
      admin.from("vetra_match_reports").delete().eq("reporter_key", actor.key),
      admin.from("vetra_match_notifications").delete().or(`recipient_key.eq.${actor.key},actor_key.eq.${actor.key}`),
      admin.from("vetra_match_blocks").delete().or(`owner_key.eq.${actor.key},blocked_owner_key.eq.${actor.key}`),
      admin.from("vetra_match_threads").delete().or(`requester_key.eq.${actor.key},listing_owner_key.eq.${actor.key}`),
      admin.from("vetra_match_follows").delete().or(`follower_key.eq.${actor.key},following_key.eq.${actor.key}`),
      admin.from("vetra_match_posts").delete().eq("author_key", actor.key),
      admin.from("vetra_match_post_likes").delete().eq("actor_key", actor.key),
      admin.from("vetra_match_saved_posts").delete().eq("actor_key", actor.key),
      admin.from("vetra_match_post_comments").delete().eq("author_key", actor.key),
      admin.from("vetra_match_social_profiles").delete().eq("owner_key", actor.key),
    ]);
    const failed = work.find((result) => result.error)?.error;
    if (failed) throw failed;
    return Response.json({ cleared: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return matchError(error); }
}
