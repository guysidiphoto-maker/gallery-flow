import { border, textMuted, textPrimary } from '../../styles'
import { useEditor, useOpenGallery } from '../EditorContext'
import { SettingsSection } from './SettingsSection'
import { SettingsToggleRow } from './SettingsToggleRow'
import { PickerTile } from './PickerTile'

const PRIVACY_MODES = [
  { id: 'open',    label: 'פתוח',  desc: 'כולם רואים את כל התמונות' },
  { id: 'private', label: 'פרטי',  desc: 'כל אורח רואה רק את התמונות שלו' },
] as const

export function FaceRecognitionSection() {
  const { settings: { updateGallerySetting, toggleFaceIndex } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  return (
    <SettingsSection eyebrow="זיהוי פנים">
      <SettingsToggleRow
        label="הפעל זיהוי פנים"
        desc="אורחים יוכלו למצוא את עצמם בסלפי. עלות: ללא תוספת טוקנים."
        on={Boolean(ds.faceIndexEnabled)}
        onChange={() => { void toggleFaceIndex() }}
        last
      />
      {Boolean(ds.faceIndexEnabled) && (
        <div style={{ marginTop: 12, paddingTop: 16, borderTop: `1px solid ${border}` }}>
          <div style={{
            fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
            color: textMuted, textTransform: 'uppercase', marginBottom: 12,
          }}>מצב פרטיות</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {PRIVACY_MODES.map(m => {
              const active = ((ds.facePrivacyMode as string) || 'open') === m.id
              return (
                <PickerTile key={m.id} active={active} onClick={() => updateGallerySetting('facePrivacyMode', m.id)}>
                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: textPrimary, marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.4 }}>{m.desc}</div>
                </PickerTile>
              )
            })}
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
