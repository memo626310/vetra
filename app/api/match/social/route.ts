import { PushSetupError } from "@/lib/push-server";
import { getSocialAdmin, notifySocial, socialActor, socialResponseError } from "@/lib/match-social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const actor = await socialActor(request, body);
    const admin = getSocialAdmin();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "like" || action === "save") {
      const postId = typeof body.postId === "string" ? body.postId : "";
      if (!postId) throw new PushSetupError("المنشور المطلوب غير موجود.", 400);
      const { data: post, error: postError } = await admin.from("vetra_match_posts").select("id,author_key,status").eq("id", postId).maybeSingle();
      if (postError) throw postError;
      if (!post || post.status !== "published") throw new PushSetupError("المنشور لم يعد متاحًا.", 404);
      const table = action === "like" ? "vetra_match_post_likes" : "vetra_match_saved_posts";
      const { data: existing, error: existingError } = await admin.from(table).select("post_id").eq("post_id", postId).eq("actor_key", actor.key).maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const { error } = await admin.from(table).delete().eq("post_id", postId).eq("actor_key", actor.key);
        if (error) throw error;
        return Response.json({ active: false });
      }
      const { error } = await admin.from(table).insert({ post_id: postId, actor_key: actor.key });
      if (error) throw error;
      if (action === "like") await notifySocial(admin, post.author_key, actor.key, "post_like");
      return Response.json({ active: true }, { status: 201 });
    }

    if (action === "comment") {
      const postId = typeof body.postId === "string" ? body.postId : "";
      const text = typeof body.body === "string" ? body.body.trim() : "";
      if (!postId || text.length < 1 || text.length > 1000) throw new PushSetupError("اكتب تعليقًا من حرف واحد إلى ١٠٠٠ حرف.", 400);
      const { data: post, error: postError } = await admin.from("vetra_match_posts").select("id,author_key,status").eq("id", postId).maybeSingle();
      if (postError) throw postError;
      if (!post || post.status !== "published") throw new PushSetupError("المنشور لم يعد متاحًا.", 404);
      const profile = await admin.from("vetra_match_social_profiles").select("display_name").eq("owner_key", actor.key).maybeSingle();
      if (profile.error) throw profile.error;
      const { data, error } = await admin.from("vetra_match_post_comments").insert({ post_id: postId, author_key: actor.key, author_display_name: profile.data?.display_name || actor.displayName, body: text }).select("id,post_id,author_key,author_display_name,body,created_at").single();
      if (error) throw error;
      await notifySocial(admin, post.author_key, actor.key, "comment");
      return Response.json({ comment: data }, { status: 201 });
    }

    if (action === "follow") {
      const followingKey = typeof body.ownerKey === "string" ? body.ownerKey : "";
      if (!followingKey || followingKey === actor.key) throw new PushSetupError("لا يمكنك متابعة هذا الحساب.", 400);
      const { data: existing, error: existingError } = await admin.from("vetra_match_follows").select("follower_key").eq("follower_key", actor.key).eq("following_key", followingKey).maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const { error } = await admin.from("vetra_match_follows").delete().eq("follower_key", actor.key).eq("following_key", followingKey);
        if (error) throw error;
        return Response.json({ following: false });
      }
      const { error } = await admin.from("vetra_match_follows").insert({ follower_key: actor.key, following_key: followingKey });
      if (error) throw error;
      await notifySocial(admin, followingKey, actor.key, "follow");
      return Response.json({ following: true }, { status: 201 });
    }

    throw new PushSetupError("الإجراء غير مدعوم.", 400);
  } catch (error) {
    return socialResponseError(error);
  }
}
