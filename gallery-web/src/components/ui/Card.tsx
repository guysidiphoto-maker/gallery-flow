// Card — shared surface panel. Theme-driven background, hairline border, radius
// and optional elevation. Use for gallery cards, pricing tiers, modals' inner
// panels, dashboard sections — anywhere a raised surface is needed.

import React from 'react'
import { color, radius, shadow, ease } from '../../theme'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean      // adds a soft shadow
  interactive?: boolean   // hover lift (for clickable cards)
  pad?: number            // inner padding (default 24)
}

const STYLE_ID = 'pf-card-styles'
function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
    .pf-card { transition: transform .2s ${ease.out}, box-shadow .2s ${ease.out}, border-color .2s ${ease.out}; }
    .pf-card-interactive:hover { transform: translateY(-2px); box-shadow: ${shadow.md}; border-color: ${color.borderStrong}; }
  `
  document.head.appendChild(el)
}

export function Card({ elevated, interactive, pad = 24, className = '', style, children, ...rest }: CardProps) {
  ensureStyles()
  return (
    <div
      className={`pf-card ${interactive ? 'pf-card-interactive' : ''} ${className}`.trim()}
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.lg,
        padding: pad,
        boxShadow: elevated ? shadow.md : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
