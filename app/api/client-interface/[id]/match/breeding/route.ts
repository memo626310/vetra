import { PushSetupError, getCoreAdminClient, resolveOwnerPushContext } from "@/lib/push-server";
import { resolveMatchActor } from "@/lib/match-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeSpecies(value: string) {
  const species = value.trim().toLowerCase();
  if (["cat", "قطة", "قط", "cats"].includes(species)) return "cat";
  if (["dog", "كلب", "كلبة", "dogs"].includes(species)) return "dog";
  return "other";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: routeClientId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const petId = typeof body.petId === "string" ? body.petId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(routeClientId) || !petId) {
      return Response.json({ error: "اختار حيوانًا مسجلًا على حسابك.", code: "INVALID_SELECTION" }, { status: 400 });
    }
    const actor = await resolveMatchActor(request, body);
    let pet: { id: string; species: string; gender: string | null; is_deceased: boolean | null } | null = null;
    if (actor.externalUserId) {
      const admin = getCoreAdminClient();
      const { data, error } = await admin.from("vetra_match_pets").select("id,species,gender").eq("id", petId).eq("owner_user_id", actor.externalUserId).maybeSingle();
      if (error) throw error;
      pet = data ? { ...data, is_deceased: false } : null;
    } else {
      const { identity, tenantDb } = await resolveOwnerPushContext(body);
      if (identity.ownerClientId !== routeClientId || identity.ownerClientId !== actor.ownerClientId || identity.clinicId !== actor.clinicId) {
        return Response.json({ error: "لا يمكنك الوصول إلى بيانات هذا الحساب.", code: "OWNER_MISMATCH" }, { status: 403 });
      }
      const { data, error } = await tenantDb.from("pets").select("id,species,gender,is_deceased").eq("id", petId).eq("client_id", identity.ownerClientId).maybeSingle();
      if (error) throw error;
      pet = data;
    }
    if (!pet) return Response.json({ error: "الحيوان غير مرتبط بحسابك.", code: "PET_NOT_OWNED" }, { status: 403 });
    if (pet.is_deceased) return Response.json({ error: "لا يمكن استخدام ملف حيوان مسجل كمتوفى.", code: "PET_UNAVAILABLE" }, { status: 409 });
    const species = normalizeSpecies(pet.species || "");
    if (species === "other") return Response.json({ listings: [], sourceSpecies: species, message: "التزاوج متاح للقطط أو الكلاب من النوع نفسه فقط." }, { headers: { "Cache-Control": "private, no-store" } });
    const otherGender = pet.gender === "male" ? "female" : pet.gender === "female" ? "male" : "";
    if (!otherGender) return Response.json({ listings: [], sourceSpecies: species, message: "يلزم تسجيل جنس الحيوان ومراجعته قبل عرض ملفات التزاوج." }, { headers: { "Cache-Control": "private, no-store" } });

    const admin = getCoreAdminClient();
    const [{ data, error }, { data: blocks, error: blocksError }, { data: blockedBy, error: blockedByError }] = await Promise.all([
      admin.from("vetra_breeding_listings")
        .select("id,name,species,breed,color,age_label,gender,city,description,photo_url,is_demo,health_review_status,reproductive_review_status,welfare_review_status,owner_key")
        .eq("species", species).eq("gender", otherGender).eq("status", "published")
        .or("and(is_demo.eq.false,health_review_status.eq.approved,reproductive_review_status.eq.approved,welfare_review_status.eq.approved),is_demo.eq.true")
        .order("created_at", { ascending: false }),
      admin.from("vetra_match_blocks").select("blocked_owner_key").eq("owner_key", actor.key),
      admin.from("vetra_match_blocks").select("owner_key").eq("blocked_owner_key", actor.key),
    ]);
    if (error) throw error;
    if (blocksError) throw blocksError;
    if (blockedByError) throw blockedByError;
    const hidden = new Set([...(blocks || []).map((row) => row.blocked_owner_key), ...(blockedBy || []).map((row) => row.owner_key)]);
    const visible = (data || []).filter((row) => row.owner_key !== actor.key && (!row.owner_key || !hidden.has(row.owner_key))).map((row) => {
      const publicRow = { ...row };
      delete publicRow.owner_key;
      return publicRow;
    });
    return Response.json({ listings: visible, sourceSpecies: species, demoOnly: visible.every((listing) => listing.is_demo) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof PushSetupError) return Response.json({ error: error.message, code: error.status === 401 ? "AUTH_REQUIRED" : "ACCOUNT_UNAVAILABLE" }, { status: error.status });
    console.error("VETRA BREEDING LISTINGS ERROR:", error);
    return Response.json({ error: "تعذر تحميل ملفات التزاوج الآن.", code: "BREEDING_LISTINGS_FAILED" }, { status: 503 });
  }
}
