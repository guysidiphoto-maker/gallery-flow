// ─────────────────────────────────────────────────────────────────────────────
// theme.ts — Pixflow design system (Editorial / warm). SINGLE SOURCE OF TRUTH.
//
// Decided 2026-06-20. Every surface (marketing, dashboard, client portal, and —
// via the `dark` namespace — the gallery viewer) reads its colors, type scale,
// spacing, radii and shadows from here. No more per-file inline color constants
// or three competing palettes. Import what you need:
//
//   import { color, text, space, radius, shadow, ease } from '../theme'
//
// Values intentionally match the editorial palette already used by the dashboard
// and viewer (charcoal/cream/sage), so adoption is unification — not a repaint.
// ─────────────────────────────────────────────────────────────────────────────

export const color = {
  // ── Light UI: marketing site + photographer dashboard + client portal ──
  bg:           '#F2EFE9', // warm cream — app background
  surface:      '#FBFAF7', // raised cards / panels
  surfaceAlt:   '#EAE6DD', // subtle fills, hover rows
  ink:          '#141413', // primary text / charcoal
  inkSoft:      '#3A3A38', // secondary text
  textMuted:    '#767470', // tertiary text — WCAG-AA on cream
  border:       '#E0DBD1', // hairline borders
  borderStrong: '#CFC8BB', // emphasized borders / dividers

  // ── Brand accent: sage ──
  accent:       '#7B8F6E',
  accentHover:  '#6B7E5F',
  accentSoft:   'rgba(123,143,110,.14)', // tinted backgrounds
  accentBorder: 'rgba(123,143,110,.40)',

  // ── Secondary editorial hues (tags, gallery themes, charts) ──
  rose:  '#C18A8A',
  amber: '#A67C52',
  teal:  '#5E8A8A',
  slate: '#64748B',

  // ── Semantic ──
  success: '#7B8F6E',
  error:   '#B4544B',
  warn:    '#A67C52',
  onAccent:'#FBFAF7', // text/icon on a filled accent surface

  // ── Dark surface: the gallery viewer (photos are the hero) ──
  dark: {
    bg:        '#0E0E10',
    surface:   '#17171A',
    text:      '#F5F3EF',
    textMuted: 'rgba(245,243,239,.62)',
    border:    'rgba(255,255,255,.10)',
    accent:    '#9DB089', // sage, lightened for contrast on near-black
  },
} as const

export const font = {
  // Serif display for editorial headlines; humanist sans for everything else.
  // Both already loaded in index.html.
  display: "'Playfair Display', 'Frank Ruhl Libre', Georgia, serif",
  sans:    "'Inter Tight', 'Heebo', 'Noto Sans Hebrew', system-ui, sans-serif",
} as const

// One 7-step type scale. Use these instead of ad-hoc font sizes so hierarchy is
// consistent everywhere. Spread into a style object: style={{ ...text.h2 }}.
export const text = {
  display: { fontFamily: font.display, fontSize: 'clamp(40px, 6vw, 72px)', lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.03em' },
  h1:      { fontFamily: font.display, fontSize: 'clamp(28px, 4vw, 40px)',  lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.02em' },
  h2:      { fontSize: 26, lineHeight: 1.2,  fontWeight: 700, letterSpacing: '-0.02em' },
  h3:      { fontSize: 20, lineHeight: 1.3,  fontWeight: 600, letterSpacing: '-0.015em' },
  body:    { fontSize: 15, lineHeight: 1.6,  fontWeight: 400 },
  small:   { fontSize: 13, lineHeight: 1.5,  fontWeight: 400 },
  label:   { fontSize: 11, lineHeight: 1.4,  fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const },
} as const

// 4px base spacing scale. space[4] === 16. Use for padding/margin/gap.
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64, 9: 96 } as const

export const radius = { sm: 8, md: 12, lg: 18, xl: 24, pill: 999 } as const

export const shadow = {
  sm: '0 1px 2px rgba(20,20,19,.06)',
  md: '0 8px 24px rgba(20,20,19,.10)',
  lg: '0 24px 64px rgba(20,20,19,.16)',
} as const

export const ease = {
  out:   'cubic-bezier(0.16, 1, 0.3, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
} as const

export const theme = { color, font, text, space, radius, shadow, ease } as const
export type Theme = typeof theme
