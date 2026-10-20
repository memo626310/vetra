import {
  currentPushSubscription,
  getCoreAdminClient,
  PushSetupError,
  resolvePushIdentity,
} from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Record<string, unknown> & { audience?: unknown };

function audienceFrom(body: Body) {
  if (body.audience !== "owner" && body.audience !== "clinic") {
    throw new PushSetupError("The notification audience is invalid.");
  }
  return body.audience;
}

function responseError(error: unknown) {
  if (error instanceof PushSetupError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("VETRA PUSH SUBSCRIPTION ERROR:", error);
  return Response.json({ error: "Push notification setup failed." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Body;
    const audience = audienceFrom(body);
    const identity = await resolvePushIdentity(request, body, audience);
    const subscription = currentPushSubscription(body);
    const admin = getCoreAdminClient();
    const { error } = await admin.from("vetra_push_subscriptions").upsert({
      audience: identity.audience,
      clinic_id: identity.clinicId,
      owner_client_id: identity.ownerClientId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      subscription,
      user_agent: request.headers.get("user-agent")?.slice(0, 512) || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as Body;
    const audience = audienceFrom(body);
    const identity = await resolvePushIdentity(request, body, audience);
    const subscription = currentPushSubscription(body);
    const admin = getCoreAdminClient();
    const query = admin
      .from("vetra_push_subscriptions")
      .delete()
      .eq("endpoint", subscription.endpoint)
      .eq("audience", identity.audience)
      .eq("clinic_id", identity.clinicId);
    const { error } = identity.ownerClientId
      ? await query.eq("owner_client_id", identity.ownerClientId)
      : await query.is("owner_client_id", null);
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    return responseError(error);
  }
}
