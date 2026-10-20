import { getCoreAdminClient } from "@/lib/push-server";
import { matchError, resolveMatchActor } from "@/lib/match-server";

export const dynamic = "force-dynamic";

async function notifications(actorKey: string) {
  const admin = getCoreAdminClient();
  const { data, error } = await admin.from("vetra_match_notifications").select("id,event_type,thread_id,read_at,created_at").eq("recipient_key", actorKey).order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return { notifications: data || [], unread: (data || []).filter((row) => !row.read_at).length };
}

export async function GET(request: Request) {
  try { const actor = await resolveMatchActor(request); return Response.json(await notifications(actor.key), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return matchError(error); }
}

export async function POST(request: Request) {
  try { const body = await request.json() as Record<string, unknown>; const actor = await resolveMatchActor(request, body); return Response.json(await notifications(actor.key), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return matchError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const actor = await resolveMatchActor(request, body);
    const admin = getCoreAdminClient();
    const { error } = await admin.from("vetra_match_notifications").update({ read_at: new Date().toISOString() }).eq("recipient_key", actor.key).is("read_at", null);
    if (error) throw error;
    return Response.json({ read: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return matchError(error); }
}
