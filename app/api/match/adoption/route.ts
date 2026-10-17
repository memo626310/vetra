import { vetraCore } from "@/lib/vetra-core";
import { getCoreAdminClient } from "@/lib/push-server";
import { matchError, resolveMatchActor } from "@/lib/match-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await vetraCore
    .from("vetra_adoption_listings")
    .select("id,name,species,breed,color,age_label,gender,city,description,photo_url,is_demo,created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("VETRA ADOPTION LISTINGS ERROR:", error);
    return Response.json(
      { error: "تعذر تحميل ملفات التبني. تأكد من تطبيق ترحيل قاعدة البيانات." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return Response.json({ listings: data || [] }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const actor = await resolveMatchActor(request, body);
    const admin = getCoreAdminClient();
    const [{ data: rows, error }, { data: blocks, error: blocksError }, { data: blockedBy, error: blockedByError }] = await Promise.all([
      admin.from("vetra_adoption_listings").select("id,name,species,breed,color,age_label,gender,city,description,photo_url,is_demo,created_at,owner_key").eq("status", "published").order("created_at", { ascending: false }),
      admin.from("vetra_match_blocks").select("blocked_owner_key").eq("owner_key", actor.key),
      admin.from("vetra_match_blocks").select("owner_key").eq("blocked_owner_key", actor.key),
    ]);
    if (error) throw error;
    if (blocksError) throw blocksError;
    if (blockedByError) throw blockedByError;
    const hidden = new Set([...(blocks || []).map((x) => x.blocked_owner_key), ...(blockedBy || []).map((x) => x.owner_key)]);
    const listings = (rows || []).filter((row) => row.owner_key !== actor.key && (!row.owner_key || !hidden.has(row.owner_key))).map((row) => {
      const publicRow = { ...row };
      delete publicRow.owner_key;
      return publicRow;
    });
    return Response.json({ listings }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return matchError(error); }
}
