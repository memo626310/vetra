import { getCoreAdminClient } from "@/lib/push-server";
import { matchError, resolveMatchActor } from "@/lib/match-server";

export const dynamic = "force-dynamic";

async function listInbox(actorKey: string) {
  const admin = getCoreAdminClient();
  const { data: threads, error } = await admin.from("vetra_match_threads").select("id,listing_type,listing_id,requester_key,listing_owner_key,status,created_at,updated_at")
    .or(`requester_key.eq.${actorKey},listing_owner_key.eq.${actorKey}`).order("updated_at", { ascending: false });
  if (error) throw error;
  const result = await Promise.all((threads || []).map(async (thread) => {
    const table = thread.listing_type === "adoption" ? "vetra_adoption_listings" : "vetra_breeding_listings";
    const [{ data: listing }, { data: messages, error: messagesError }] = await Promise.all([
      admin.from(table).select("name,species,breed,city,photo_url,status,is_demo").eq("id", thread.listing_id).maybeSingle(),
      admin.from("vetra_match_messages").select("id,sender_key,body,created_at").eq("thread_id", thread.id).order("created_at", { ascending: true }).limit(100),
    ]);
    if (messagesError) throw messagesError;
    return { id: thread.id, listingId: thread.listing_id, type: thread.listing_type, status: thread.status, updated_at: thread.updated_at, side: thread.requester_key === actorKey ? "requester" : "owner", listing, messages: (messages || []).map((message) => ({ id: message.id, body: message.body, created_at: message.created_at, isMine: message.sender_key === actorKey })) };
  }));
  return result;
}

export async function GET(request: Request) {
  try {
    const actor = await resolveMatchActor(request);
    return Response.json({ threads: await listInbox(actor.key) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return matchError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const actor = await resolveMatchActor(request, body);
    return Response.json({ threads: await listInbox(actor.key) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return matchError(error); }
}
