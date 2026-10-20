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
    const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId : "";
    const eventType = body.eventType === "rescheduled" ? "rescheduled" : "status";
    const requestedStatus = body.status === "confirmed" || body.status === "cancelled" || (eventType === "rescheduled" && body.status === "pending")
      ? body.status
      : null;
    const language = body.language === "en" ? "en" : "ar";
    if (!appointmentId || appointmentId.length > 80 || !requestedStatus || (eventType === "status" && requestedStatus !== "confirmed" && requestedStatus !== "cancelled")) {
      throw new PushSetupError("The appointment update is invalid.");
    }
    if (eventType === "rescheduled" && requestedStatus !== "pending" && requestedStatus !== "confirmed") {
      throw new PushSetupError("Only an active appointment can be rescheduled.");
    }

    const { clinicId, clinicDb } = await resolveClinicPushContext(request);
    const { data: appointment, error: appointmentError } = await clinicDb
      .from("appointments")
      .select("id,clinic_id,client_id,pet_id,appointment_date,start_time,status,updated_at")
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (appointmentError || !appointment || appointment.status !== requestedStatus) {
      throw new PushSetupError("The appointment update could not be verified.", 404);
    }

    const { data: pet } = await clinicDb
      .from("pets")
      .select("name")
      .eq("id", appointment.pet_id)
      .eq("clinic_id", clinicId)
      .maybeSingle();
    const admin = getCoreAdminClient();
    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("vetra_push_subscriptions")
      .select("endpoint,subscription")
      .eq("audience", "owner")
      .eq("clinic_id", clinicId)
      .eq("owner_client_id", appointment.client_id);
    if (subscriptionsError) throw subscriptionsError;
    if (!subscriptions?.length) return Response.json({ success: true, delivered: 0 });

    const eventKey = `owner-appointment-${eventType}-${requestedStatus}:${appointment.id}:${appointment.updated_at || appointment.appointment_date}`;
    const { data: existing, error: existingError } = await admin
      .from("vetra_push_deliveries")
      .select("event_key")
      .eq("event_key", eventKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return Response.json({ success: true, delivered: 0, duplicate: true });

    const date = String(appointment.appointment_date || "");
    const time = String(appointment.start_time || "").slice(0, 5);
    const petName = String(pet?.name || (language === "ar" ? "حيوانك الأليف" : "your pet"));
    const bodyText = eventType === "rescheduled"
      ? language === "ar"
        ? `تم تعديل موعد ${petName} ليوم ${date} الساعة ${time}.`
        : `${petName}'s appointment was updated to ${date} at ${time}.`
      : language === "ar"
        ? requestedStatus === "confirmed"
          ? `تم تأكيد موعد ${petName} يوم ${date} الساعة ${time}.`
          : `تم إلغاء موعد ${petName} يوم ${date} الساعة ${time}.`
        : requestedStatus === "confirmed"
          ? `${petName}'s appointment on ${date} at ${time} is confirmed.`
          : `${petName}'s appointment on ${date} at ${time} was cancelled.`;
    const delivered = await sendPushBatch(admin, subscriptions, {
      title: language === "ar" ? "VETRA — تحديث الموعد" : "VETRA — Appointment update",
      body: bodyText,
      audience: "owner",
      url: `/client-interface/${encodeURIComponent(appointment.client_id)}/appointments`,
      tag: `vetra-appointment-${appointment.id}`,
      renotify: true,
    });

    if (delivered > 0) {
      await admin.from("vetra_push_deliveries").insert({ event_key: eventKey });
    }
    return Response.json({ success: true, delivered });
  } catch (error) {
    if (error instanceof PushSetupError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("VETRA OWNER PUSH ERROR:", error);
    return Response.json({ error: "Could not notify this pet owner." }, { status: 500 });
  }
}
