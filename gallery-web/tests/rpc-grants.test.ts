// rpc-grants.test.ts — regression guard for editor-RPC grant hardening
// (migration 108). Owner-only editor RPCs must not expose EXECUTE to anon;
// public viewer RPCs must remain anon-executable. Live grants were verified on
// staging (anon=false for the three editor RPCs, anon=true for gallery_get_meta).
// Run: npx tsx tests/rpc-grants.test.ts

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const m = readFileSync(resolve(root, 'supabase/migrations/110_editor_rpc_grant_hardening.sql'), 'utf8')

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

const body = m.replace(/--[^\n]*/g, '') // strip comments

for (const fn of ['update_gallery_settings', '_validate_delivery_settings_patch', 'reorder_images']) {
  const revokesAnon = new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\b[^;]*FROM anon`).test(body)
  const revokesPublic = new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\b[^;]*FROM PUBLIC`).test(body)
  const grantsAuth = new RegExp(`GRANT  ?EXECUTE ON FUNCTION public\\.${fn}\\b[^;]*TO authenticated`).test(body)
  const grantsService = new RegExp(`GRANT  ?EXECUTE ON FUNCTION public\\.${fn}\\b[^;]*TO service_role`).test(body)
  ok(`${fn}: revokes anon + PUBLIC`, revokesAnon && revokesPublic)
  ok(`${fn}: grants authenticated + service_role`, grantsAuth && grantsService)
}

// Must NOT touch public viewer read functions.
for (const viewer of ['gallery_bootstrap', 'gallery_get_images', 'gallery_get_meta', 'gallery_is_locked']) {
  ok(`viewer ${viewer} is left untouched (anon read preserved)`, !body.includes(viewer))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
