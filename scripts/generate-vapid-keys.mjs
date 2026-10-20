import { createECDH, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const existing = new Map(
  current.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    return match ? [[match[1], match[2]]] : [];
  })
);

let publicKey = existing.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY")?.trim();
let privateKey = existing.get("VAPID_PRIVATE_KEY")?.trim();

if (!publicKey || !privateKey) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  publicKey = ecdh.getPublicKey().toString("base64url");
  privateKey = ecdh.getPrivateKey().toString("base64url");
}

const values = new Map(existing);
values.set("NEXT_PUBLIC_VAPID_PUBLIC_KEY", publicKey);
values.set("VAPID_PRIVATE_KEY", privateKey);
if (!values.get("VAPID_SUBJECT")) values.set("VAPID_SUBJECT", "mailto:push@vetra.top");
if (!values.get("VETRA_PUSH_CRON_SECRET")) {
  values.set("VETRA_PUSH_CRON_SECRET", randomBytes(32).toString("base64url"));
}

const keys = new Set(values.keys());
const lines = current.split(/\r?\n/).map((line) => {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
  if (!match || !values.has(match[1])) return line;
  const key = match[1];
  keys.delete(key);
  return `${key}=${values.get(key)}`;
});

while (lines.length && lines.at(-1) === "") lines.pop();
for (const key of keys) lines.push(`${key}=${values.get(key)}`);
writeFileSync(envPath, `${lines.join("\n")}\n`, { mode: 0o600 });
console.log("Push secrets are ready in .env.local. Keep all except the VAPID public key server-side.");
