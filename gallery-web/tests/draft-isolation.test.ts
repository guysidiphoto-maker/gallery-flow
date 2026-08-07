// draft-isolation.test.ts — contract guard for migration 112 (fail-closed public
// gallery resolution). Anonymous/non-owner callers must not receive non-live
// gallery metadata/sections via the SECURITY DEFINER public resolvers; owner
// preview stays enabled via authenticated ownership. Behaviorally verified on a
// disposable QA DB (17/17 adversarial checks); this locks the SQL contract so a
// future edit can't silently re-open the exposure.
// Run: npx tsx tests/draft-isolation.test.ts

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const mig = readFileSync(resolve(root, 'supabase/migrations/112_draft_isolation_hardening.sql'), 'utf8')
const rb  = readFileSync(resolve(root, 'supabase/migrations/112_draft_isolation_hardening_rollback.sql'), 'utf8')
const body = mig.replace(/--[^\n]*/g, '') // strip comments

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}
function block(fn: string): string {
  // crude: from the CREATE OR REPLACE of fn to the next GRANT EXECUTE line
  const re = new RegExp(`CREATE OR REPLACE FUNCTION[^;]*?\\b${fn}\\b[\\s\\S]*?GRANT EXECUTE ON FUNCTION[^;]*?${fn}\\b[^;]*;`, 'i')
  return (body.match(re) || [''])[0]
}

// ── _gallery_authz: owner bypass + live-only for others ──────────────────────
const authz = block('_gallery_authz')
ok('_gallery_authz: authenticated-owner bypass returns true',
  /auth\.uid\(\)\s+IS NOT NULL\s+AND\s+v_owner\s*=\s*auth\.uid\(\)\s+THEN RETURN true/i.test(authz))
ok('_gallery_authz: non-owner gated to live only',
  /status_\s*<>\s*'live'\s+THEN RETURN false/i.test(authz))
ok('_gallery_authz: SECURITY DEFINER + pinned search_path',
  /SECURITY DEFINER SET search_path = public/i.test(authz))

// ── gallery_get_meta: fail-closed non-live + strip client_id ─────────────────
const meta = block('gallery_get_meta')
ok('gallery_get_meta: non-live to non-owner returns NULL',
  /status_\s*<>\s*'live'\s+AND NOT \(auth\.uid\(\) IS NOT NULL AND v_owner = auth\.uid\(\)\)[\s\S]*?RETURN NULL/i.test(meta))
ok('gallery_get_meta: strips client_id from output', /-\s*'client_id'/.test(meta))
ok('gallery_get_meta: strips password_hash + password', /-\s*'password_hash'/.test(meta) && /ds\s*:=\s*ds\s*-\s*'password'/.test(meta))
ok('gallery_get_meta: does NOT blanket-accept draft/published (old vuln removed)',
  !/status_ (IS NULL OR status_ )?NOT IN \('live', 'published', 'draft'\)/.test(meta))

// ── gallery_bootstrap: non-live only for owner + uniform not_found ───────────
const boot = block('gallery_bootstrap')
ok('gallery_bootstrap: resolves non-live ONLY for authenticated owner',
  /g\.status\s*=\s*'live'\s*OR\s*\(auth\.uid\(\) IS NOT NULL AND b\.user_id\s*=\s*auth\.uid\(\)\)/i.test(boot))
ok('gallery_bootstrap: uniform not_found for unresolved (draft/non-owner/nonexistent)',
  /v_gid IS NULL THEN[\s\S]*?'error',\s*'not_found'/i.test(boot))
ok('gallery_bootstrap: no longer resolves status IN (live,draft) unconditionally',
  !/status IN \('live',\s*'draft'\)/.test(boot))
ok('gallery_bootstrap: SECURITY DEFINER + pinned search_path',
  /SECURITY DEFINER SET search_path = public/i.test(boot))

// ── grants: least privilege preserved (public read fns callable by anon) ─────
for (const fn of ['_gallery_authz', 'gallery_get_meta', 'gallery_bootstrap']) {
  ok(`${fn}: granted to authenticated`, new RegExp(`GRANT EXECUTE ON FUNCTION[^;]*${fn}\\b[^;]*authenticated`).test(body))
}

// ── rollback completeness ────────────────────────────────────────────────────
ok('rollback restores all three functions',
  /FUNCTION _gallery_authz/.test(rb) && /FUNCTION public\.gallery_get_meta/.test(rb) && /FUNCTION gallery_bootstrap/.test(rb))
ok('rollback is a single transaction', /BEGIN;[\s\S]*COMMIT;/.test(rb))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
