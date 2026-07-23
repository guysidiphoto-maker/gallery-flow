// CoverFallback — a designed placeholder cover for a gallery with no image.
//
// The test environment has NO real image files, so this is the COMMON path,
// not an edge case: it must look intentional and premium, never like a broken
// <img>. We derive a deterministic soft gradient + an initials monogram from
// the gallery name so each gallery gets a stable, distinct, tasteful cover.

import type { CSSProperties } from 'react'
import { tokens } from './tokens'

// A curated set of calm, low-saturation duotone gradients that sit well on the
// cream canvas — no neon, no clashing with the charcoal type overlay.
const GRADIENTS: Array<[string, string]> = [
  ['#E8E3D9', '#CBBFA8'],
  ['#DCE1DA', '#AEB8A6'],
  ['#E5DCD5', '#C4A98F'],
  ['#DDE0E4', '#A9AEB8'],
  ['#E7DEDA', '#BFA39A'],
  ['#DCE3E0', '#9FB3AD'],
  ['#E4E0D6', '#B7AE8E'],
  ['#E0DBE0', '#ABA0B0'],
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

// First glyphs of up to two words. Works for Hebrew and Latin scripts (uses the
// grapheme as-is; Hebrew has no case so we skip uppercasing when non-Latin).
function initials(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return '•'
  const words = cleaned.split(/\s+/).filter(Boolean)
  const take = words.length >= 2 ? [words[0][0], words[1][0]] : [cleaned.slice(0, 2)]
  const joined = take.join('')
  // Uppercase only Latin letters; Hebrew stays as-is.
  return /[a-z]/i.test(joined) ? joined.toUpperCase() : joined
}

interface Props {
  name: string
  /** Aspect ratio for the cover box, e.g. '3 / 2' (default) or '1'. */
  aspectRatio?: string
  rounded?: boolean
}

export function CoverFallback({ name, aspectRatio = '3 / 2', rounded = false }: Props) {
  const h = hashString(name || 'gallery')
  const [from, to] = GRADIENTS[h % GRADIENTS.length]
  const angle = 120 + (h % 6) * 15

  const box: CSSProperties = {
    aspectRatio,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    background: `linear-gradient(${angle}deg, ${from}, ${to})`,
    borderRadius: rounded ? 4 : 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <div style={box} aria-hidden>
      {/* Faint monogram watermark */}
      <span
        style={{
          fontFamily: 'Georgia, "Frank Ruhl Libre", serif',
          fontSize: 'clamp(28px, 12cqmin, 64px)',
          fontWeight: 500,
          color: tokens.textPrimary,
          opacity: 0.34,
          letterSpacing: '0.04em',
          userSelect: 'none',
        }}
      >
        {initials(name)}
      </span>
      {/* Hairline inner frame for a printed, editorial feel */}
      <span
        style={{
          position: 'absolute',
          inset: 10,
          border: '1px solid rgba(20,20,19,0.12)',
          borderRadius: rounded ? 3 : 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
