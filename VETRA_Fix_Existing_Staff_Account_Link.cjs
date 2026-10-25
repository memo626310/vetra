#!/usr/bin/env node
'use strict';

/**
 * Targeted workaround for POST /api/staff/accounts failing at
 * "linking an existing account to the clinic database".
 *
 * An existing account already has auth_user_id set on clinic_staff. This path
 * only resets the Core Auth credentials and the Core clinic_members flag; it
 * does not need to call the tenant RPC that links a newly created account.
 *
 * Safety: validates branch and exactly one source block before writing, and
 * creates a timestamped backup. Does not touch database data or environment files.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function fail(message) {
  console.error(`\nERROR: ${message}\nNo files were written.`);
  process.exit(1);
}

const root = process.cwd();
try {
  if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(path.join(root, '.git'))) {
    fail('Run from the VETRA project root (must contain package.json and .git).');
  }
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  if (branch !== 'feature/accessability') {
    fail(`Safety stop: expected branch feature/accessability, current branch is '${branch}'.`);
  }
} catch (error) {
  if (error && /No files were written/.test(error.message || '')) process.exit(1);
  fail(`Could not verify repository/branch: ${error.message || String(error)}`);
}

const relativePath = path.join('app', 'api', 'staff', 'accounts', 'route.ts');
const fullPath = path.join(root, relativePath);
if (!fs.existsSync(fullPath)) fail(`Missing ${relativePath}.`);
const raw = fs.readFileSync(fullPath, 'utf8');
const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

const oldBlock = `      const { error: staffUpdateError } = await actor.clinicDb.rpc("vetra_link_clinic_staff_account", {
        p_staff_id: person.id,
        p_auth_user_id: person.auth_user_id,
        p_login_email: authEmail,
        p_must_change_password: true,
      });
      if (staffUpdateError) throw staffUpdateError;`;
const newBlock = `      // The staff row is already linked to this exact Core user (person.auth_user_id).
      // Re-issuing credentials should not call the tenant RPC that is required only
      // when linking a newly created user. The Core clinic_members row above is the
      // source of truth for must_change_password and is already set to true.
      console.info("STAFF ACCOUNT: retained existing clinic link", {
        staffId: person.id,
        authUserId: person.auth_user_id,
      });`;

if (normalized.includes('STAFF ACCOUNT: retained existing clinic link')) {
  console.log('The existing-account link workaround is already installed. No files changed.');
  process.exit(0);
}
const count = normalized.split(oldBlock).length - 1;
if (count !== 1) {
  fail(`Expected exactly one existing-account link RPC block in ${relativePath}, found ${count}. The file may differ from the reviewed version; refusing to guess.`);
}

const updated = normalized.replace(oldBlock, newBlock);
const postStart = updated.indexOf('export async function POST(request: Request) {');
const deleteStart = updated.indexOf('export async function DELETE(request: Request) {');
if (postStart < 0 || deleteStart <= postStart) fail('Post-edit validation could not isolate the POST handler.');
const post = updated.slice(postStart, deleteStart);
if (!post.includes('STAFF ACCOUNT: retained existing clinic link')) fail('Post-edit validation failed: replacement marker is missing.');
if (post.split('vetra_link_clinic_staff_account').length - 1 !== 1) {
  fail('Post-edit validation failed: expected the newly-created-account branch to retain exactly one link RPC call.');
}
if (updated === normalized) fail('No change was produced.');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(root, `.vetra-existing-staff-link-backup-${stamp}`);
const backupPath = path.join(backupRoot, relativePath);
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(fullPath, backupPath);
const finalText = raw.includes('\r\n') ? updated.replace(/(?<!\r)\n/g, '\r\n') : updated;
fs.writeFileSync(fullPath, finalText, 'utf8');

console.log('Existing-account link RPC bypass applied in app/api/staff/accounts/route.ts.');
console.log(`Backup: ${path.relative(root, backupPath)}`);
console.log('Scope: only the already-linked-account branch changed. The new-account branch still calls vetra_link_clinic_staff_account.');
console.log('Next: run npx tsc --noEmit, then npm run build. Test by resetting credentials for an existing linked staff account.');
console.log('If creating a brand-new account fails at linking, that requires the underlying tenant RPC error/log and is not fixed by this workaround.');
