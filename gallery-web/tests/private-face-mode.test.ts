// private-face-mode.test.ts — contract guard for migration 115 (private face
// mode enforced server-side). In a gallery with facePrivacyMode='private',
// anonymous/non-owner callers must get no bulk image rows from
// gallery_get_images (and therefore gallery_bootstrap), the anon images RLS
// policy, or an anon storage listing; the owner keeps the full list; vendors
// read their tagged photos through a code-authenticated RPC.
// Run: npx tsx tests/private-face-mode.test.ts

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
const strip = (s: string) => s.replace(/--[^\n]*/g, '')

const body = strip(read('supabase/migrations/115_private_face_mode_enforcement.sql'))
const rb = strip(read('supabase/rollbacks/115_private_face_mode_enforcement_rollback.sql'))
const boot114 = strip(read('supabase/migrations/114_draft_isolation_hardening.sql'))
const vendorHook = read('gallery-web/src/features/vendor/useVendorPortal.ts')
const vendorData = read('gallery-web/src/shared/data/vendors.ts')
const viewerData = read('gallery-web/src/features/viewer/hooks/useGalleryData.ts')

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}
function fnBlock(src: string, fn: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\b[\\s\\S]*?\\$(function)?\\$;`, 'i')
  return (src.match(re) || [''])[0]
}
function policy(src: string, name: string): string {
  const re = new RegExp(`CREATE POLICY ${name}\\b[\\s\\S]*?\\);\\s*\\n`, 'i')
  return (src.match(re) || [''])[0]
}
const PRIVATE = /\(g\.delivery_settings\s*->>\s*'facePrivacyMode'\)\s*IS DISTINCT FROM\s*'private'/

// ── gallery_get_images: guard, signature, owner exemption ───────────────────
const gi = fnBlock(body, 'gallery_get_images')
ok('gallery_get_images: signature unchanged',
  /gallery_get_images\(\s*p_gallery_id uuid,\s*p_token uuid DEFAULT NULL::uuid,\s*p_limit integer DEFAULT 500,\s*p_offset integer DEFAULT 0\s*\)\s*RETURNS SETOF images/i.test(gi))
ok('gallery_get_images: still gated by _gallery_authz + gallery_is_locked',
  /IF NOT _gallery_authz\(p_gallery_id, p_token\) THEN RETURN/.test(gi) && /IF gallery_is_locked\(p_gallery_id\) THEN RETURN/.test(gi))
ok('gallery_get_images: reads facePrivacyMode from the live gallery row',
  /\(g\.delivery_settings\s*->>\s*'facePrivacyMode'\)\s*=\s*'private'/.test(gi))
ok('gallery_get_images: private + non-owner returns no rows',
  /IF COALESCE\(v_private, false\)\s*AND NOT \(auth\.uid\(\) IS NOT NULL AND v_owner = auth\.uid\(\)\) THEN\s*RETURN;/i.test(gi))
ok('gallery_get_images: guard runs before RETURN QUERY',
  gi.indexOf('v_private, false') > 0 && gi.indexOf('v_private, false') < gi.indexOf('RETURN QUERY'))
ok('gallery_get_images: SECURITY DEFINER + pinned search_path',
  /SECURITY DEFINER SET search_path = public/i.test(gi))
ok('gallery_get_images: page clamp preserved (max 2000)', /LEAST\(COALESCE\(p_limit, 500\), 2000\)/.test(gi))

// ── gallery_bootstrap inherits the guard (reads through gallery_get_images) ─
ok('gallery_bootstrap (114) embeds images via gallery_get_images',
  /FROM gallery_get_images\(v_gid, p_token, p_limit, 0\)/.test(boot114))
ok('115 does not redefine gallery_bootstrap (inherits guard)', !/FUNCTION[^(]*gallery_bootstrap/i.test(body))

// ── RLS: anon direct reads exclude private galleries ────────────────────────
const imgPol = policy(body, 'images_public_live_select')
ok('images_public_live_select: recreated TO anon, live only', /FOR SELECT TO anon/.test(imgPol) && /g\.status = 'live'/.test(imgPol))
ok('images_public_live_select: excludes private-face galleries', PRIVATE.test(imgPol))
ok('images_public_live_select: dropped before recreate', /DROP POLICY IF EXISTS images_public_live_select ON public\.images/.test(body))
const stPol = policy(body, 'gallery_storage_public_read')
ok('gallery_storage_public_read: private galleries not listable (stories exempt)',
  PRIVATE.test(stPol) && /bucket_id = 'gallery-stories'/.test(stPol))
ok('thumbs_public_anon_read: excludes private-face galleries', PRIVATE.test(policy(body, 'thumbs_public_anon_read')))
ok('member/owner policies untouched', !/images_member_select|images_owner_all/.test(body))

// ── vendor RPC ─────────────────────────────────────────────────────────────
const gv = fnBlock(body, 'get_vendor_images')
ok('get_vendor_images: scoped by access code + vendor business + live',
  /UPPER\(v\.access_code\) = UPPER\(btrim\(p_code\)\)/.test(gv) && /g\.business_id = v\.business_id/.test(gv) && /g\.status = 'live'/.test(gv))
ok('get_vendor_images: rejects empty code', /length\(btrim\(p_code\)\) > 0/.test(gv))
ok('get_vendor_images: SECURITY DEFINER + pinned search_path', /SECURITY DEFINER SET search_path = public/i.test(gv))

// ── grants ─────────────────────────────────────────────────────────────────
for (const sig of ['gallery_get_images\\(uuid, uuid, integer, integer\\)', 'get_vendor_images\\(text\\)']) {
  ok(`${sig.split('\\')[0]}: REVOKE FROM PUBLIC`, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${sig} FROM PUBLIC`).test(body))
  ok(`${sig.split('\\')[0]}: GRANT anon, authenticated, service_role`,
    new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${sig} TO anon, authenticated, service_role`).test(body))
}
ok('migration is a single transaction', /^\s*BEGIN;[\s\S]*COMMIT;\s*$/.test(body))

ok('anon images policy keeps the live password-gallery exclusion',
  /images_public_live_select[\s\S]*?password_hash IS NULL[\s\S]*?facePrivacyMode/.test(body))
ok('rollback keeps the password-gallery exclusion',
  /images_public_live_select[\s\S]*?password_hash IS NULL/.test(rb))

// ── rollback ───────────────────────────────────────────────────────────────
const rgi = fnBlock(rb, 'gallery_get_images')
ok('rollback restores 078 gallery_get_images (no private guard)',
  /_gallery_authz\(p_gallery_id, p_token\)/.test(rgi) && !/facePrivacyMode/.test(rgi))
ok('rollback restores 078 grants', /GRANT EXECUTE ON FUNCTION public\.gallery_get_images\(uuid, uuid, integer, integer\) TO PUBLIC, anon, authenticated/.test(rb))
ok('rollback restores the three 063 policies without the private clause',
  ['images_public_live_select', 'gallery_storage_public_read', 'thumbs_public_anon_read']
    .every(p => new RegExp(`CREATE POLICY ${p}\\b`).test(rb)) && !/facePrivacyMode/.test(rb))
ok('rollback drops get_vendor_images', /DROP FUNCTION IF EXISTS public\.get_vendor_images\(text\)/.test(rb))
ok('rollback is a single transaction', /BEGIN;[\s\S]*COMMIT;/.test(rb))

// ── frontend contract ──────────────────────────────────────────────────────
ok('viewer skips the bulk image fetch in private mode', /const skipImages = isPrivateFace\(g\)/.test(viewerData))
ok('vendor portal prefers get_vendor_images, falls back to legacy reads',
  /rpc\('get_vendor_images', \{ p_code: code \}\)/.test(vendorData)
    && /getVendorImages\(code\)/.test(vendorHook) && /listVendorImageTags\(v\.id\)/.test(vendorHook))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
