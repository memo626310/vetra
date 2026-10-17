import { getCoreAdminClient, PushSetupError, resolveOwnerPushContext } from "@/lib/push-server";
import { matchError, resolveMatchActor } from "@/lib/match-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const actor = await resolveMatchActor(request, body);
    if (actor.externalUserId) {
      const admin = getCoreAdminClient();
      const { data, error } = await admin.from("vetra_match_pets").select("id,name,species,breed,gender,birth_date,photo_path").eq("owner_user_id", actor.externalUserId).order("created_at", { ascending: false });
      if (error) throw error;
      return Response.json({ pets: (data || []).map((pet) => ({ ...pet, is_deceased: false, photo_url: pet.photo_path ? admin.storage.from("vetra-match-pets").getPublicUrl(pet.photo_path).data.publicUrl : null })) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const { identity, tenantDb } = await resolveOwnerPushContext(body);
    if (identity.ownerClientId !== actor.ownerClientId || identity.clinicId !== actor.clinicId) throw new PushSetupError("لا يمكنك الوصول إلى بيانات هذا الحساب.", 403);
    const { data, error } = await tenantDb.from("pets").select("id,name,species,breed,gender,birth_date,photo_url,is_deceased").eq("client_id", actor.ownerClientId).order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ pets: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return matchError(error); }
}
