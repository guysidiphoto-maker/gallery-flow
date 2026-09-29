import { APPEARANCE_THEMES } from '@/shared/gallery/galleryBranding'
import { Eyebrow, cn } from '@/shared/ui'
import { OptionTile } from '@/shared/ui/OptionTile'
import { useEditor, useOpenGallery } from '../EditorContext'
import { THEME_COLORS } from '../themeColors'
import { labelClass } from './designStyles'

const APPEARANCES = [
  { id: 'editorial', label: 'אדיטוריאל' },
  { id: 'light',     label: 'בהיר' },
  { id: 'dark',      label: 'כהה' },
] as const

// Appearance (contrast-safe bg + text theme) and accent palette. Swatch colors are
// the gallery palettes themselves, so they stay inline.
export function ColorSubTab() {
  const { settings: { updateGallerySetting } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Eyebrow className={labelClass}>מראה הגלריה</Eyebrow>
        <div className="mb-2 text-[11px] leading-[1.4] text-muted">
          רקע וצבע טקסט — נגישים תמיד. ברירת המחדל מגיעה ממותג העסק.
        </div>
        <div className="flex gap-2">
          {APPEARANCES.map(a => {
            const active = ((ds.appearance as string) || 'editorial') === a.id
            return (
              <OptionTile key={a.id} selected={active} onClick={() => updateGallerySetting('appearance', a.id)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 px-2.5 py-3 text-[12px] text-ink',
                  active ? 'font-semibold' : 'font-medium',
                )}>
                <span className="size-4 rounded-full border border-line" style={{ background: APPEARANCE_THEMES[a.id].bg }} />
                {a.label}
              </OptionTile>
            )
          })}
        </div>
      </div>
      <div className="text-[12px] leading-normal text-ink-soft">
        צבע ההדגשה — משפיע על כפתורים, קישורים ומצבים פעילים בגלריה הציבורית.
        טקסט הכפתור מתכוונן אוטומטית לניגודיות קריאה.
      </div>
      <div className="flex flex-wrap gap-2.5">
        {THEME_COLORS.map(c => {
          const active = ((ds.themeColor as string) || 'charcoal') === c.id
          return (
            <OptionTile key={c.id} selected={active} onClick={() => updateGallerySetting('themeColor', c.id)}
              className="flex flex-col items-center gap-2 px-3.5 py-2.5">
              <div className="size-8 rounded-full" style={{ background: c.color }} />
              <span className="text-[10px] font-medium tracking-[0.04em] text-ink">{c.label}</span>
            </OptionTile>
          )
        })}
      </div>
    </div>
  )
}
