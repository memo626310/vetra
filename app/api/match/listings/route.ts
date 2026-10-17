import { getCoreAdminClient } from "@/lib/push-server";
import { getListingTable, matchError, resolveMatchActor } from "@/lib/match-server";
import { PushSetupError } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ageLabel(date: string | null) {
  if (!date) return "غير معروف";
  const months = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / (30.4375 * 86400000)));
  return months < 24 ? `${months} شهر` : `${Math.floor(months / 12)} سنة`;
}

function normalizeSpecies(value: string) {
  const species = value.trim().toLowerCase();
  if (["cat", "قطة", "قط", "cats"].includes(species)) return "cat";
  if (["dog", "كلب", "كلبة", "dogs"].includes(species)) return "dog";
  return "other";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const actor = await resolveMatchActor(request, body);
    const admin = getCoreAdminClient();
    if (body.action === "my-listings") {
      const [adoption, breeding] = await Promise.all([
        admin.from("vetra_adoption_listings").select("id,name,species,city,status,created_at").eq("owner_key", actor.key).eq("is_demo", false).order("created_at", { ascending: false }),
        admin.from("vetra_breeding_listings").select("id,name,species,city,status,created_at").eq("owner_key", actor.key).eq("is_demo", false).order("created_at", { ascending: false }),
      ]);
      if (adoption.error) throw adoption.error;
      if (breeding.error) throw breeding.error;
      return Response.json({ listings: [...(adoption.data || []).map((row) => ({ ...row, type: "adoption" })), ...(breeding.data || []).map((row) => ({ ...row, type: "breeding" }))] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (body.action === "withdraw") {
      const listingId = typeof body.listingId === "string" ? body.listingId : "";
      const type = body.type;
      const table = getListingTable(type);
      const { data: listing, error: lookupError } = await admin.from(table).select("id,owner_key,status,is_demo").eq("id", listingId).maybeSingle();
      if (lookupError) throw lookupError;
      if (!listing || listing.owner_key !== actor.key || listing.is_demo) throw new PushSetupError("لا يمكنك تعديل هذا الملف.", 403);
      if (listing.status === "adopted") throw new PushSetupError("لا يمكن سحب ملف معلّم بأنه تم تبنيه.", 409);
      const { error } = await admin.from(table).update({ status: "withdrawn" }).eq("id", listingId);
      if (error) throw error;
      return Response.json({ withdrawn: true });
    }
    if (body.action === "complete-adoption") {
      const listingId = typeof body.listingId === "string" ? body.listingId : "";
      const { data: listing, error: lookupError } = await admin.from("vetra_adoption_listings").select("id,owner_key,is_demo,status").eq("id", listingId).maybeSingle();
      if (lookupError) throw lookupError;
      if (!listing || listing.owner_key !== actor.key || listing.is_demo) throw new PushSetupError("لا يمكنك تحديث هذا الملف.", 403);
      const { error } = await admin.from("vetra_adoption_listings").update({ status: "adopted" }).eq("id", listingId);
      if (error) throw error;
      const { error: closeError } = await admin.from("vetra_match_threads").update({ status: "closed" }).eq("listing_id", listingId).eq("listing_type", "adoption").eq("status", "open");
      if (closeError) throw closeError;
      return Response.json({ adopted: true });
    }
    const type = body.type;
    const table = getListingTable(type);
    const petId = typeof body.petId === "string" ? body.petId : "";
    const city = typeof body.city === "string" ? body.city.trim().slice(0, 100) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 1200) : "";
    if (!petId || city.length < 2 || description.length < 10) return Response.json({ error: "اختار حيوانًا وأدخل المدينة ووصفًا من ١٠ أحرف على الأقل." }, { status: 400 });

    let pet: { id: string; name: string; species: string; breed: string | null; gender: string | null; birth_date: string | null; photo_url: string | null; is_deceased?: boolean | null; photo_path?: string | null };
    let sourceMatchPetId: string | null = null;
    if (actor.externalUserId) {
      const { data, error } = await admin.from("vetra_match_pets").select("id,name,species,breed,gender,birth_date,photo_path").eq("id", petId).eq("owner_user_id", actor.externalUserId).maybeSingle();
      if (error) throw error;
      if (!data) throw new PushSetupError("الحيوان غير مرتبط بحسابك.", 403);
      sourceMatchPetId = data.id;
      pet = { ...data, photo_url: data.photo_path ? admin.storage.from("vetra-match-pets").getPublicUrl(data.photo_path).data.publicUrl : null };
    } else {
      const { tenantDb, identity } = await (await import("@/lib/push-server")).resolveOwnerPushContext(body);
      if (identity.ownerClientId !== actor.ownerClientId || identity.clinicId !== actor.clinicId) throw new PushSetupError("لا يمكنك الوصول إلى بيانات هذا الحساب.", 403);
      const { data, error } = await tenantDb.from("pets").select("id,name,species,breed,gender,birth_date,photo_url,is_deceased").eq("id", petId).eq("client_id", actor.ownerClientId).maybeSingle();
      if (error) throw error;
      if (!data) throw new PushSetupError("الحيوان غير مرتبط بحسابك.", 403);
      if (data.is_deceased) throw new PushSetupError("لا يمكن نشر ملف حيوان متوفى.", 409);
      pet = data;
    }

    const species = normalizeSpecies(pet.species || "");
    if (type === "breeding" && species === "other") throw new PushSetupError("التزاوج متاح للقطط أو الكلاب من النوع نفسه فقط.", 400);
    const ownerKey = actor.key;
    const row = {
      name: pet.name, species, breed: pet.breed, color: null, age_label: ageLabel(pet.birth_date),
      gender: ["male", "female"].includes(pet.gender || "") ? pet.gender : "unknown",
      city, description, photo_url: pet.photo_url, status: "pending", is_demo: false,
      owner_key: ownerKey, owner_user_id: actor.externalUserId, owner_client_id: actor.ownerClientId,
      clinic_id: actor.clinicId, source_pet_id: actor.externalUserId ? null : pet.id,
      source_match_pet_id: sourceMatchPetId,
      ...(type === "breeding" ? { health_review_status: "pending", reproductive_review_status: "pending", welfare_review_status: "pending" } : {}),
    };
    const { data: existing, error: existingError } = await admin.from(table).select("id,status").eq("owner_key", ownerKey).eq(actor.externalUserId ? "source_match_pet_id" : "source_pet_id", petId).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return Response.json({ listing: existing, message: "يوجد ملف لهذا الحيوان بالفعل.", alreadySubmitted: true }, { headers: { "Cache-Control": "no-store" } });
    const { data, error } = await admin.from(table).insert(row).select("id,status,name,species,created_at").single();
    if (error) throw error;
    return Response.json({ listing: data, message: "تم إرسال الملف إلى المراجعة. لن يظهر للآخرين قبل الموافقة." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return matchError(error); }
}
