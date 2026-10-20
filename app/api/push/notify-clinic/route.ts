import {
  getCoreAdminClient,
  PushSetupError,
  resolveOwnerPushContext,
  sendPushBatch,
} from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId : "";
    const eventType = body.eventType === "rescheduled" || body.eventType === "cancelled"
      ? body.eventType
      : "requested";
    const language = body.language === "en" ? "en" : "ar";
    if (!appointmentId || appointmentId.length > 80) {
      throw new PushSetupError("The appointment reference is invalid.");
    }

    const { identity, tenantDb } = await resolveOwnerPushContext(body);
    const { data: appointment, error: appointmentError } = await tenantDb
      .from("appointments")
      .select("id,pet_id,appointment_date,start_time,status,source,updated_at")
      .eq("id", appointmentId)
      .eq("client_id", identity.ownerClientId)
      .maybeSingle();
    if (appointmentError || !appointment || appointment.source !== "client_portal") {
      throw new PushSetupError("The appointment could not be verified for this owner.", 404);
    }
    if ((eventType === "requested" && appointment.status !== "pending")
      || (eventType === "cancelled" && appointment.status !== "cancelled")
      || (eventType === "rescheduled" && appointment.status !== "pending" && appointment.status !== "confirmed")) {
      throw new PushSetupError("This appointment event could not be verified.", 409);
    }

    const { data: pet } = await tenantDb
      .from("pets")
      .select("name")
      .eq("id", appointment.pet_id)
      .eq("client_id", identity.ownerClientId)
      .maybeSingle();
    const admin = getCoreAdminClient();
    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("vetra_push_subscriptions")
      .select("endpoint,subscription")
      .eq("audience", "clinic")
      .eq("clinic_id", identity.clinicId);
    if (subscriptionsError) throw subscriptionsError;
    if (!subscriptions?.length) return Response.json({ success: true, delivered: 0 });

    const eventKey = `clinic-${eventType}:${appointment.id}:${appointment.updated_at || appointment.appointment_date}`;
    const { data: existing, error: existingError } = await admin
      .from("vetra_push_deliveries")
      .select("event_key")
      .eq("event_key", eventKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return Response.json({ success: true, delivered: 0, duplicate: true });

    const isReschedule = eventType === "rescheduled";
    const date = String(appointment.appointment_date || "");
    const time = String(appointment.start_time || "").slice(0, 5);
    const petName = String(pet?.name || "your pet");
    const bodyText = language === "ar"
      ? eventType === "cancelled"
        ? `ألغى صاحب الحيوان موعد ${petName} يوم ${date} الساعة ${time}.`
        : `${isReschedule ? "تم تعديل موعد" : "طلب حجز جديد لـ"} ${petName} يوم ${date} الساعة ${time}.`
      : eventType === "cancelled"
        ? `The owner cancelled ${petName}'s appointment on ${date} at ${time}.`
        : `${isReschedule ? "Appointment updated for" : "New appointment request for"} ${petName} on ${date} at ${time}.`;
    const delivered = await sendPushBatch(admin, subscriptions, {
      title: language === "ar" ? "VETRA — المواعيد" : "VETRA — Appointments",
      body: bodyText,
      audience: "clinic",
      url: "/appointments",
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
    console.error("VETRA CLINIC PUSH ERROR:", error);
    return Response.json({ error: "Could not notify this clinic." }, { status: 500 });
  }
}
