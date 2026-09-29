import type React from 'react'
import { border, textPrimary } from '../../styles'

export function PickerTile({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '14px 16px', cursor: 'pointer',
      border: `1px solid ${active ? textPrimary : border}`,
      background: active ? '#fff' : 'transparent',
      borderRadius: 2, fontFamily: 'inherit', textAlign: 'right' as const,
      transition: 'border-color .15s, background .15s',
    }}>{children}</button>
  )
}
