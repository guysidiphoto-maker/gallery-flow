// short-route.test.ts — regression guard for the short gallery route
// (/:business/:gallery). Two independent parts must both hold:
//   (A) the server resolver gallery_get_meta must not crash on a null
//       delivery_settings (the real cause of "not found"); and
//   (B) Vercel must route /:business/:gallery to the SSR gallery page and fall
//       back to the SPA for a hard refresh.
// The DB resolution itself was validated live against staging (corporategala2026
// ok:true, unknown-slug not_found, draft ok, no slug collisions). Run:
//   npx tsx tests/short-route.test.ts

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// (A) gallery_get_meta null-safety (migration 107)
{
  const m = read('supabase/migrations/109_gallery_meta_null_safe.sql')
  ok('107 coerces a non-object delivery_settings to {} before key removal',
    /jsonb_typeof\(ds\)\s*<>\s*'object'/.test(m) && /ds\s*:=\s*'\{\}'::jsonb/.test(m))
  ok('107 still removes the password key and keeps the brand subset',
    /ds\s*:=\s*ds\s*-\s*'password'/.test(m) && /'accentHex'/.test(m))
  ok('107 preserves the function contract (SECURITY DEFINER + search_path)',
    /SECURITY DEFINER/.test(m) && /search_path/i.test(m))
}

// (B) Vercel routing for the short route + SPA fallback
{
  const v = JSON.parse(read('gallery-web/vercel.json')) as { rewrites: Array<{ source: string; destination: string }> }
  const hasShort = v.rewrites.some(r => r.source === '/:business/:gallery' && /gallery-page/.test(r.destination))
  const hasSection = v.rewrites.some(r => r.source === '/:business/:gallery/:section')
  const hasSpaFallback = v.rewrites.some(r => /app\.html/.test(r.destination))
  ok('short route /:business/:gallery routes to the SSR gallery page', hasShort)
  ok('section route /:business/:gallery/:section is handled', hasSection)
  ok('SPA fallback to app.html exists (hard-refresh safe)', hasSpaFallback)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
