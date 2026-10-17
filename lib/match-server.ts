import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getCoreAdminClient, PushSetupError, resolveOwnerPushContext } from "@/lib/push-server";

export type MatchActor = {
  key: string;
  externalUserId: string | null;
  ownerClientId: string | null;
  clinicId: string | null;
  displayName: string;
  email: string | null;
};

function bearer(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

export async function resolveMatchActor(request: Request, body: Record<string, unknown> = {}): Promise<MatchActor> {
  const token = bearer(request);
  if (token) {
    const url = process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new PushSetupError("VETRA Match authentication is not configured.", 503);
    const authClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await authClient.auth.getUser(token);
    const user = data.user;
    if (error || !user || (!user.email_confirmed_at && !user.phone_confirmed_at)) {
      throw new PushSetupError("Verify your email or phone before using VETRA Match.", 401);
    }
    const admin = getCoreAdminClient();
    const { data: profile, error: profileError } = await admin.from("vetra_match_profiles")
      .select("user_id,display_name").eq("user_id", user.id).maybeSingle();
    if (profileError || !profile) throw new PushSetupError("Complete your VETRA Match profile first.", 403);
    return {
      key: `user:${user.id}`,
      externalUserId: user.id,
      ownerClientId: null,
      clinicId: null,
      displayName: profile.display_name,
      email: user.email || null,
    };
  }

  const clientCode = typeof body.clientCode === "string" ? body.clientCode : "";
  const phone = typeof body.phone === "string" ? body.phone : "";
  if (!clientCode || !phone) throw new PushSetupError("Sign in to your VETRA client account first.", 401);
  const { identity } = await resolveOwnerPushContext({ clientCode, phone });
  const id = identity.ownerClientId;
  if (!id) throw new PushSetupError("Client account could not be verified.", 401);
  return {
    key: `client:${identity.clinicId}:${id}`,
    externalUserId: null,
    ownerClientId: id,
    clinicId: identity.clinicId,
    displayName: "VETRA Client",
    email: null,
  };
}

export function matchError(error: unknown) {
  if (error instanceof PushSetupError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  console.error("VETRA MATCH API ERROR:", error);
  return Response.json({ error: "تعذر إكمال طلب VETRA Match الآن." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export function getListingTable(type: unknown) {
  if (type === "adoption") return "vetra_adoption_listings" as const;
  if (type === "breeding") return "vetra_breeding_listings" as const;
  throw new PushSetupError("نوع الملف غير صحيح.", 400);
}
