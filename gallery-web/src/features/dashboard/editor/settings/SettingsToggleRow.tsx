import { border, textMuted, textPrimary } from '../../styles'
import { SettingsToggle } from './SettingsToggle'

export function SettingsToggleRow({ label, desc, on, onChange, last }: {
  label: string; desc: string; on: boolean; onChange: () => void; last?: boolean
}) {
  return (
    <div onClick={(e) => { e.stopPropagation(); onChange() }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 0', cursor: 'pointer', userSelect: 'none', gap: 16,
        borderBottom: last ? 'none' : `1px solid ${border}`,
      }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <SettingsToggle on={on} onClick={(e) => { e.stopPropagation(); onChange() }} />
    </div>
  )
}
