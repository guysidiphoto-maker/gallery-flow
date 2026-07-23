// Shared editorial design tokens for the Client Portal V2 presentation layer.
// Mirrors the palette used across the photographer admin so the client portal
// reads as the same premium product — calm off-white canvas, hairline borders,
// charcoal ink, a single sage status accent.

import type { CSSProperties } from 'react'

export const tokens = {
  bg: '#F2EFE9',          // cream canvas
  bgSubtle: '#FAF9F5',    // section panels
  card: '#FBFBF9',        // raised surfaces
  border: '#E2DFD8',      // soft hairline
  borderStrong: '#D0D0D0',
  textPrimary: '#141413', // charcoal ink
  textSecondary: '#333333',
  textMuted: '#767470',   // WCAG-AA muted on cream
  statusLive: '#7B8F6E',  // sage status dot
  focusRing: '#141413',
} as const

// Thin, uppercase, wide-tracked label — the portal's signature meta type.
export const eyebrow: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: tokens.textMuted,
}

// Serif display heading used for section titles + the greeting.
export const serifDisplay: CSSProperties = {
  fontFamily: 'Georgia, "Times New Roman", "Frank Ruhl Libre", serif',
  fontWeight: 500,
  letterSpacing: '-0.01em',
  color: tokens.textPrimary,
}

export const focusVisible = `
  .pf-focus:focus-visible {
    outline: 2px solid ${tokens.focusRing};
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .pf-anim { transition: none !important; animation: none !important; }
  }
`
