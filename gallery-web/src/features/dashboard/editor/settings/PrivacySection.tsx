import { Input } from '@/shared/ui'
import { useEditor, useOpenGallery } from '../EditorContext'
import { SettingsSection } from './SettingsSection'
import { SettingsToggleRow } from './SettingsToggleRow'

// Client-as-admin: the gallery opens with a "client or guest?" gate; the client
// enters this code and can then hide photos from guests.
export function PrivacySection() {
  const { settings: { updateGallerySetting } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  const enabled = Boolean(ds.clientSelectionEnabled)
  return (
    <SettingsSection eyebrow="פרטיות">
      <SettingsToggleRow
        label="הגדר לקוח כאדמין"
        desc="בפתיחת הגלריה הלקוח יבחר 'אני הלקוח' ויזין קוד הזדהות. לאחר מכן יוכל להסתיר תמונות משאר האורחים (הוא עצמו רואה הכל)."
        on={enabled}
        onChange={() => updateGallerySetting('clientSelectionEnabled', !ds.clientSelectionEnabled)}
        last={!enabled}
      />
      {enabled && (
        <div className="pt-3.5">
          <label htmlFor="client-code-input" className="mb-1.5 block text-[12px] font-medium text-ink">
            קוד הזדהות ללקוח
          </label>
          <Input
            id="client-code-input"
            type="text"
            dir="ltr"
            value={(ds.clientCode as string) ?? ''}
            onChange={e => updateGallerySetting('clientCode', e.target.value.toUpperCase().slice(0, 32))}
            placeholder="לדוגמה: DAVID2026"
            className="px-[13px] py-[11px] text-left text-[14px] tracking-[0.08em]"
          />
          <div className="mt-1.5 text-[11px] leading-normal text-muted">
            {(ds.clientCode as string)?.trim()
              ? 'מסרו את הקוד הזה ללקוח בלבד. ללא הקוד הוא ייכנס כאורח רגיל.'
              : 'הזינו קוד. כל עוד השדה ריק, הלקוח לא יוכל להזדהות כאדמין.'}
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
