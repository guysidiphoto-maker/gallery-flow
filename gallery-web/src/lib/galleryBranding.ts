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

export interface ResolvedBranding {
  accentId: AccentId
  accentHex: string
  /** "r, g, b" — for `--accent`, consumed by every rgb(var(--accent)) rule. */
  accentRgb: string
  /** Readable ink (#fff or #111) to place ON the accent, contrast-safe. */
  accentInk: string
  headingFont: string | null
  bodyFont: string | null
}

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
): ResolvedBranding {
  const accentId = normalizeAccentId(str(raw, 'themeColor'))
  const accentHex = ACCENT_PALETTE[accentId].hex
  return {
    accentId,
    accentHex,
    accentRgb: hexToRgbTriplet(accentHex),
    accentInk: readableInkOn(accentHex),
    headingFont: str(raw, 'headingFont'),
    bodyFont: str(raw, 'bodyFont'),
  }
}
