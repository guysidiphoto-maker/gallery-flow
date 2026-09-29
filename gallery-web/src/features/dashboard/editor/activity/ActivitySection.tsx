import type React from 'react'
import { border, textMuted } from '../../styles'

// Eyebrow + hairline-topped list shared by every activity list.
export function ActivitySection({ eyebrow, marginBottom = 32, children }: {
  eyebrow: string
  marginBottom?: number
  children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom }}>
      <div style={{
        fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
        color: textMuted, textTransform: 'uppercase',
        marginBottom: 12,
      }}>
        {eyebrow}
      </div>
      <div style={{ borderTop: `1px solid ${border}` }}>
        {children}
      </div>
    </section>
  )
}

export const activityTimeStyle: React.CSSProperties = {
  color: textMuted, fontSize: 12,
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
  minWidth: 110, textAlign: 'left' as const,
}

export function formatActivityTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
