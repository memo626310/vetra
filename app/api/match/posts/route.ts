import { PushSetupError } from "@/lib/push-server";
import { ensureSocialProfile, getSocialAdmin, getSocialFeed, socialActor, socialResponseError, type SocialPostType } from "@/lib/match-social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postTypes: SocialPostType[] = ["story", "care", "question", "adoption", "breeding"];

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const actor = await socialActor(request, body);
    const admin = getSocialAdmin();
    const action = body.action || "create";

    if (action === "create") {
      const text = typeof body.body === "string" ? body.body.trim() : "";
      const postType = typeof body.postType === "string" && postTypes.includes(body.postType as SocialPostType)
        ? body.postType
        : "story";
      if (text.length < 1 || text.length > 2000) {
        throw new PushSetupError("اكتب منشورًا من حرف واحد إلى ٢٠٠٠ حرف.", 400);
      }
      const petName = typeof body.petName === "string" ? body.petName.trim().slice(0, 80) : null;
      const petSpecies = typeof body.petSpecies === "string" && ["dog", "cat", "other"].includes(body.petSpecies) ? body.petSpecies : null;
      const mediaPath = typeof body.mediaPath === "string" && body.mediaPath.startsWith(`${actor.key}/`) ? body.mediaPath : null;
      const profile = await ensureSocialProfile(admin, actor);
      const { data, error } = await admin.from("vetra_match_posts").insert({
        author_key: actor.key,
        author_display_name: profile.display_name,
        body: text,
        post_type: postType,
        pet_name: petName,
        pet_species: petSpecies,
        media_path: mediaPath,
      }).select("id,author_key,author_display_name,body,post_type,pet_name,pet_species,media_path,created_at,updated_at").single();
      if (error) throw error;
      return Response.json({ post: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    if (action === "delete") {
      const postId = typeof body.postId === "string" ? body.postId : "";
      if (!postId) throw new PushSetupError("المنشور المطلوب غير موجود.", 400);
      const { data: post, error: lookupError } = await admin.from("vetra_match_posts").select("id,author_key").eq("id", postId).maybeSingle();
      if (lookupError) throw lookupError;
      if (!post || post.author_key !== actor.key) throw new PushSetupError("لا يمكنك حذف هذا المنشور.", 403);
      const { error } = await admin.from("vetra_match_posts").update({ status: "removed", updated_at: new Date().toISOString() }).eq("id", postId);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    if (action === "my-posts") {
      const feed = await getSocialFeed(admin, actor, 80);
      return Response.json({ posts: feed.posts.filter((post) => post.isMine) }, { headers: { "Cache-Control": "private, no-store" } });
    }

    throw new PushSetupError("الإجراء غير مدعوم.", 400);
  } catch (error) {
    return socialResponseError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    body.action = "delete";
    return POST(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }));
  } catch (error) {
    return socialResponseError(error);
  }
}
