import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCoreAdminClient } from "@/lib/push-server";
import { matchError, resolveMatchActor, type MatchActor } from "@/lib/match-server";

export type SocialPostType = "story" | "care" | "question" | "adoption" | "breeding";

export function socialActor(request: Request, body: Record<string, unknown> = {}) {
  return resolveMatchActor(request, body);
}

export function socialResponseError(error: unknown) {
  return matchError(error);
}

export async function ensureSocialProfile(admin: SupabaseClient, actor: MatchActor) {
  const { data: existing, error: lookupError } = await admin
    .from("vetra_match_social_profiles")
    .select("owner_key,display_name,bio,city,avatar_path,is_public,created_at,updated_at")
    .eq("owner_key", actor.key)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing;

  const { data, error } = await admin
    .from("vetra_match_social_profiles")
    .insert({ owner_key: actor.key, display_name: actor.displayName || "VETRA Member" })
    .select("owner_key,display_name,bio,city,avatar_path,is_public,created_at,updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function getSocialFeed(admin: SupabaseClient, actor: MatchActor, limit = 40) {
  const safeLimit = Math.max(1, Math.min(80, Math.floor(limit)));
  const [{ data: posts, error: postsError }, { data: blocks, error: blocksError }, { data: following, error: followingError }] = await Promise.all([
    admin.from("vetra_match_posts")
      .select("id,author_key,author_display_name,body,post_type,pet_name,pet_species,media_path,created_at,updated_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(safeLimit),
    admin.from("vetra_match_blocks").select("owner_key,blocked_owner_key").or(`owner_key.eq.${actor.key},blocked_owner_key.eq.${actor.key}`),
    admin.from("vetra_match_follows").select("following_key").eq("follower_key", actor.key),
  ]);
  if (postsError) throw postsError;
  if (blocksError) throw blocksError;
  if (followingError) throw followingError;

  const hiddenAuthors = new Set<string>();
  for (const block of blocks || []) {
    if (block.owner_key === actor.key) hiddenAuthors.add(block.blocked_owner_key);
    if (block.blocked_owner_key === actor.key) hiddenAuthors.add(block.owner_key);
  }
  const visiblePosts = (posts || []).filter((post) => !hiddenAuthors.has(post.author_key));
  const postIds = visiblePosts.map((post) => post.id);
  if (!postIds.length) return { posts: [], following: (following || []).map((row) => row.following_key) };

  const [{ data: likes, error: likesError }, { data: comments, error: commentsError }, { data: saved, error: savedError }] = await Promise.all([
    admin.from("vetra_match_post_likes").select("post_id,actor_key").in("post_id", postIds),
    admin.from("vetra_match_post_comments").select("id,post_id,author_key,author_display_name,body,created_at").in("post_id", postIds).eq("status", "published").order("created_at", { ascending: true }),
    admin.from("vetra_match_saved_posts").select("post_id").eq("actor_key", actor.key).in("post_id", postIds),
  ]);
  if (likesError) throw likesError;
  if (commentsError) throw commentsError;
  if (savedError) throw savedError;

  const likesByPost = new Map<string, Array<{ actor_key: string }>>();
  for (const like of likes || []) likesByPost.set(like.post_id, [...(likesByPost.get(like.post_id) || []), like]);
  const commentsByPost = new Map<string, typeof comments>();
  for (const comment of comments || []) commentsByPost.set(comment.post_id, [...(commentsByPost.get(comment.post_id) || []), comment]);
  const savedIds = new Set((saved || []).map((row) => row.post_id));
  const followingIds = new Set((following || []).map((row) => row.following_key));

  return {
    posts: visiblePosts.map((post) => ({
      ...post,
      media_url: post.media_path ? admin.storage.from("vetra-match-pets").getPublicUrl(post.media_path).data.publicUrl : null,
      likeCount: likesByPost.get(post.id)?.length || 0,
      likedByMe: likesByPost.get(post.id)?.some((like) => like.actor_key === actor.key) || false,
      savedByMe: savedIds.has(post.id),
      isMine: post.author_key === actor.key,
      isFollowingAuthor: post.author_key === actor.key || followingIds.has(post.author_key),
      comments: (commentsByPost.get(post.id) || []).slice(-30),
    })),
    following: [...followingIds],
  };
}

export async function notifySocial(admin: SupabaseClient, recipientKey: string, actorKey: string, eventType: "follow" | "post_like" | "comment", threadId: string | null = null) {
  if (recipientKey === actorKey) return;
  const { error } = await admin.from("vetra_match_notifications").insert({
    recipient_key: recipientKey,
    actor_key: actorKey,
    event_type: eventType,
    thread_id: threadId,
  });
  if (error) throw error;
}

export function getSocialAdmin() {
  return getCoreAdminClient();
}
