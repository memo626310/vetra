import {
  currentPushSubscription,
  getCoreAdminClient,
  PushSetupError,
  resolvePushIdentity,
  sendWebPush,
} from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Record<string, unknown> & { audience?: unknown };

export async function POST(request: Request) {
  try {
    const body = await request.json() as Body;
    if (body.audience !== "owner" && body.audience !== "clinic") {
      throw new PushSetupError("The notification audience is invalid.");
    }
    const audience = body.audience;
    const identity = await resolvePushIdentity(request, body, audience);
    const subscription = currentPushSubscription(body);
    const admin = getCoreAdminClient();
    const query = admin
      .from("vetra_push_subscriptions")
      .select("id")
      .eq("endpoint", subscription.endpoint)
      .eq("audience", identity.audience)
      .eq("clinic_id", identity.clinicId);
    const { data: saved, error } = identity.ownerClientId
      ? await query.eq("owner_client_id", identity.ownerClientId).maybeSingle()
      : await query.is("owner_client_id", null).maybeSingle();
    if (error) throw error;
    if (!saved) throw new PushSetupError("Turn on notifications before sending a test.", 404);

    const url = identity.audience === "clinic"
      ? "/dashboard"
      : `/client-interface/${encodeURIComponent(identity.ownerClientId || "")}`;
    const status = await sendWebPush(subscription, {
      title: "VETRA",
      body: audience === "clinic"
        ? "Clinic notifications are ready on this device."
        : "Pet care notifications are ready on this device.",
      audience,
      url,
      tag: "vetra-push-test",
    });

    if (status === 404 || status === 410) {
      await admin.from("vetra_push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      throw new PushSetupError("This device subscription expired. Turn notifications on again.", 410);
    }
    if (status < 200 || status >= 300) {
      throw new PushSetupError("The browser push service rejected the test notification.", 502);
    }
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof PushSetupError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("VETRA PUSH TEST ERROR:", error);
    return Response.json({ error: "Could not send a test notification." }, { status: 500 });
  }
}
