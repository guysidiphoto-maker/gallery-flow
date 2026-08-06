// gallery-presets.test.ts — contract guard for owner-scoped gallery presets.
//   • capturePresetSettings drops identity/secrets, keeps reusable keys.
//   • the client allowlist matches the server sanitizer (migration 111).
//   • migration 111 is owner-RLS, anon-revoked, sanitizes, single-default.
// Run: npx tsx tests/gallery-presets.test.ts

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { capturePresetSettings, summarizePreset, PRESET_ALLOWED_KEYS } from '../src/lib/galleryPresets.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const mig = readFileSync(resolve(root, 'supabase/migrations/111_gallery_presets.sql'), 'utf8')

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// ── capturePresetSettings: identity/secrets stripped ─────────────────────────
const captured = capturePresetSettings({
  // identity + secrets that MUST be dropped
  galleryTitle: 'Wedding', galleryDescription: 'x', welcomeMessage: 'hi',
  password: 'sekret', clientCode: '1234', galleryCode: 'ABCD', requireGalleryCode: true,
  coverImagePath: 'a/b', coverImageUrl: 'http://x', coverImageId: 'id', coverEnabled: true, coverSource: 'gallery_asset',
  eventDate: '2026-01-01', eventLocation: 'TLV', eventType: 'wedding', logoUrl: 'http://logo',
  // reusable that MUST be kept
  gridSpacing: 'large', appearance: 'dark', downloadsEnabled: true, watermarkEnabled: false,
})
for (const secret of ['galleryTitle', 'password', 'clientCode', 'galleryCode', 'coverImagePath', 'coverImageUrl', 'coverImageId', 'eventDate', 'eventLocation', 'logoUrl', 'welcomeMessage']) {
  ok(`captured preset drops "${secret}"`, !(secret in captured))
}
for (const keep of ['gridSpacing', 'appearance', 'downloadsEnabled', 'watermarkEnabled']) {
  ok(`captured preset keeps "${keep}"`, keep in captured)
}
ok('captured preset ignores undefined values', !('missing' in capturePresetSettings({ missing: undefined })))
ok('summarizePreset returns human parts', summarizePreset({ id: '1', business_id: 'b', name: 'n', is_default: false, created_at: '', updated_at: '', settings: { gridSpacing: 'large', appearance: 'dark' } }).length > 0)

// ── client allowlist ↔ server sanitizer parity ───────────────────────────────
// Extract the v_allowed ARRAY[...] literal from the migration and compare sets.
const arr = (mig.match(/v_allowed TEXT\[\] :=\s*ARRAY\[([\s\S]*?)\];/) || [,''])[1]
const serverKeys = new Set((arr.match(/'([^']+)'/g) || []).map(s => s.replace(/'/g, '')))
const clientKeys = new Set(PRESET_ALLOWED_KEYS as readonly string[])
ok('client & server allowlists are the same size', serverKeys.size === clientKeys.size, `server=${serverKeys.size} client=${clientKeys.size}`)
let parity = true
for (const k of clientKeys) if (!serverKeys.has(k)) { parity = false; console.log(`    client-only key: ${k}`) }
for (const k of serverKeys) if (!clientKeys.has(k)) { parity = false; console.log(`    server-only key: ${k}`) }
ok('client & server allowlists match exactly', parity)
// The forbidden keys must NOT be in the server allowlist.
for (const forbidden of ['galleryTitle', 'password', 'clientCode', 'coverImagePath', 'eventDate', 'logoUrl']) {
  ok(`server allowlist excludes "${forbidden}"`, !serverKeys.has(forbidden))
}

// ── migration 111: security posture ──────────────────────────────────────────
const body = mig.replace(/--[^\n]*/g, '')
ok('enables RLS', /ALTER TABLE public\.gallery_presets ENABLE ROW LEVEL SECURITY/.test(body))
ok('owner-only policy via business_id', /business_id IN \(SELECT id FROM public\.businesses WHERE user_id = auth\.uid\(\)\)/.test(body))
ok('revokes anon', /REVOKE ALL ON public\.gallery_presets FROM anon/.test(body))
ok('grants authenticated only (CRUD)', /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.gallery_presets TO authenticated/.test(body))
ok('sanitizes settings in the trigger', /NEW\.settings := public\._sanitize_preset_settings\(NEW\.settings\)/.test(body))
ok('enforces single default per business', /UPDATE public\.gallery_presets[\s\S]*?SET is_default = false[\s\S]*?WHERE business_id = NEW\.business_id/.test(body))
ok('FK cascades on business delete', /REFERENCES public\.businesses\(id\) ON DELETE CASCADE/.test(body))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
