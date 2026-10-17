import {
  getCoreAdminClient,
  PushSetupError,
  resolveClinicPushContext,
  resolveOwnerPushContext,
} from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const VISIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function isActivityTableMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01"
    || error.code === "PGRST205"
    || error.message?.includes("vetra_client_activity") === true && /does not exist|not found|schema cache/i.test(error.message);
}

function errorResponse(error: unknown) {
  if (error instanceof PushSetupError) {
    const code = error.status === 401 ? "clinic_auth_required"
      : error.message.toLowerCase().includes("configuration") ? "server_config_missing"
      : "request_rejected";
    return Response.json({ error: error.message, code }, { status: error.status });
  }
  console.error("VETRA CLIENT ACTIVITY ERROR:", error);
  if (isActivityTableMissing(error as { code?: string; message?: string } | null)) {
    return Response.json({
      error: "The client activity table is missing. Apply the VETRA CORE client activity migration.",
      code: "activity_migration_required",
    }, { status: 503 });
  }
  return Response.json({ error: "Could not load client activity.", code: "activity_request_failed" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { identity } = await resolveOwnerPushContext(body);
    const admin = getCoreAdminClient();
    const { error } = await admin.from("vetra_client_activity").upsert({
      clinic_id: identity.clinicId,
      owner_client_id: identity.ownerClientId,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "clinic_id,owner_client_id" });
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const { clinicId, clinicDb } = await resolveClinicPushContext(request);
    const admin = getCoreAdminClient();
    const cutoff = new Date(Date.now() - VISIT_WINDOW_MS).toISOString();
    const [activityResult, subscriptionResult] = await Promise.all([
      admin.from("vetra_client_activity")
        .select("owner_client_id,last_seen_at")
        .eq("clinic_id", clinicId)
        .gte("last_seen_at", cutoff)
        .order("last_seen_at", { ascending: false }),
      admin.from("vetra_push_subscriptions")
        .select("owner_client_id")
        .eq("clinic_id", clinicId)
        .eq("audience", "owner"),
    ]);
    if (subscriptionResult.error) throw subscriptionResult.error;
    const activityTrackingAvailable = !isActivityTableMissing(activityResult.error);
    if (activityResult.error && activityTrackingAvailable) throw activityResult.error;

    const activity = activityTrackingAvailable ? activityResult.data || [] : [];
    const clientIds = [...new Set([
      ...activity.map((row) => row.owner_client_id),
      ...(subscriptionResult.data || []).map((row) => row.owner_client_id),
    ].filter((id): id is string => typeof id === "string" && id.length > 0))];

    let clients: { id: string; name: string; phone: string | null }[] = [];
    if (clientIds.length) {
      const { data, error } = await clinicDb.from("clients")
        .select("id,name,phone")
        .eq("clinic_id", clinicId)
        .in("id", clientIds);
      if (error) throw error;
      clients = (data || []) as typeof clients;
    }

    const clientsById = new Map(clients.map((client) => [client.id, client]));
    const now = Date.now();
    const formatClient = (id: string, lastSeenAt?: string | null) => {
      const client = clientsById.get(id);
      return client ? { id: client.id, name: client.name, phone: client.phone, lastSeenAt: lastSeenAt || null } : null;
    };
    const visitedLast24Hours = activity.flatMap((row) => {
      const client = formatClient(row.owner_client_id, row.last_seen_at);
      return client ? [client] : [];
    });
    const activeClients = visitedLast24Hours.filter((client) =>
      now - new Date(client.lastSeenAt || 0).getTime() <= ACTIVE_WINDOW_MS,
    );
    const notificationClientIds = [...new Set((subscriptionResult.data || [])
      .map((row) => row.owner_client_id)
      .filter((id): id is string => typeof id === "string"))];
    const notificationsEnabled = notificationClientIds.flatMap((id) => {
      const client = formatClient(id);
      return client ? [client] : [];
    });

    return Response.json({ activeClients, visitedLast24Hours, notificationsEnabled, activityTrackingAvailable, generatedAt: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
}
