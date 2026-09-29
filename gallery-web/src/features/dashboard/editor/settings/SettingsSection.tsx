import type React from 'react'
import { bgSubtle, border, textMuted } from '../../styles'

export function SettingsSection({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <section style={{
      padding: '24px 24px 16px',
      background: bgSubtle,
      border: `1px solid ${border}`,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
        color: textMuted, textTransform: 'uppercase', marginBottom: 12,
      }}>{eyebrow}</div>
      {children}
    </section>
  )
}
