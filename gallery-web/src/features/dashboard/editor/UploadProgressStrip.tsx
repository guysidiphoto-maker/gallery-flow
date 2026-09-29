import type React from 'react'
import { bgSubtle, border, textPrimary } from '../styles'

// Inline single-row progress strip shared by the Photos and Stories tabs.
export function UploadProgressStrip({ label, aside, pct }: {
  label: React.ReactNode
  aside?: React.ReactNode
  pct: number
}) {
  return (
    <div style={{
      marginBottom: 20, padding: '14px 18px',
      background: bgSubtle, border: `1px solid ${border}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 12, color: textPrimary, marginBottom: 8,
        fontWeight: 500, letterSpacing: '0.04em',
      }}>
        {label}
        {aside}
      </div>
      <div style={{ width: '100%', height: 2, background: border, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%', background: textPrimary,
          transition: 'width .3s',
        }} />
      </div>
    </div>
  )
}
