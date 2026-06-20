// Badge — small status/tag pill. Tones map to the theme's semantic + accent
// colors. Use for "Published", "גלריה שולמה", plan highlights, etc.

import React from 'react'
import { color, radius, font } from '../../theme'

type Tone = 'accent' | 'neutral' | 'success' | 'warn' | 'error'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

function toneStyle(tone: Tone): React.CSSProperties {
  switch (tone) {
    case 'accent':  return { background: color.accentSoft, color: color.accent, border: `1px solid ${color.accentBorder}` }
    case 'success': return { background: 'rgba(123,143,110,.14)', color: color.success, border: '1px solid rgba(123,143,110,.40)' }
    case 'warn':    return { background: 'rgba(166,124,82,.14)', color: color.warn, border: '1px solid rgba(166,124,82,.40)' }
    case 'error':   return { background: 'rgba(180,84,75,.12)', color: color.error, border: '1px solid rgba(180,84,75,.38)' }
    case 'neutral': return { background: color.surfaceAlt, color: color.inkSoft, border: `1px solid ${color.border}` }
  }
}

export function Badge({ tone = 'neutral', className = '', style, children, ...rest }: BadgeProps) {
  return (
    <span
      className={className}
      style={{
        ...toneStyle(tone),
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: radius.sm,
        fontFamily: font.sans, fontSize: 12, fontWeight: 600, lineHeight: 1.2,
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  )
}
