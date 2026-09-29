import { cn } from '@/shared/ui'
import { OptionTile } from '@/shared/ui/OptionTile'
import { useEditor, useOpenGallery } from '../EditorContext'
import { SettingsSection } from './SettingsSection'

const FEED_LAYOUTS = [
  { id: 'grid',     label: 'רשת' },
  { id: 'masonry',  label: 'מוזאיקה' },
  { id: 'carousel', label: 'קרוסלה' },
] as const

export function LayoutSection() {
  const { settings: { updateGallerySetting } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  return (
    <SettingsSection eyebrow="תצוגה">
      <div className="mb-3 text-[13px] font-medium text-ink">סגנון פיד</div>
      <div className="flex gap-2">
        {FEED_LAYOUTS.map(l => {
          const active = ((ds.feedLayout as string) || 'grid') === l.id
          return (
            <OptionTile key={l.id} selected={active} onClick={() => updateGallerySetting('feedLayout', l.id)}
              className={cn('flex-1 px-4 py-3 text-[13px] text-ink', active ? 'font-semibold' : 'font-medium')}>
              {l.label}
            </OptionTile>
          )
        })}
      </div>
    </SettingsSection>
  )
}
