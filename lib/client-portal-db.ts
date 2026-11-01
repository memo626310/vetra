import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Owner credentials are verified by the tenant. Do not attach a clinic Auth
// session to this public Core RPC when both portals share the same browser.
const ownerCore = createClient(
  process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_VETRA_CORE_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

type PetOwnerAccess = {
  access_token: string;
  database_url: string;
  database_publishable_key: string;
  clinic_id: string;
};

async function issuePetOwnerAccess(
  clientCode: string,
  phone: string
): Promise<PetOwnerAccess> {
  const normalizedCode = clientCode.trim().replace(/\s+/g, "");
  const normalizedPhone = phone.trim().replace(/\s+/g, "");

  const { data, error } = await ownerCore.rpc(
    "issue_pet_owner_access_token",
    {
      p_client_code: normalizedCode,
      p_phone: normalizedPhone,
    }
  );

  if (error) {
    throw new Error(`Pet Owner access failed: ${error.message}`);
  }

  const row = Array.isArray(data)
    ? (data[0] as PetOwnerAccess | undefined)
    : (data as PetOwnerAccess | null);

  if (
    !row?.access_token ||
    !row.database_url ||
    !row.database_publishable_key ||
    !row.clinic_id
  ) {
    throw new Error("Invalid Pet Owner access response.");
  }

  const token = row.access_token.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Invalid Pet Owner access token format.");
  }

  return { ...row, access_token: token };
}

export async function getClientPortalDb(
  clientCode: string,
  phone: string
): Promise<SupabaseClient> {
  const normalizedCode = clientCode.trim().replace(/\s+/g, "");
  const normalizedPhone = phone.trim().replace(/\s+/g, "");

  if (!/^[0-9]{6}$/.test(normalizedCode)) {
    throw new Error("Invalid Client ID format.");
  }

  if (!normalizedPhone) {
    throw new Error("Phone number is required.");
  }

  const access = await issuePetOwnerAccess(
    normalizedCode,
    normalizedPhone
  );

  let cachedToken = access.access_token;
  let tokenIssuedAt = Date.now();
  let refreshPromise: Promise<string> | null = null;

  async function getAccessToken(): Promise<string> {
    const now = Date.now();

    if (cachedToken && now - tokenIssuedAt < 25 * 60 * 1000) {
      return cachedToken;
    }

    if (!refreshPromise) {
      refreshPromise = issuePetOwnerAccess(
        normalizedCode,
        normalizedPhone
      ).then((freshAccess) => {
        cachedToken = freshAccess.access_token;
        tokenIssuedAt = Date.now();
        return cachedToken;
      });
    }

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  return createClient(
    access.database_url,
    access.database_publishable_key,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          "x-vetra-client-code": normalizedCode,
          "x-vetra-client-phone": normalizedPhone,
        },
      },
      accessToken: getAccessToken,
    }
  );
}
