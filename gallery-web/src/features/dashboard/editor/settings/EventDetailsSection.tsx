import { border, textMuted, textPrimary } from '../../styles'
import { useEditor, useOpenGallery } from '../EditorContext'
import { SettingsSection } from './SettingsSection'

// delivery_settings.eventDate/eventLocation; the RPC dual-writes the typed
// galleries columns, which are shown as the fallback.
export function EventDetailsSection() {
  const { settings: { updateGallerySetting } } = useEditor()
  const gallery = useOpenGallery()
  const ds = (gallery.delivery_settings ?? {}) as Record<string, unknown>
  return (
    <SettingsSection eyebrow="פרטי האירוע">
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: textPrimary, marginBottom: 6 }}>
            תאריך האירוע
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="date"
              value={(ds.eventDate as string) || (gallery.event_date ?? '')}
              onChange={(e) => updateGallerySetting('eventDate', e.target.value)}
              aria-label="תאריך האירוע"
              style={{
                padding: '10px 12px', borderRadius: 2, border: `1px solid ${border}`,
                background: '#fff', color: textPrimary, fontFamily: 'inherit', fontSize: 13,
              }}
            />
            {((ds.eventDate as string) || gallery.event_date) ? (
              <button
                onClick={() => updateGallerySetting('eventDate', '')}
                style={{
                  padding: '8px 12px', borderRadius: 2, border: `1px solid ${border}`,
                  background: 'transparent', color: textMuted, fontFamily: 'inherit',
                  fontSize: 12, cursor: 'pointer',
                }}>נקה</button>
            ) : null}
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: textPrimary, marginBottom: 6 }}>
            מיקום
          </label>
          <input
            type="text"
            defaultValue={(ds.eventLocation as string) || (gallery.event_location ?? '')}
            onBlur={(e) => {
              const v = e.target.value.trim()
              const cur = (ds.eventLocation as string) || (gallery.event_location ?? '')
              if (v !== cur) updateGallerySetting('eventLocation', v)
            }}
            placeholder="עיר / אולם"
            aria-label="מיקום האירוע"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 2, border: `1px solid ${border}`,
              background: '#fff', color: textPrimary, fontFamily: 'inherit', fontSize: 13,
            }}
          />
        </div>
      </div>
    </SettingsSection>
  )
}
