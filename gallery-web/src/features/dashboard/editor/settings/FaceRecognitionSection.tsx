import { Eyebrow, cn } from '@/shared/ui'
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
        <div className="mt-3 border-t border-line pt-4">
          <Eyebrow className="mb-3 block text-[9px] font-medium">מצב פרטיות</Eyebrow>
          <div className="flex gap-2">
            {PRIVACY_MODES.map(m => {
              const active = ((ds.facePrivacyMode as string) || 'open') === m.id
              return (
                <PickerTile key={m.id} active={active} onClick={() => updateGallerySetting('facePrivacyMode', m.id)}>
                  <div className={cn('mb-1 text-[13px] text-ink', active ? 'font-semibold' : 'font-medium')}>{m.label}</div>
                  <div className="text-[11px] leading-[1.4] text-muted">{m.desc}</div>
                </PickerTile>
              )
            })}
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
