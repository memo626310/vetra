import {
  getCoreAdminClient,
  PushSetupError,
  resolveOwnerPushContext,
} from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOL_KEYS = new Set(["viral", "rabies", "deworm", "parasite"]);
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const petId = typeof body.petId === "string" ? body.petId : "";
    const protocolKey = typeof body.protocolKey === "string" ? body.protocolKey : "";
    const dueDate = typeof body.dueDate === "string" ? body.dueDate : "";
    const scheduledAtValue = typeof body.scheduledAt === "string" ? body.scheduledAt : "";
    const language = body.language === "en" ? "en" : "ar";
    if (!petId || petId.length > 80 || !PROTOCOL_KEYS.has(protocolKey) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      throw new PushSetupError("The vaccine reminder details are invalid.");
    }

    const dueAtUtc = Date.parse(`${dueDate}T00:00:00.000Z`);
    const scheduledAt = new Date(scheduledAtValue);
    const now = Date.now();
    if (!Number.isFinite(dueAtUtc)
      || new Date(dueAtUtc).toISOString().slice(0, 10) !== dueDate
      || Number.isNaN(scheduledAt.getTime())) {
      throw new PushSetupError("The vaccine reminder date is invalid.");
    }
    const dueDateIsPast = dueAtUtc < Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    const reminderTime = scheduledAt.getTime();
    const withinDueDateWindow = reminderTime >= dueAtUtc - 18 * 60 * 60 * 1000
      && reminderTime <= dueAtUtc + 42 * 60 * 60 * 1000;
    const nearNowForOverdue = reminderTime >= now - 60_000 && reminderTime <= now + 15 * 60_000;
    if (dueAtUtc > now + 366 * DAY_MS || (dueDateIsPast ? !nearNowForOverdue : !withinDueDateWindow)) {
      throw new PushSetupError("The reminder must be scheduled for its due date.");
    }

    const { identity, tenantDb } = await resolveOwnerPushContext(body);
    const { data: pet, error: petError } = await tenantDb
      .from("pets")
      .select("id,name")
      .eq("id", petId)
      .eq("client_id", identity.ownerClientId)
      .maybeSingle();
    if (petError || !pet) throw new PushSetupError("This pet could not be verified for your account.", 404);

    const reminderKey = `${identity.clinicId}:${identity.ownerClientId}:${pet.id}:${protocolKey}:${dueDate}`;
    const admin = getCoreAdminClient();
    const { error: cancelError } = await admin
      .from("vetra_push_reminders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("clinic_id", identity.clinicId)
      .eq("owner_client_id", identity.ownerClientId)
      .eq("pet_id", pet.id)
      .eq("protocol_key", protocolKey)
      .eq("status", "pending")
      .neq("reminder_key", reminderKey);
    if (cancelError) throw cancelError;

    const { error: saveError } = await admin
      .from("vetra_push_reminders")
      .upsert({
        reminder_key: reminderKey,
        clinic_id: identity.clinicId,
        owner_client_id: identity.ownerClientId,
        pet_id: pet.id,
        pet_name: pet.name,
        protocol_key: protocolKey,
        due_date: dueDate,
        scheduled_at: scheduledAt.toISOString(),
        language,
        status: "pending",
        attempts: 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: "reminder_key" });
    if (saveError) throw saveError;
    return Response.json({ success: true, scheduledAt: scheduledAt.toISOString() });
  } catch (error) {
    if (error instanceof PushSetupError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("VETRA VACCINE REMINDER ERROR:", error);
    return Response.json({ error: "Could not save this vaccine reminder." }, { status: 500 });
  }
}
