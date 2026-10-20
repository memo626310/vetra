import { PushSetupError, resolveOwnerPushContext } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: routeClientId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(routeClientId)) {
      return Response.json({ error: "معرّف العميل غير صالح.", code: "INVALID_CLIENT" }, { status: 400 });
    }

    const body = await request.json() as Record<string, unknown>;
    const clientCode = typeof body.clientCode === "string" ? body.clientCode : "";
    const phone = typeof body.phone === "string" ? body.phone : "";
    if (!clientCode || !phone) {
      return Response.json({ error: "سجّل الدخول لعرض حيواناتك.", code: "AUTH_REQUIRED" }, { status: 401 });
    }

    const { identity, tenantDb } = await resolveOwnerPushContext({ clientCode, phone });
    if (identity.ownerClientId !== routeClientId) {
      return Response.json({ error: "لا يمكنك الوصول إلى بيانات هذا الحساب.", code: "OWNER_MISMATCH" }, { status: 403 });
    }

    const action = body.action === "select" ? "select" : "load";
    if (action === "load") {
      const { data, error } = await tenantDb.from("pets")
        .select("id,name,species,breed,gender,birth_date,photo_url,is_deceased")
        .eq("client_id", identity.ownerClientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const pets = (data || []).map((pet) => ({
        ...pet,
        ageYears: pet.birth_date
          ? Math.max(0, Math.floor((Date.now() - new Date(pet.birth_date).getTime()) / (365.2425 * 86_400_000)))
          : null,
      }));
      return Response.json({ pets }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const petId = typeof body.petId === "string" ? body.petId : "";
    const mode = body.mode;
    if (mode !== "breeding" && mode !== "adoption") {
      return Response.json({ error: "اختار نوع الخدمة.", code: "INVALID_SELECTION" }, { status: 400 });
    }

    if (mode === "adoption") {
      return Response.json({
        accepted: true,
        code: "ADOPTION_NOT_CONFIGURED",
        message: "تم التحقق من حسابك. ملفات حيوانات التبني غير مفعّلة للاستكشاف حتى الآن.",
      }, { status: 200, headers: { "Cache-Control": "private, no-store" } });
    }
    if (!petId) {
      return Response.json({ error: "اختار حيوانًا مسجلًا على حسابك.", code: "INVALID_SELECTION" }, { status: 400 });
    }

    const { data: pet, error: petError } = await tenantDb.from("pets")
      .select("id,name,species,is_deceased")
      .eq("id", petId)
      .eq("client_id", identity.ownerClientId)
      .maybeSingle();
    if (petError) throw petError;
    if (!pet) {
      return Response.json({ error: "الحيوان غير مرتبط بحسابك.", code: "PET_NOT_OWNED" }, { status: 403 });
    }
    if (pet.is_deceased) {
      return Response.json({ error: "لا يمكن استخدام ملف حيوان مسجل كمتوفى.", code: "PET_UNAVAILABLE" }, { status: 409 });
    }

    if (mode === "breeding") {
      return Response.json({
        accepted: false,
        code: "VETERINARY_REVIEW_REQUIRED",
        message: "التربية المسؤولة تتطلب بيانات صحية وتناسلية موثّقة ومراجعة طبيب بيطري. هذه البيانات غير متاحة للتحقق حاليًا، لذلك لم نعرض توصية تزاوج.",
      }, { status: 200, headers: { "Cache-Control": "private, no-store" } });
    }

    return Response.json({ accepted: false, code: "INVALID_SELECTION" }, { status: 400 });
  } catch (error) {
    if (error instanceof PushSetupError) {
      return Response.json({ error: error.message, code: error.status === 401 ? "AUTH_REQUIRED" : "ACCOUNT_UNAVAILABLE" }, { status: error.status });
    }
    console.error("VETRA MATCH OWNER API ERROR:", error);
    return Response.json({ error: "تعذر تحميل VETRA Match الآن.", code: "MATCH_REQUEST_FAILED" }, { status: 500 });
  }
}
