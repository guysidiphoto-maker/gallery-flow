// galleryBranding.ts — the ONE place that resolves a gallery's colors + fonts
// from its saved delivery_settings, so the editor preview, the Preview route,
// and the Live viewer render identical branding. Pairs with galleryLayout.ts
// (grid) to form the resolved design object the whole app reads.
//
// Inheritance model:
//   • A gallery is created with its business Brand Kit's identity (studio name,
//     logo) projected into delivery_settings (see brandKit.applyBrandKitTo-
//     GalleryDefaults). Colors + fonts start from safe editorial defaults.
//   • The owner may OVERRIDE the accent palette and fonts per gallery in the
//     Design tab.
//   • "Reset to brand defaults" clears those overrides (and re-applies brand
//     fonts/identity), so the gallery returns to the studio's look.
// The public viewer resolves from delivery_settings only — one source of truth,
// no accidental inheritance of another gallery's colors.

export type AccentId = 'charcoal' | 'sage' | 'rose' | 'amber' | 'teal' | 'slate'

// Editorial accent palette — the SINGLE source of truth for both the
// photographer-side Design tab swatches and the public viewer's --accent.
export const ACCENT_PALETTE: Record<AccentId, { hex: string; labelHe: string }> = {
  charcoal: { hex: '#141413', labelHe: 'פחם' },
  sage:     { hex: '#7B8F6E', labelHe: 'מרווה' },
  rose:     { hex: '#C18A8A', labelHe: 'ורוד עתיק' },
  amber:    { hex: '#A67C52', labelHe: 'ענבר' },
  teal:     { hex: '#5E8A8A', labelHe: 'טורקיז' },
  slate:    { hex: '#64748b', labelHe: 'צפחה' },
}

// Legacy palette ids from galleries created before the editorial palette.
const LEGACY_ACCENT_ALIAS: Record<string, AccentId> = {
  indigo: 'charcoal', // was #6366f1 — re-mapped to charcoal
}

const DEFAULT_ACCENT: AccentId = 'charcoal'

// ── Appearance (background / text) themes ───────────────────────────────────
// A CONTROLLED set of curated, contrast-validated palettes — not arbitrary
// color pickers — so a gallery's background + text can never become
// inaccessible. 'editorial' reproduces the current viewer EXACTLY (byte-for-hex)
// so existing galleries are visually unchanged; 'light' and 'dark' flip the
// page. Accent + accent-ink are resolved separately and layer on top.
export type Appearance = 'editorial' | 'light' | 'dark'

export interface AppearanceTheme {
  bg: string          // page background
  surface: string     // cards / raised chrome
  text: string        // primary text (WCAG AA on bg)
  textMuted: string   // secondary text (AA-large on bg)
}

export const APPEARANCE_THEMES: Record<Appearance, AppearanceTheme> = {
  // Matches styles.css body defaults today — DO NOT change (backward compat).
  editorial: { bg: '#0a0a0f', surface: '#141419', text: '#ffffff', textMuted: 'rgba(255,255,255,0.65)' },
  dark:      { bg: '#111114', surface: '#1c1c22', text: '#fafafa', textMuted: 'rgba(250,250,250,0.62)' },
  light:     { bg: '#faf9f7', surface: '#ffffff', text: '#141413', textMuted: 'rgba(20,20,19,0.60)' },
}

const DEFAULT_APPEARANCE: Appearance = 'editorial'

export function normalizeAppearance(v: string | null | undefined): Appearance {
  return v === 'light' || v === 'dark' || v === 'editorial' ? v : DEFAULT_APPEARANCE
}

/**
 * Business Brand Kit defaults, exposed to the public viewer via gallery_get_meta
 * (only this safe subset — accent hex + fonts + logo — is surfaced, never the
 * full brand_kit). When a gallery has no per-gallery override for a property,
 * the resolver inherits it from here.
 */
export interface BrandDefaults {
  accentHex?: string | null
  headingFont?: string | null
  bodyFont?: string | null
  logoUrl?: string | null
  appearance?: string | null
}

export interface ResolvedBranding {
  /** Palette id when a gallery override is set; null when inheriting a brand hex. */
  accentId: AccentId | null
  accentHex: string
  /** "r, g, b" — for `--accent`, consumed by every rgb(var(--accent)) rule. */
  accentRgb: string
  /** Readable ink (#fff or #111) to place ON the accent, contrast-safe. */
  accentInk: string
  headingFont: string | null
  bodyFont: string | null
  /** True when the accent came from the business Brand Kit, not a gallery override. */
  usingBrandAccent: boolean
  /** Resolved appearance + its curated, contrast-safe background/text palette. */
  appearance: Appearance
  theme: AppearanceTheme
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function str(raw: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = raw?.[key]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/** #rrggbb → "r, g, b". Falls back to the default accent on a malformed hex. */
export function hexToRgbTriplet(hex: string): string {
  const h = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hexToRgbTriplet(ACCENT_PALETTE[DEFAULT_ACCENT].hex)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

/**
 * Contrast-safe ink for text/icons placed ON a colored background. Uses the
 * WCAG relative-luminance threshold so buttons never render invisible text
 * (e.g. dark text on the charcoal accent).
 */
export function readableInkOn(hex: string): string {
  const h = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#ffffff'
  const toLin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const r = toLin(parseInt(h.slice(0, 2), 16))
  const g = toLin(parseInt(h.slice(2, 4), 16))
  const b = toLin(parseInt(h.slice(4, 6), 16))
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Pick whichever ink gives the higher WCAG contrast ratio against this bg
  // (dark ink wins for mid/light accents like rose/amber; white for dark ones).
  const contrastWhite = (1.05) / (lum + 0.05)          // white L = 1.0
  const contrastBlack = (lum + 0.05) / (0.0 + 0.05)    // black L = 0.0
  return contrastBlack >= contrastWhite ? '#111111' : '#ffffff'
}

/** Normalize any stored themeColor id (incl. legacy aliases) to a palette id. */
export function normalizeAccentId(id: string | null | undefined): AccentId {
  if (!id) return DEFAULT_ACCENT
  if (id in ACCENT_PALETTE) return id as AccentId
  if (id in LEGACY_ACCENT_ALIAS) return LEGACY_ACCENT_ALIAS[id]
  return DEFAULT_ACCENT
}

/** Resolve colors + fonts for a gallery from its delivery_settings. */
export function resolveGalleryBranding(
  raw: Record<string, unknown> | null | undefined,
  brand?: BrandDefaults | null,
): ResolvedBranding {
  // Accent inheritance: a gallery override (themeColor palette id) wins; else
  // the business Brand Kit accent hex; else the editorial default.
  const themeColorId = str(raw, 'themeColor')
  let accentId: AccentId | null
  let accentHex: string
  let usingBrandAccent = false
  if (themeColorId) {
    accentId = normalizeAccentId(themeColorId)
    accentHex = ACCENT_PALETTE[accentId].hex
  } else if (brand?.accentHex && HEX_RE.test(brand.accentHex)) {
    accentId = null
    accentHex = brand.accentHex
    usingBrandAccent = true
  } else {
    accentId = DEFAULT_ACCENT
    accentHex = ACCENT_PALETTE[DEFAULT_ACCENT].hex
  }
  // Fonts inherit the brand family when the gallery hasn't chosen one.
  const headingFont = str(raw, 'headingFont') ?? (brand?.headingFont?.trim() || null)
  const bodyFont = str(raw, 'bodyFont') ?? (brand?.bodyFont?.trim() || null)
  // Appearance: gallery override → brand default → editorial. Curated palette,
  // so background/text are always accessible regardless of the choice.
  const appearance = normalizeAppearance(str(raw, 'appearance') ?? brand?.appearance ?? null)
  return {
    accentId,
    accentHex,
    accentRgb: hexToRgbTriplet(accentHex),
    accentInk: readableInkOn(accentHex),
    headingFont,
    bodyFont,
    usingBrandAccent,
    appearance,
    theme: APPEARANCE_THEMES[appearance],
  }
}
