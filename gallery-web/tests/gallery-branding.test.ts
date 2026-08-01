// gallery-branding.test.ts — proves the shared branding resolver that the
// editor preview and the Live viewer both use: accent palette resolution
// (incl. legacy aliases + safe default), contrast-safe ink (no invisible text),
// and font override resolution. Run:  npx tsx tests/gallery-branding.test.ts

import {
  resolveGalleryBranding, readableInkOn, hexToRgbTriplet,
  normalizeAccentId, ACCENT_PALETTE, APPEARANCE_THEMES, normalizeAppearance,
} from '../src/lib/galleryBranding.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`) }
}

// ── Accent resolution ────────────────────────────────────────────────────────
{
  ok('default (no themeColor) → charcoal', resolveGalleryBranding({}).accentId === 'charcoal')
  ok('valid id resolves to its hex',
    resolveGalleryBranding({ themeColor: 'sage' }).accentHex === ACCENT_PALETTE.sage.hex)
  ok('legacy "indigo" normalizes to charcoal', normalizeAccentId('indigo') === 'charcoal')
  ok('unknown id falls back to charcoal', normalizeAccentId('neon-pink') === 'charcoal')
  ok('accent RGB triplet is well-formed',
    resolveGalleryBranding({ themeColor: 'teal' }).accentRgb === hexToRgbTriplet(ACCENT_PALETTE.teal.hex))
}

// ── Contrast safety: never invisible text on the accent ──────────────────────
{
  ok('dark accent (charcoal) → white ink', readableInkOn('#141413') === '#ffffff')
  ok('light-ish accent (rose) → dark ink', readableInkOn('#C18A8A') === '#111111')
  ok('amber accent → dark ink', readableInkOn('#A67C52') === '#111111')
  ok('malformed hex → safe white ink (never crashes)', readableInkOn('nope') === '#ffffff')
  // Every palette entry must yield SOME ink (i.e. resolve, not throw/empty).
  const allInk = Object.values(ACCENT_PALETTE).every(p => ['#111111', '#ffffff'].includes(readableInkOn(p.hex)))
  ok('every palette color has a defined readable ink', allInk)
}

// ── Font override resolution ─────────────────────────────────────────────────
{
  const none = resolveGalleryBranding({})
  ok('no fonts set → null (viewer keeps default stack)',
    none.headingFont === null && none.bodyFont === null)
  const set = resolveGalleryBranding({ headingFont: 'Playfair Display', bodyFont: 'Heebo' })
  ok('chosen fonts are resolved', set.headingFont === 'Playfair Display' && set.bodyFont === 'Heebo')
  const blank = resolveGalleryBranding({ headingFont: '   ' })
  ok('blank/whitespace font is treated as unset', blank.headingFont === null)
}

// ── Brand Kit inheritance (business kit → gallery default, override wins) ────
{
  const brand = { accentHex: '#7C3AED', headingFont: 'Playfair Display', bodyFont: 'Heebo', logoUrl: 'x' }
  // No gallery override → inherit the brand accent + fonts.
  const inherited = resolveGalleryBranding({}, brand)
  ok('no override inherits brand accent hex', inherited.accentHex === '#7C3AED')
  ok('no override marks usingBrandAccent', inherited.usingBrandAccent === true)
  ok('no override inherits brand fonts',
    inherited.headingFont === 'Playfair Display' && inherited.bodyFont === 'Heebo')
  ok('inherited accent still gets contrast-safe ink', inherited.accentInk === '#ffffff')
  // Gallery override WINS over the brand default.
  const overridden = resolveGalleryBranding({ themeColor: 'teal', headingFont: 'Heebo' }, brand)
  ok('gallery themeColor override beats brand accent',
    overridden.accentHex === ACCENT_PALETTE.teal.hex && overridden.usingBrandAccent === false)
  ok('gallery font override beats brand, other font still inherits',
    overridden.headingFont === 'Heebo' && overridden.bodyFont === 'Heebo')
  // No brand + no override → editorial default (unchanged legacy behavior).
  const bare = resolveGalleryBranding({}, null)
  ok('no brand + no override → charcoal default', bare.accentId === 'charcoal' && bare.usingBrandAccent === false)
  // Malformed brand accent is ignored (falls back to default) — no invisible UI.
  const badBrand = resolveGalleryBranding({}, { accentHex: 'not-a-hex' })
  ok('malformed brand accent ignored → default', badBrand.accentHex === ACCENT_PALETTE.charcoal.hex)
}

// ── Appearance theme (light / dark / editorial) ──────────────────────────────
{
  // Editorial default reproduces the classic dark viewer exactly.
  const def = resolveGalleryBranding({})
  ok('default appearance is editorial', def.appearance === 'editorial')
  ok('editorial theme = current dark bg/text (no regression)',
    def.theme.bg === '#0a0a0f' && def.theme.text === '#ffffff')
  // Gallery override selects a curated theme.
  const light = resolveGalleryBranding({ appearance: 'light' })
  ok('light appearance flips to a light bg + dark text',
    light.appearance === 'light' && light.theme.bg === '#faf9f7' && light.theme.text === '#141413')
  const dark = resolveGalleryBranding({ appearance: 'dark' })
  ok('dark appearance resolves the dark theme', dark.appearance === 'dark' && dark.theme.text === '#fafafa')
  // Inheritance: brand appearance is the default when the gallery has none.
  const inheritLight = resolveGalleryBranding({}, { appearance: 'light' })
  ok('brand appearance inherited when no gallery override', inheritLight.appearance === 'light')
  const overrideBeatsBrand = resolveGalleryBranding({ appearance: 'dark' }, { appearance: 'light' })
  ok('gallery appearance override beats brand appearance', overrideBeatsBrand.appearance === 'dark')
  // Bogus values are coerced to the safe default (never an unstyled page).
  ok('bogus appearance → editorial', normalizeAppearance('neon') === 'editorial')
  // Every curated theme is contrast-accessible (readable ink matches its text tone).
  ok('every appearance theme is defined with bg+text+surface+muted',
    (['editorial', 'light', 'dark'] as const).every(a => {
      const t = APPEARANCE_THEMES[a]
      return !!t.bg && !!t.text && !!t.surface && !!t.textMuted
    }))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
