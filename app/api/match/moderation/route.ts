import { getCoreAdminClient } from "@/lib/push-server";
import { PushSetupError } from "@/lib/push-server";
import { matchError } from "@/lib/match-server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function moderator(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) throw new PushSetupError("Sign in to your approved VETRA moderation account.", 401);
  const url = process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_PUBLISHABLE_KEY!;
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at) throw new PushSetupError("A verified VETRA account is required.", 401);
  const admin = getCoreAdminClient();
  const { data: role, error: roleError } = await admin.from("vetra_match_moderators").select("role,active").eq("user_id", data.user.id).maybeSingle();
  if (roleError || !role?.active) throw new PushSetupError("This account is not authorized to moderate VETRA Tinder.", 403);
  return { admin, userId: data.user.id, role: role.role as string };
}

export async function GET(request: Request) {
  try {
    const { admin, role } = await moderator(request);
    const [adoption, breeding, reports] = await Promise.all([
      admin.from("vetra_adoption_listings").select("id,name,species,breed,city,description,photo_url,status,is_demo,created_at,owner_key").eq("is_demo", false).in("status", ["pending", "published"]).order("created_at", { ascending: true }),
      admin.from("vetra_breeding_listings").select("id,name,species,breed,city,description,photo_url,status,is_demo,gender,health_review_status,reproductive_review_status,welfare_review_status,created_at,owner_key").eq("is_demo", false).in("status", ["pending", "published"]).order("created_at", { ascending: true }),
      admin.from("vetra_match_reports").select("id,target_listing_id,listing_type,reason,status,created_at").in("status", ["open", "reviewing"]).order("created_at", { ascending: true }),
    ]);
    for (const result of [adoption, breeding, reports]) if (result.error) throw result.error;
    return Response.json({ adoption: adoption.data || [], breeding: breeding.data || [], reports: reports.data || [], role }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return matchError(error); }
}

export async function PATCH(request: Request) {
  try {
    const { admin, userId, role } = await moderator(request);
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;
    if (action === "report") {
      const reportId = typeof body.reportId === "string" ? body.reportId : "";
      const decision = body.decision;
      if (!reportId || !["reviewing", "resolved", "dismissed"].includes(String(decision))) return Response.json({ error: "Invalid report review." }, { status: 400 });
      const { error } = await admin.from("vetra_match_reports").update({ status: decision, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", reportId);
      if (error) throw error;
      return Response.json({ updated: true });
    }
    const type = body.type;
    const table = type === "adoption" ? "vetra_adoption_listings" : type === "breeding" ? "vetra_breeding_listings" : null;
    const listingId = typeof body.listingId === "string" ? body.listingId : "";
    const decision = body.decision;
    if (!table || !listingId || !["approve", "reject", "unpublish"].includes(String(decision))) return Response.json({ error: "Invalid listing review." }, { status: 400 });
    if (decision === "approve" && type === "breeding" && !["veterinarian", "admin"].includes(role)) return Response.json({ error: "Only an approved veterinarian or platform admin can approve breeding eligibility." }, { status: 403 });
    if (type === "breeding" && decision === "approve" && !(body.healthReviewed === true && body.reproductiveReviewed === true && body.welfareReviewed === true)) {
      return Response.json({ error: "Health, reproductive fitness, and animal welfare checks must all pass before breeding approval." }, { status: 400 });
    }
    if (type === "breeding" && decision === "approve") {
      const { data: listing, error: listingError } = await admin.from("vetra_breeding_listings").select("species,gender,is_demo").eq("id", listingId).maybeSingle();
      if (listingError) throw listingError;
      if (!listing || listing.is_demo || !["cat", "dog"].includes(listing.species) || !["male", "female"].includes(listing.gender)) {
        return Response.json({ error: "Only real cat or dog profiles with a verified sex can be approved for breeding." }, { status: 409 });
      }
    }
    const update: Record<string, unknown> = {
      status: decision === "approve" ? "published" : decision === "reject" ? "rejected" : "pending",
      reviewed_by: userId, reviewed_at: new Date().toISOString(),
      moderation_note: typeof body.note === "string" ? body.note.trim().slice(0, 1000) : null,
    };
    if (type === "breeding") Object.assign(update, {
      health_review_status: decision === "approve" && body.healthReviewed === true ? "approved" : decision === "reject" ? "rejected" : "pending",
      reproductive_review_status: decision === "approve" && body.reproductiveReviewed === true ? "approved" : decision === "reject" ? "rejected" : "pending",
      welfare_review_status: decision === "approve" && body.welfareReviewed === true ? "approved" : decision === "reject" ? "rejected" : "pending",
      health_reviewed_at: decision === "approve" ? new Date().toISOString() : null,
    });
    const { error } = await admin.from(table).update(update).eq("id", listingId).eq("is_demo", false);
    if (error) throw error;
    return Response.json({ updated: true });
  } catch (error) { return matchError(error); }
}
