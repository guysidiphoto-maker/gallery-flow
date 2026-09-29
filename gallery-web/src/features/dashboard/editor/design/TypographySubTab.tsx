import { Eyebrow, Select, cn } from '@/shared/ui'
import { useEditor, useOpenGallery } from '../EditorContext'
import { fieldClass, labelClass } from './designStyles'

const FONT_FIELDS = [
  { key: 'headingFont', label: 'פונט כותרות', defaultV: 'Inter Tight' },
  { key: 'bodyFont',    label: 'פונט גוף',    defaultV: 'Noto Sans Hebrew' },
] as const

const FONTS = [
  'Inter Tight',
  'Noto Sans Hebrew',
  'Heebo',
  'Noto Serif',
  'Cormorant Garamond',
  'Playfair Display',
]

const previewClass = 'mt-3 w-full border border-line bg-surface px-[18px] py-5 text-ink outline-none focus:border-ink'

// Heading + body font, each with an editable preview rendered in that font.
export function TypographySubTab() {
  const { settings: { updateGallerySetting }, cover: { resetGalleryBrandingToBrand } } = useEditor()
  const gallery = useOpenGallery()
  const ds = (gallery.delivery_settings ?? {}) as Record<string, unknown>
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-[300px] text-[12px] leading-normal text-ink-soft">
          הגלריה יורשת את הגופנים מערכת המותג. אפשר לשנות עבור הגלריה הזו בלבד.
          הגופנים חלים על כל הגלריה — כותרות וטקסט.
        </div>
        <button
          type="button"
          onClick={() => void resetGalleryBrandingToBrand()}
          title="החזרת הצבע והגופנים לברירת המחדל של המותג"
          className="rounded-[8px] border border-line bg-transparent px-3 py-2 text-[12px] font-medium whitespace-nowrap text-ink-soft"
        >
          אפס לברירת מותג
        </button>
      </div>
      {FONT_FIELDS.map(f => {
        const current = (ds[f.key] as string) || f.defaultV
        // The preview renders in the photographer's picked font (runtime data).
        const fontStyle = { fontFamily: `'${current}', sans-serif` }
        return (
          <div key={f.key}>
            <Eyebrow className={labelClass}>{f.label}</Eyebrow>
            <Select
              value={current}
              onChange={e => updateGallerySetting(f.key, e.target.value)}
              className={fieldClass}
            >
              {FONTS.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </Select>
            {f.key === 'headingFont' ? (
              <input
                type="text"
                value={(ds.galleryTitle as string) || ''}
                onChange={e => updateGallerySetting('galleryTitle', e.target.value)}
                placeholder={gallery.name || 'הקלידי כותרת לגלריה'}
                maxLength={120}
                dir="auto"
                className={cn(previewClass, 'text-[24px] leading-[1.15] font-medium tracking-[-0.015em]')}
                style={fontStyle}
              />
            ) : (
              <textarea
                value={(ds.galleryDescription as string) || ''}
                onChange={e => updateGallerySetting('galleryDescription', e.target.value)}
                placeholder="תיאור קצר של האירוע מופיע כאן בגוף הטקסט."
                rows={3}
                maxLength={500}
                dir="auto"
                className={cn(previewClass, 'min-h-[72px] resize-y text-[14px] leading-normal font-normal tracking-normal')}
                style={fontStyle}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
