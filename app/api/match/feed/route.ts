import { getSocialAdmin, getSocialFeed, socialActor, socialResponseError } from "@/lib/match-social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request, body: Record<string, unknown> = {}) {
  try {
    const actor = await socialActor(request, body);
    const rawLimit = typeof body.limit === "number" ? body.limit : 40;
    return Response.json(await getSocialFeed(getSocialAdmin(), actor, rawLimit), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return socialResponseError(error);
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  try {
    return handle(request, await request.json() as Record<string, unknown>);
  } catch (error) {
    return socialResponseError(error);
  }
}
