import { Input } from '@/shared/ui'
import { useEditor, useOpenGallery } from '../EditorContext'
import { SettingsSection } from './SettingsSection'

const labelClass = 'mb-1.5 block text-[13px] font-medium text-ink'

// delivery_settings.eventDate/eventLocation; the RPC dual-writes the typed
// galleries columns, which are shown as the fallback.
export function EventDetailsSection() {
  const { settings: { updateGallerySetting } } = useEditor()
  const gallery = useOpenGallery()
  const ds = (gallery.delivery_settings ?? {}) as Record<string, unknown>
  return (
    <SettingsSection eyebrow="פרטי האירוע">
      <div className="grid gap-3.5">
        <div>
          <label className={labelClass}>תאריך האירוע</label>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={(ds.eventDate as string) || (gallery.event_date ?? '')}
              onChange={(e) => updateGallerySetting('eventDate', e.target.value)}
              aria-label="תאריך האירוע"
              className="w-auto px-3 py-2.5 text-[13px]"
            />
            {((ds.eventDate as string) || gallery.event_date) ? (
              <button
                onClick={() => updateGallerySetting('eventDate', '')}
                className="rounded-hair border border-line bg-transparent px-3 py-2 text-[12px] text-muted"
              >נקה</button>
            ) : null}
          </div>
        </div>
        <div>
          <label className={labelClass}>מיקום</label>
          <Input
            type="text"
            defaultValue={(ds.eventLocation as string) || (gallery.event_location ?? '')}
            onBlur={(e) => {
              const v = e.target.value.trim()
              const cur = (ds.eventLocation as string) || (gallery.event_location ?? '')
              if (v !== cur) updateGallerySetting('eventLocation', v)
            }}
            placeholder="עיר / אולם"
            aria-label="מיקום האירוע"
            className="px-3 py-2.5 text-[13px]"
          />
        </div>
      </div>
    </SettingsSection>
  )
}
