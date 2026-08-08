// EmptyState — a warm, editorial empty state. Never a cold "no data" table
// message. Optional action renders as a subtle outlined button.

import type { ReactNode } from 'react'
import { tokens, eyebrow, serifDisplay } from './tokens'

interface Props {
  eyebrow?: string
  title: string
  body?: string
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({ eyebrow: eb, title, body, icon, action }: Props) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '64px 32px',
        background: tokens.bgSubtle,
        border: `1px solid ${tokens.border}`,
        borderRadius: 4,
        maxWidth: 520,
        margin: '0 auto',
      }}
    >
      {icon && (
        <div style={{ color: tokens.textMuted, display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          {icon}
        </div>
      )}
      {eb && <div style={{ ...eyebrow, marginBottom: 14 }}>{eb}</div>}
      <h3 style={{ ...serifDisplay, fontSize: 22, margin: '0 0 10px', lineHeight: 1.2 }}>{title}</h3>
      {body && (
        <p style={{ fontSize: 14, color: tokens.textSecondary, margin: 0, lineHeight: 1.6, maxWidth: 380, marginInline: 'auto' }}>
          {body}
        </p>
      )}
      {action && <div style={{ marginTop: 22 }}>{action}</div>}
    </div>
  )
}
