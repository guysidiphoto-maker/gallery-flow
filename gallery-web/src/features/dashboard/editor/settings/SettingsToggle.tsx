import type React from 'react'
import { border, textPrimary } from '../../styles'

export function SettingsToggle({ on, onClick }: { on: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <div
      role="switch" aria-checked={on}
      onClick={onClick}
      style={{
        width: 44, height: 24, borderRadius: 24, padding: 2,
        background: on ? textPrimary : border,
        transition: 'background .2s', flexShrink: 0,
        cursor: 'pointer', position: 'relative',
      }}>
      <div style={{
        width: 20, height: 20, borderRadius: 10, background: '#fff',
        transition: 'transform .2s',
        transform: on ? 'translateX(-20px)' : 'translateX(0)',
        boxShadow: '0 1px 3px rgba(0,0,0,.18)',
      }} />
    </div>
  )
}
