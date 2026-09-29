import { Eyebrow, cn } from '@/shared/ui'
import { OptionTile } from '@/shared/ui/OptionTile'
import { useEditor, useOpenGallery } from '../EditorContext'
import { labelClass } from './designStyles'

const GRID_OPTIONS = [
  {
    key: 'thumbnailSize', defaultV: 'regular',
    eyebrow: 'גודל תמונות',
    hint: 'רגיל = 4 עמ׳ · גדול = 3 עמ׳ · ענק = תמונה אחת בשורה (גם במובייל)',
    opts: [
      { id: 'regular', label: 'רגיל' },
      { id: 'large',   label: 'גדול' },
      { id: 'full',    label: 'ענק' },
    ],
  },
  {
    key: 'gridSpacing', defaultV: 'regular',
    eyebrow: 'מרווח בין תמונות',
    hint: 'רגיל = צמוד · מורווח = רווח נדיב',
    opts: [
      { id: 'regular', label: 'רגיל' },
      { id: 'large',   label: 'מורווח' },
    ],
  },
] as const

export function GridSubTab() {
  const { settings: { updateGallerySetting } } = useEditor()
  const ds = (useOpenGallery().delivery_settings ?? {}) as Record<string, unknown>
  return (
    <div className="flex flex-col gap-7">
      {GRID_OPTIONS.map(g => (
        <div key={g.key}>
          <Eyebrow className={labelClass}>{g.eyebrow}</Eyebrow>
          <div className="mb-2 text-[11px] leading-[1.4] text-muted">{g.hint}</div>
          <div className="flex gap-2">
            {g.opts.map(o => {
              const active = ((ds[g.key] as string) || g.defaultV) === o.id
              return (
                <OptionTile key={o.id} selected={active} onClick={() => updateGallerySetting(g.key, o.id)}
                  className={cn('flex-1 px-4 py-3.5 text-[13px] text-ink', active ? 'font-semibold' : 'font-medium')}>
                  {o.label}
                </OptionTile>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
