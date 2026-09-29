import { OptionTile } from '@/shared/ui/OptionTile'
import { useEditor, useOpenGallery } from '../EditorContext'
import { THEME_COLORS } from '../themeColors'
import { SettingsSection } from './SettingsSection'

export function ThemeColorSection() {
  const { settings: { updateGallerySetting } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  return (
    <SettingsSection eyebrow="צבע ראשי">
      <div className="mb-3.5 text-[12px] leading-normal text-muted">
        הצבע שמופיע בכפתורים ומסגרות בגלריה הציבורית
      </div>
      <div className="flex flex-wrap gap-2.5">
        {THEME_COLORS.map(c => {
          const active = ((ds.themeColor as string) || 'charcoal') === c.id
          return (
            <OptionTile key={c.id} selected={active} onClick={() => updateGallerySetting('themeColor', c.id)}
              className="flex flex-col items-center gap-2 px-3.5 py-2.5">
              {/* Swatch color is the palette entry itself (data, not a UI token). */}
              <div className="size-7 rounded-full" style={{ background: c.color }} />
              <span className="text-[10px] font-medium tracking-[0.04em] text-ink">{c.label}</span>
            </OptionTile>
          )
        })}
      </div>
    </SettingsSection>
  )
}
