import {
  getCoreAdminClient,
  PushSetupError,
  resolveClinicPushContext,
  sendPushBatch,
} from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const petId = typeof body.petId === "string" ? body.petId : "";
    const vaccine = typeof body.vaccine === "string" ? body.vaccine.trim() : "";
    const dueDate = typeof body.dueDate === "string" ? body.dueDate : "";
    const missingDose = body.missingDose === true;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const language = body.language === "en" ? "en" : "ar";
    if (!petId || petId.length > 80 || !vaccine || vaccine.length > 120 || (!missingDose && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) || notes.length > 300) {
      throw new PushSetupError("The vaccination reminder is invalid.");
    }
    if (dueDate) {
      const date = new Date(`${dueDate}T00:00:00Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dueDate) {
        throw new PushSetupError("The due date is invalid.");
      }
    }

    const { clinicId, clinicDb } = await resolveClinicPushContext(request);
    const { data: pet, error: petError } = await clinicDb
      .from("pets")
      .select("id,name,client_id")
      .eq("id", petId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (petError || !pet || !pet.client_id) {
      throw new PushSetupError("The pet owner could not be verified for this clinic.", 404);
    }

    const admin = getCoreAdminClient();
    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("vetra_push_subscriptions")
      .select("endpoint,subscription")
      .eq("audience", "owner")
      .eq("clinic_id", clinicId)
      .eq("owner_client_id", pet.client_id);
    if (subscriptionsError) throw subscriptionsError;
    if (!subscriptions?.length) {
      return Response.json({ success: false, error: "NO_ACTIVE_SUBSCRIPTION" }, { status: 409 });
    }

    const vaccineText = vaccine.slice(0, 120);
    const petName = String(pet.name || (language === "ar" ? "حيوانك الأليف" : "your pet"));
    const noteText = notes ? (language === "ar" ? ` ملاحظة العيادة: ${notes}` : ` Clinic note: ${notes}`) : "";
    const message = missingDose
      ? language === "ar"
        ? `تطعيم ${vaccineText} لـ${petName} مطلوب حاليًا ولم يُسجل في سجل التطعيمات.${noteText}`
        : `${petName} is missing the ${vaccineText} vaccination. It is currently due and is not recorded in the vaccination history.${noteText}`
      : language === "ar"
        ? `موعد تطعيم ${vaccineText} لـ${petName} يوم ${dueDate}.${noteText}`
        : `${petName}'s ${vaccineText} vaccination is due on ${dueDate}.${noteText}`;
    const delivered = await sendPushBatch(admin, subscriptions, {
      title: language === "ar" ? "VETRA — تذكير بموعد تطعيم" : "VETRA — Vaccination reminder",
      body: message,
      audience: "owner",
      url: `/client-interface/${encodeURIComponent(pet.client_id)}/vaccinations`,
      tag: `vetra-vaccine-${pet.id}-${dueDate || vaccineText}`,
      renotify: true,
    });
    if (delivered === 0) {
      return Response.json({ success: false, error: "NO_ACTIVE_SUBSCRIPTION" }, { status: 409 });
    }
    return Response.json({ success: true, delivered });
  } catch (error) {
    if (error instanceof PushSetupError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("VETRA VACCINE PUSH ERROR:", error);
    return Response.json({ error: "Could not notify this pet owner." }, { status: 500 });
  }
}
