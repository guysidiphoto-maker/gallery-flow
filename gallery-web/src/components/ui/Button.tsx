// Button — shared, theme-driven. Replaces the dozens of ad-hoc inline-styled
// buttons across surfaces. Variants: primary (filled sage), secondary (ink
// outline), ghost (text). Sizes: sm / md / lg. Accessible focus-visible ring;
// RTL-safe (uses logical layout, no hard-coded left/right).

import React from 'react'
import { color, radius, ease, font } from '../../theme'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}

// Inject hover/focus rules once — inline styles can't express :focus-visible.
const STYLE_ID = 'pf-button-styles'
function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
    .pf-btn { transition: transform .15s ${ease.out}, background .15s ${ease.out}, border-color .15s ${ease.out}, opacity .15s ${ease.out}; }
    .pf-btn:focus-visible { outline: 2px solid ${color.accent}; outline-offset: 2px; }
    .pf-btn:disabled { opacity: .5; cursor: not-allowed; }
    .pf-btn-primary:not(:disabled):hover   { background: ${color.accentHover}; }
    .pf-btn-secondary:not(:disabled):hover { border-color: ${color.ink}; background: ${color.surfaceAlt}; }
    .pf-btn-ghost:not(:disabled):hover     { background: ${color.accentSoft}; }
    .pf-btn:not(:disabled):active { transform: translateY(1px); }
  `
  document.head.appendChild(el)
}

const SIZES: Record<Size, React.CSSProperties> = {
  sm: { padding: '7px 14px', fontSize: 13 },
  md: { padding: '10px 20px', fontSize: 14 },
  lg: { padding: '14px 28px', fontSize: 15 },
}

function variantStyle(v: Variant): React.CSSProperties {
  switch (v) {
    case 'primary':   return { background: color.accent, color: color.onAccent, border: '1px solid transparent' }
    case 'secondary': return { background: 'transparent', color: color.ink, border: `1px solid ${color.borderStrong}` }
    case 'ghost':     return { background: 'transparent', color: color.ink, border: '1px solid transparent' }
  }
}

export function Button({
  variant = 'primary', size = 'md', fullWidth, className = '', style, children, ...rest
}: ButtonProps) {
  ensureStyles()
  return (
    <button
      className={`pf-btn pf-btn-${variant} ${className}`.trim()}
      style={{
        ...variantStyle(variant),
        ...SIZES[size],
        fontFamily: font.sans,
        fontWeight: 600,
        borderRadius: radius.md,
        cursor: 'pointer',
        width: fullWidth ? '100%' : undefined,
        letterSpacing: '-0.01em',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
