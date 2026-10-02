// client-code-server-side.test.ts — contract guard for the client-code migration:
// the code lives in an owner-only table, is checked server-side, gates
// gallery_set_hidden, and never comes back from the public RPCs. Also checks
// the browser no longer compares codes itself.
// Run: npx tsx tests/client-code-server-side.test.ts

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
const strip = (s: string) => s.replace(/--[^\n]*/g, '')

let pass = 0, fail = 0
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}`) }
}

const mig = strip(read('supabase/migrations/20261002215015_client_code_server_side.sql'))

ok('codes table has RLS and no anon access',
  /ENABLE ROW LEVEL SECURITY/.test(mig) && /REVOKE ALL ON public\.gallery_client_codes FROM anon/.test(mig))
ok('trigger strips clientCode from delivery_settings on insert/update',
  /BEFORE INSERT OR UPDATE OF delivery_settings ON public\.galleries/.test(mig)
  && /NEW\.delivery_settings := NEW\.delivery_settings - 'clientCode'/.test(mig))
ok('existing codes and snapshots are migrated',
  /UPDATE public\.galleries SET delivery_settings = delivery_settings/.test(mig)
  && /UPDATE public\.gallery_revisions SET settings = settings - 'clientCode'/.test(mig))
ok('verify RPC caps wrong guesses', />= 10/.test(mig) && /gallery_client_code_attempts/.test(mig))
ok('old 4-arg gallery_set_hidden is dropped',
  /DROP FUNCTION IF EXISTS public\.gallery_set_hidden\(uuid, uuid, boolean, uuid\)/.test(mig))
ok('gallery_set_hidden requires owner or a valid code',
  /_gallery_client_code_ok\(p_gallery_id, p_client_code\)/.test(mig))
ok('snapshot needs live or owner and strips secrets',
  /settings - 'clientCode' - 'password'/.test(mig) && /g\.status = 'live'::gallery_status\s*OR/.test(mig))
ok("gallery_get_meta strips clientCode", /ds := ds - 'password' - 'clientCode'/.test(mig))
ok('internal helpers are not callable by anon',
  /REVOKE EXECUTE ON FUNCTION public\._gallery_client_code_ok\(uuid, text\) FROM PUBLIC, anon, authenticated/.test(mig))

const viewer = read('gallery-web/src/features/viewer/hooks/useClientAccess.ts')
const pin = read('gallery-web/src/features/client-portal/hooks/usePinUnlock.ts')
ok('viewer verifies the code server-side', /verifyClientCode\(/.test(viewer) && !/=== clientCode/.test(viewer))
ok('portal PIN has no browser-side compare', !/=== clientCode/.test(pin) && !/fallback_to_legacy/.test(pin))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
