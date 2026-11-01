// Review with: node scripts/repair-tenant-jwt.mjs
// Apply the reviewed signing-key repair with: node scripts/repair-tenant-jwt.mjs --apply
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const env = new Map(readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].trim()]] : [];
}));
const coreRef = new URL(env.get("NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL")).hostname.split(".")[0];
const apiToken = env.get("SUPABASE_ACCESS_TOKEN");
if (!apiToken) throw new Error("SUPABASE_ACCESS_TOKEN is required.");
const apply = process.argv.includes("--apply");
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
async function api(path, method = "GET", body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Supabase management request failed (${response.status}).`);
  return response.json();
}
const query = (ref, sql) => api(`${ref}/database/query`, "POST", { query: sql });
async function probe(access, token) {
  const response = await fetch(`${access.database_url}/rest/v1/clients?select=id&limit=0`, {
    headers: {
      apikey: access.database_publishable_key,
      Authorization: `Bearer ${token}`,
      "x-vetra-client-code": clientCode,
      "x-vetra-client-phone": diagnosticPhone,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  return { ok: response.ok && Array.isArray(body) && body.length === 0, status: response.status, code: body?.code };
}
const mappings = await query(coreRef, `select c.clinic_number, cd.database_url from public.clinics c join public.clinic_databases cd on cd.clinic_id=c.id where cd.status='ready' order by c.clinic_number;`);
const urls = [...new Set(mappings.map((row) => row.database_url))];
if (urls.length !== 1 || !mappings.length) throw new Error("This repair requires one shared tenant database; review per-tenant signing first.");
const tenantRef = new URL(urls[0]).hostname.split(".")[0];
const keys = (await api(`${tenantRef}/config/auth/signing-keys`)).keys;
const currentKey = keys.find((key) => key.status === "in_use");
if (!currentKey) throw new Error("No current tenant signing key was found.");
const clientCode = `${String(mappings[0].clinic_number).padStart(2, "0")}0000`;
const diagnosticPhone = `vetra-jwt-diagnostic-${randomUUID()}`;
const accessSql = `select * from public.issue_pet_owner_access_token(${literal(clientCode)},${literal(diagnosticPhone)});`;
const access = (await query(coreRef, accessSql))[0];
const before = await probe(access, access.access_token);
const config = await api(`${tenantRef}/postgrest`);
if (typeof config.jwt_secret !== "string" || !config.jwt_secret || config.jwt_secret.startsWith("{")) {
  throw new Error("This repair requires the tenant's existing shared PostgREST JWT secret.");
}
const signingSecret = config.jwt_secret;
// Match PostgREST's configured text secret exactly; do not base64-decode it.
const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const unsigned = `${header}.${access.access_token.replace(/\s+/g, "").split(".")[1]}`;
const candidate = `${unsigned}.${createHmac("sha256", signingSecret).update(unsigned).digest("base64url")}`;
const candidateProbe = await probe(access, candidate);
console.log(JSON.stringify({ coreRef, tenantRef, currentKey: { id: currentKey.id, algorithm: currentKey.algorithm }, ownerProbe: before, candidateProbe }, null, 2));
if (!apply) {
  console.log("Review complete. --apply stores the verified existing PostgREST JWT secret in Core Vault and updates the token functions. It preserves Auth signing keys and API keys.");
  process.exit(0);
}
if (before.ok) throw new Error("Owner JWT already works; no signing-key repair is needed.");
if (before.code !== "PGRST301") throw new Error("Probe did not reproduce the JWT signature error; repair stopped.");
if (!candidateProbe.ok) throw new Error("Existing PostgREST signing secret did not pass verification; repair stopped.");

const migration = readFileSync(resolve("supabase/migrations/20261101_vetra_tenant_jwt_signing.sql"), "utf8");
const backups = await query(coreRef, `select p.proname, pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('issue_pet_owner_access_token','issue_my_clinic_access_token');`);
if (backups.length !== 2) throw new Error("Token function backup is incomplete.");
const existing = await query(coreRef, `select name from vault.secrets where name = 'vetra_tenant_jwt_secret';`);
if (existing.length) throw new Error("Tenant signing secret already configured; review it before replacing anything.");
const backupDir = resolve(`.env.vetra-jwt-repair-${Date.now()}`);
mkdirSync(backupDir);
const rollbackSql = `begin;\n${backups.map((row) => `${row.definition};`).join("\n")}\ndelete from vault.secrets where name = 'vetra_tenant_jwt_secret';\nnotify pgrst, 'reload schema';\ncommit;\n`;
writeFileSync(resolve(backupDir, "rollback.sql"), rollbackSql);
writeFileSync(resolve(backupDir, "before-key-metadata.json"), JSON.stringify(keys, null, 2));

let coreApplied = false;
try {
  const vaultSql = `begin; select vault.create_secret(${literal(signingSecret)},'vetra_tenant_jwt_secret','Verified shared tenant PostgREST JWT signer'); commit;`;
  await query(coreRef, vaultSql);
  coreApplied = true;
  await query(coreRef, migration);
  for (const mapping of mappings) {
    const code = `${String(mapping.clinic_number).padStart(2, "0")}0000`;
    const fresh = (await query(coreRef, `select * from public.issue_pet_owner_access_token(${literal(code)},${literal(diagnosticPhone)});`))[0];
    const validation = await probe(fresh, fresh.access_token);
    if (!validation.ok) throw new Error(`New owner JWT failed for clinic ${mapping.clinic_number}.`);
  }
  const afterKeys = (await api(`${tenantRef}/config/auth/signing-keys`)).keys;
  if (afterKeys.find((key) => key.status === "in_use")?.id !== currentKey.id) throw new Error("Current Auth signing key changed unexpectedly.");
  console.log(`Repair verified for ${mappings.length} clinic mappings. Rollback saved in ${backupDir}.`);
} catch (error) {
  if (coreApplied) await query(coreRef, rollbackSql);
  throw error;
}
