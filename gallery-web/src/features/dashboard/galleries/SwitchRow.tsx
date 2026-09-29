import type React from 'react'
import { border, textMuted, textPrimary } from '../styles'

// Title + description with a charcoal switch knob; the whole row is the click target.
export function SwitchRow({ title, desc, on, onClick }: {
  title: React.ReactNode
  desc: React.ReactNode
  on: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', userSelect: 'none', gap: 12,
      }}
    >
      <div>
        <span style={{
          fontSize: 13, color: textPrimary, fontWeight: 500, display: 'block',
          marginBottom: 4,
        }}>
          {title}
        </span>
        <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
          {desc}
        </span>
      </div>
      <div style={{
        width: 44, height: 24, borderRadius: 24, padding: 2,
        background: on ? textPrimary : border,
        transition: 'background .2s', flexShrink: 0,
        cursor: 'pointer', position: 'relative',
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: 10,
          background: '#fff',
          transition: 'transform .2s',
          transform: on ? 'translateX(-20px)' : 'translateX(0)',
          boxShadow: '0 1px 3px rgba(0,0,0,.18)',
        }} />
      </div>
    </div>
  )
}
