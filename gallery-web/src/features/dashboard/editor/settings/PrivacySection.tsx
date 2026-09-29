import { border, textMuted, textPrimary } from '../../styles'
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
        <div style={{ paddingTop: 14 }}>
          <label htmlFor="client-code-input" style={{ display: 'block', fontSize: 12, fontWeight: 500, color: textPrimary, marginBottom: 6 }}>
            קוד הזדהות ללקוח
          </label>
          <input
            id="client-code-input"
            type="text"
            dir="ltr"
            value={(ds.clientCode as string) ?? ''}
            onChange={e => updateGallerySetting('clientCode', e.target.value.toUpperCase().slice(0, 32))}
            placeholder="לדוגמה: DAVID2026"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '11px 13px',
              borderRadius: 2, border: `1px solid ${border}`,
              background: '#fff', color: textPrimary, fontSize: 14,
              letterSpacing: '0.08em', textAlign: 'left' as const, outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.5, marginTop: 6 }}>
            {(ds.clientCode as string)?.trim()
              ? 'מסרו את הקוד הזה ללקוח בלבד. ללא הקוד הוא ייכנס כאורח רגיל.'
              : 'הזינו קוד. כל עוד השדה ריק, הלקוח לא יוכל להזדהות כאדמין.'}
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
