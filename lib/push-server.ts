import "server-only";

import {
  createCipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign as signData,
} from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type PushAudience = "owner" | "clinic";

export type PushSubscriptionData = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

export type PushIdentity = {
  audience: PushAudience;
  clinicId: string;
  ownerClientId: string | null;
};

type OwnerAccess = {
  access_token: string;
  database_url: string;
  database_publishable_key: string;
  clinic_id: string;
};

type ClinicPushContext = {
  clinicId: string;
  clinicDb: SupabaseClient;
};

export class PushSetupError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "PushSetupError";
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new PushSetupError(`Missing server configuration: ${name}`, 503);
  return value;
}

function getCorePublicClient() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_VETRA_CORE_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export function getCoreAdminClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL"),
    requiredEnv("VETRA_CORE_SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function readBearer(request: Request) {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function asOwnerAccess(data: unknown): OwnerAccess | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const value = row as Partial<OwnerAccess>;
  if (!value.access_token || !value.database_url || !value.database_publishable_key || !value.clinic_id) {
    return null;
  }
  return value as OwnerAccess;
}

function normalizeOwnerCredentials(body: Record<string, unknown>) {
  const clientCode = typeof body.clientCode === "string"
    ? body.clientCode.trim().replace(/\s+/g, "")
    : "";
  const phone = typeof body.phone === "string"
    ? body.phone.trim().replace(/\s+/g, "")
    : "";

  if (!/^[0-9]{6}$/.test(clientCode) || !phone) {
    throw new PushSetupError("Owner credentials are missing or invalid.", 401);
  }
  return { clientCode, phone };
}

export async function resolvePushIdentity(
  request: Request,
  body: Record<string, unknown>,
  audience: PushAudience
): Promise<PushIdentity> {
  if (audience === "clinic") {
    const { clinicId } = await resolveClinicPushContext(request);
    return { audience, clinicId, ownerClientId: null };
  }

  const { identity } = await resolveOwnerPushContext(body);
  return identity;
}

export async function resolveOwnerPushContext(body: Record<string, unknown>) {
  const { clientCode, phone } = normalizeOwnerCredentials(body);
  const core = getCorePublicClient();
  const { data, error } = await core.rpc("issue_pet_owner_access_token", {
    p_client_code: clientCode,
    p_phone: phone,
  });
  const access = asOwnerAccess(data);
  if (error || !access) throw new PushSetupError("Owner sign-in could not be verified.", 401);

  const tenantDb = createClient(access.database_url, access.database_publishable_key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        "x-vetra-client-code": clientCode,
        "x-vetra-client-phone": phone,
      },
    },
    accessToken: async () => access.access_token,
  });
  const { data: client, error: clientError } = await tenantDb
    .from("clients")
    .select("id")
    .eq("phone", phone)
    .eq("client_code", clientCode)
    .maybeSingle();
  if (clientError || !client?.id) throw new PushSetupError("Owner sign-in could not be verified.", 401);

  return {
    identity: {
      audience: "owner" as const,
      clinicId: access.clinic_id,
      ownerClientId: String(client.id),
    },
    tenantDb,
  };
}

export async function resolveClinicPushContext(request: Request): Promise<ClinicPushContext> {
  const token = readBearer(request);
  if (!token) throw new PushSetupError("Clinic sign-in is required.", 401);
  const url = requiredEnv("NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL");
  const key = requiredEnv("NEXT_PUBLIC_VETRA_CORE_SUPABASE_PUBLISHABLE_KEY");
  const core = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userResult, error: userError } = await core.auth.getUser(token);
  if (userError || !userResult.user) throw new PushSetupError("Clinic sign-in has expired. Sign in again.", 401);

  const clinicClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await clinicClient.rpc("get_my_clinic_context");
  const context = Array.isArray(data) ? data[0] : data;
  const value = context && typeof context === "object"
    ? context as { clinic_id?: unknown; database_url?: unknown; database_publishable_key?: unknown; database_status?: unknown }
    : null;
  if (error || typeof value?.clinic_id !== "string" || !value.clinic_id) {
    throw new PushSetupError("No active clinic was found for this account.", 403);
  }
  if (typeof value.database_url !== "string" || typeof value.database_publishable_key !== "string" || value.database_status !== "ready") {
    throw new PushSetupError("The clinic database is not ready.", 503);
  }
  const { data: tenantToken, error: tokenError } = await clinicClient.rpc("issue_my_clinic_access_token");
  if (tokenError || typeof tenantToken !== "string" || !tenantToken.trim()) {
    throw new PushSetupError("A secure clinic data session could not be created.", 403);
  }

  return {
    clinicId: value.clinic_id,
    clinicDb: createClient(value.database_url, value.database_publishable_key, {
      auth: { persistSession: false, autoRefreshToken: false },
      accessToken: async () => tenantToken.replace(/\s+/g, "").trim(),
    }),
  };
}

export function validatePushSubscription(value: unknown): PushSubscriptionData {
  if (!value || typeof value !== "object") {
    throw new PushSetupError("A valid push subscription is required.");
  }

  const candidate = value as Partial<PushSubscriptionData>;
  if (typeof candidate.endpoint !== "string" || candidate.endpoint.length > 4096) {
    throw new PushSetupError("The push endpoint is invalid.");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(candidate.endpoint);
  } catch {
    throw new PushSetupError("The push endpoint is invalid.");
  }
  const supportedPushHosts = [
    "fcm.googleapis.com",
    "web.push.apple.com",
    "updates.push.services.mozilla.com",
    "push.services.mozilla.com",
  ];
  const isSupportedHost = supportedPushHosts.includes(endpoint.hostname)
    || endpoint.hostname.endsWith(".push.services.mozilla.com")
    || endpoint.hostname.endsWith(".wns.windows.com");
  if (endpoint.protocol !== "https:" || !isSupportedHost || endpoint.username || endpoint.password) {
    throw new PushSetupError("This browser push service is not supported.");
  }

  const keys = candidate.keys;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
    throw new PushSetupError("The push encryption keys are missing.");
  }
  const p256dh = fromBase64Url(keys.p256dh);
  const auth = fromBase64Url(keys.auth);
  if (p256dh.length !== 65 || auth.length !== 16 || p256dh[0] !== 4) {
    throw new PushSetupError("The push encryption keys are invalid.");
  }

  return {
    endpoint: endpoint.href,
    expirationTime: candidate.expirationTime ?? null,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

function fromBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function toBase64Url(value: Buffer | Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

function getVapidConfig() {
  const publicKey = fromBase64Url(requiredEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"));
  const privateKey = fromBase64Url(requiredEnv("VAPID_PRIVATE_KEY"));
  if (publicKey.length !== 65 || publicKey[0] !== 4 || privateKey.length !== 32) {
    throw new PushSetupError("The VAPID key pair is invalid.", 503);
  }
  return { publicKey, privateKey };
}

function makeVapidAuthorization(endpoint: URL, publicKey: Buffer, privateKey: Buffer) {
  const x = toBase64Url(publicKey.subarray(1, 33));
  const y = toBase64Url(publicKey.subarray(33, 65));
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", x, y, d: toBase64Url(privateKey) },
    format: "jwk",
  });
  const header = toBase64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = toBase64Url(Buffer.from(JSON.stringify({
    aud: endpoint.origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: process.env.VAPID_SUBJECT?.trim() || "mailto:push@vetra.top",
  })));
  const unsignedToken = `${header}.${claims}`;
  const signature = signData("sha256", Buffer.from(unsignedToken), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${unsignedToken}.${toBase64Url(signature)}, k=${toBase64Url(publicKey)}`;
}

function encryptPushPayload(subscription: PushSubscriptionData, payload: string) {
  const uaPublic = fromBase64Url(subscription.keys.p256dh);
  const authSecret = fromBase64Url(subscription.keys.auth);
  const uaKey = createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: toBase64Url(uaPublic.subarray(1, 33)),
      y: toBase64Url(uaPublic.subarray(33, 65)),
    },
    format: "jwk",
  });
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const senderJwk = publicKey.export({ format: "jwk" });
  const senderPublic = Buffer.concat([
    Buffer.from([4]),
    fromBase64Url(senderJwk.x || ""),
    fromBase64Url(senderJwk.y || ""),
  ]);
  const sharedSecret = diffieHellman({ privateKey, publicKey: uaKey });
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    uaPublic,
    senderPublic,
  ]);
  const inputKeyingMaterial = Buffer.from(
    hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32)
  );
  const salt = randomBytes(16);
  const contentEncryptionKey = Buffer.from(hkdfSync(
    "sha256",
    inputKeyingMaterial,
    salt,
    Buffer.from("Content-Encoding: aes128gcm\0", "utf8"),
    16
  ));
  const nonce = Buffer.from(hkdfSync(
    "sha256",
    inputKeyingMaterial,
    salt,
    Buffer.from("Content-Encoding: nonce\0", "utf8"),
    12
  ));

  const plaintext = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const keyIdLength = Buffer.from([senderPublic.length]);
  const body = Buffer.concat([salt, recordSize, keyIdLength, senderPublic, ciphertext]);
  if (body.length > 4096) throw new PushSetupError("The push message is too large.");
  return body;
}

export async function sendWebPush(subscription: PushSubscriptionData, payload: unknown) {
  const { publicKey, privateKey } = getVapidConfig();
  const endpoint = new URL(subscription.endpoint);
  const body = encryptPushPayload(subscription, JSON.stringify(payload));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: makeVapidAuthorization(endpoint, publicKey, privateKey),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
    cache: "no-store",
    redirect: "error",
  });

  return response.status;
}

export async function sendPushBatch(
  admin: SupabaseClient,
  rows: Array<{ endpoint: string; subscription: unknown }>,
  payload: unknown
) {
  const results = await Promise.allSettled(rows.map(async (row) => {
    const subscription = validatePushSubscription(row.subscription);
    const status = await sendWebPush(subscription, payload);
    if (status === 404 || status === 410) {
      await admin.from("vetra_push_subscriptions").delete().eq("endpoint", row.endpoint);
      return false;
    }
    return status >= 200 && status < 300;
  }));
  return results.filter((result) => result.status === "fulfilled" && result.value).length;
}

export function currentPushSubscription(body: Record<string, unknown>) {
  return validatePushSubscription(body.subscription);
}

