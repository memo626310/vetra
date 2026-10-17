import {
  getCoreAdminClient,
  sendPushBatch,
} from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function protocolName(key: string, language: string) {
  const names: Record<string, { ar: string; en: string }> = {
    viral: { ar: "التطعيم الفيروسي", en: "viral vaccine" },
    rabies: { ar: "تطعيم السعار", en: "rabies vaccine" },
    deworm: { ar: "جرعة الديدان", en: "deworming dose" },
    parasite: { ar: "مكافحة الطفيليات", en: "parasite control" },
  };
  return names[key]?.[language === "en" ? "en" : "ar"] || (language === "en" ? "vaccine" : "التطعيم");
}

async function dispatch(request: Request) {
  const authorization = request.headers.get("authorization");
  const allowedSecrets = [process.env.CRON_SECRET, process.env.VETRA_PUSH_CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (!allowedSecrets.some((secret) => authorization === `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const admin = getCoreAdminClient();
    const now = new Date();
    const { error: recoverError } = await admin
      .from("vetra_push_reminders")
      .update({ status: "pending", updated_at: now.toISOString() })
      .eq("status", "sending")
      .lt("updated_at", new Date(now.getTime() - 15 * 60_000).toISOString());
    if (recoverError) throw recoverError;

    const { data: dueReminders, error: remindersError } = await admin
      .from("vetra_push_reminders")
      .select("id,clinic_id,owner_client_id,pet_id,pet_name,protocol_key,due_date,language,attempts")
      .eq("status", "pending")
      .lte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(100);
    if (remindersError) throw remindersError;

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const reminder of dueReminders || []) {
      const nextAttempt = Number(reminder.attempts || 0) + 1;
      const { data: claim, error: claimError } = await admin
        .from("vetra_push_reminders")
        .update({ status: "sending", attempts: nextAttempt, updated_at: new Date().toISOString() })
        .eq("id", reminder.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claim) continue;

      const { data: subscriptions, error: subscriptionsError } = await admin
        .from("vetra_push_subscriptions")
        .select("endpoint,subscription")
        .eq("audience", "owner")
        .eq("clinic_id", reminder.clinic_id)
        .eq("owner_client_id", reminder.owner_client_id);
      if (subscriptionsError) throw subscriptionsError;
      if (!subscriptions?.length) {
        await admin.from("vetra_push_reminders").update({
          status: "skipped",
          updated_at: new Date().toISOString(),
        }).eq("id", reminder.id);
        skipped += 1;
        continue;
      }

      const language = reminder.language === "en" ? "en" : "ar";
      const vaccineName = protocolName(reminder.protocol_key, language);
      const body = language === "ar"
        ? `موعد ${vaccineName} لـ ${reminder.pet_name} يوم ${reminder.due_date}.`
        : `${vaccineName} for ${reminder.pet_name} is due on ${reminder.due_date}.`;
      const delivered = await sendPushBatch(admin, subscriptions, {
        title: language === "ar" ? "VETRA — تذكير رعاية" : "VETRA — Care reminder",
        body,
        audience: "owner",
        url: `/client-interface/${encodeURIComponent(reminder.owner_client_id)}/vaccinations?pet=${encodeURIComponent(reminder.pet_id)}`,
        tag: `vetra-vaccine-${reminder.pet_id}-${reminder.protocol_key}`,
        renotify: true,
      });

      if (delivered > 0) {
        const { error } = await admin.from("vetra_push_reminders").update({
          status: "sent",
          updated_at: new Date().toISOString(),
        }).eq("id", reminder.id);
        if (error) throw error;
        sent += 1;
      } else if (nextAttempt < 3) {
        const { error } = await admin.from("vetra_push_reminders").update({
          status: "pending",
          scheduled_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", reminder.id);
        if (error) throw error;
      } else {
        const { error } = await admin.from("vetra_push_reminders").update({
          status: "failed",
          updated_at: new Date().toISOString(),
        }).eq("id", reminder.id);
        if (error) throw error;
        failed += 1;
      }
    }

    return Response.json({ success: true, processed: (dueReminders || []).length, sent, skipped, failed });
  } catch (error) {
    console.error("VETRA PUSH REMINDER DISPATCH ERROR:", error);
    return Response.json({ error: "Could not dispatch scheduled reminders." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return dispatch(request);
}

export async function POST(request: Request) {
  return dispatch(request);
}
