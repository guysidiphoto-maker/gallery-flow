import { border, textMuted, textPrimary } from '../../styles'
import { useEditor, useOpenGallery } from '../EditorContext'
import { SettingsSection } from './SettingsSection'
import { SettingsToggleRow } from './SettingsToggleRow'

const POSITIONS = [
  { id: 'bottom-right', label: '↘' },
  { id: 'bottom-left',  label: '↙' },
  { id: 'top-right',    label: '↗' },
  { id: 'top-left',     label: '↖' },
  { id: 'center',       label: '＋' },
] as const

export function WatermarkSection() {
  const { settings: { updateGallerySetting } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  return (
    <SettingsSection eyebrow="ווטרמרק">
      <SettingsToggleRow
        label="הצג ווטרמרק על תצוגות web"
        desc="שם העסק יופיע בפינה — מקור ההורדה תמיד נקי"
        on={Boolean(ds.watermarkEnabled)}
        onChange={() => updateGallerySetting('watermarkEnabled', !ds.watermarkEnabled)}
        last
      />
      {Boolean(ds.watermarkEnabled) && (
        <div style={{ marginTop: 12, paddingTop: 16, borderTop: `1px solid ${border}` }}>
          <label style={{ display: 'block' }}>
            <span style={{
              fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
              color: textMuted, textTransform: 'uppercase',
              display: 'block', marginBottom: 8,
            }}>טקסט</span>
            <input
              type="text"
              value={String(ds.watermarkText ?? '')}
              onChange={(e) => updateGallerySetting('watermarkText', e.target.value)}
              placeholder="© השם שלך"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 2,
                background: '#fff', border: `1px solid ${border}`,
                color: textPrimary, fontSize: 14, fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color .15s',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = textPrimary }}
              onBlur={(e) => { e.currentTarget.style.borderColor = border }}
            />
          </label>
          <div style={{
            fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
            color: textMuted, textTransform: 'uppercase',
            marginTop: 18, marginBottom: 10,
          }}>מיקום</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {POSITIONS.map(p => {
              const active = ((ds.watermarkPosition as string) || 'bottom-right') === p.id
              return (
                <button key={p.id} onClick={() => updateGallerySetting('watermarkPosition', p.id)}
                  aria-label={p.id}
                  style={{
                    width: 44, height: 44, borderRadius: 2,
                    background: active ? '#fff' : 'transparent',
                    border: `1px solid ${active ? textPrimary : border}`,
                    color: textPrimary,
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 18,
                    transition: 'border-color .15s, background .15s',
                  }}>{p.label}</button>
              )
            })}
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
