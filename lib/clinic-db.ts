import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { vetraCore } from "@/lib/vetra-core";

type ClinicContext = {
  clinic_id: string;
  clinic_name: string;
  clinic_status: string;
  doctor_id: string;
  doctor_name: string;
  role: string;
  member_status: string;
  database_provider: string | null;
  project_ref: string | null;
  database_region: string | null;
  database_status: string | null;
  database_url: string | null;
  database_publishable_key: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  plan_name: string | null;
  trial_ends_at: string | null;
};

type CachedClinicToken = {
  token: string;
  expiresAt: number;
};

let clinicDbPromise: Promise<SupabaseClient> | null = null;
let clinicTokenPromise: Promise<CachedClinicToken> | null = null;

export async function getClinicContext(): Promise<ClinicContext> {
  const { data, error } = await vetraCore.rpc("get_my_clinic_context");

  if (error) {
    throw new Error(
      `Failed to load VETRA clinic context: ${error.message}`
    );
  }

  const context = Array.isArray(data)
    ? (data[0] as ClinicContext | undefined)
    : undefined;

  if (!context) {
    throw new Error("No active VETRA clinic was found.");
  }

  return context;
}

async function getClinicAccessToken(): Promise<string> {
  const now = Date.now();

  if (clinicTokenPromise) {
    try {
      const cached = await clinicTokenPromise;

      if (cached.expiresAt > now + 30_000) {
        return cached.token;
      }
    } catch {
      clinicTokenPromise = null;
    }
  }

  clinicTokenPromise = (async () => {
    const { data, error } = await vetraCore.rpc(
      "issue_my_clinic_access_token"
    );

    if (error) {
      throw new Error(
        `Failed to issue VETRA clinic access token: ${error.message}`
      );
    }

    if (typeof data !== "string" || !data.trim()) {
      throw new Error("VETRA clinic access token was not returned.");
    }

    // Remove ALL whitespace/newline characters that could make
    // the Authorization header invalid in the browser.
    const token = data.replace(/\s+/g, "").trim();

    // Basic JWT structure validation.
    const parts = token.split(".");

    if (parts.length !== 3) {
      throw new Error("Invalid VETRA clinic access token format.");
    }

    if (!parts[0] || !parts[1] || !parts[2]) {
      throw new Error("Invalid VETRA clinic access token.");
    }

    // JWT must contain only header-safe characters.
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      throw new Error(
        "VETRA clinic access token contains invalid characters."
      );
    }

    // Token issued by Core expires after 30 minutes.
    // Refresh slightly early.
    return {
      token,
      expiresAt: Date.now() + 25 * 60 * 1000,
    };
  })();

  try {
    const result = await clinicTokenPromise;
    return result.token;
  } catch (error) {
    clinicTokenPromise = null;
    throw error;
  }
}

export async function getClinicDb(): Promise<SupabaseClient> {
  if (!clinicDbPromise) {
    clinicDbPromise = (async () => {
      const context = await getClinicContext();

      if (!context.database_url || !context.database_publishable_key) {
        throw new Error("Clinic database is not configured yet.");
      }

      if (context.database_status !== "ready") {
        throw new Error(
          `Clinic database is not ready. Current status: ${
            context.database_status || "unknown"
          }`
        );
      }

      return createClient(
        context.database_url,
        context.database_publishable_key,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },

          // Supabase officially supports a custom JWT through
          // the accessToken callback.
          accessToken: async () => {
            return getClinicAccessToken();
          },
        }
      );
    })();
  }

  try {
    return await clinicDbPromise;
  } catch (error) {
    clinicDbPromise = null;
    clinicTokenPromise = null;
    throw error;
  }
}

export function resetClinicDbConnection() {
  clinicDbPromise = null;
  clinicTokenPromise = null;
}