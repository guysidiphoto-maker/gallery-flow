import { bgSubtle, border, textPrimary, textSecondary } from '../../styles'
import { useEditor, useOpenGallery } from '../EditorContext'
import { inputBase, labelStyle, focusBorder, blurBorder } from './designStyles'

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

// Heading + body font, each with an editable preview rendered in that font.
export function TypographySubTab() {
  const { settings: { updateGallerySetting }, cover: { resetGalleryBrandingToBrand } } = useEditor()
  const gallery = useOpenGallery()
  const ds = (gallery.delivery_settings ?? {}) as Record<string, unknown>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.5, maxWidth: 300 }}>
          הגלריה יורשת את הגופנים מערכת המותג. אפשר לשנות עבור הגלריה הזו בלבד.
          הגופנים חלים על כל הגלריה — כותרות וטקסט.
        </div>
        <button
          type="button"
          onClick={() => void resetGalleryBrandingToBrand()}
          title="החזרת הצבע והגופנים לברירת המחדל של המותג"
          style={{
            background: 'transparent', color: textSecondary, cursor: 'pointer',
            border: `1px solid ${border}`, borderRadius: 8,
            padding: '8px 12px', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          אפס לברירת מותג
        </button>
      </div>
      {FONT_FIELDS.map(f => {
        const current = (ds[f.key] as string) || f.defaultV
        return (
          <div key={f.key}>
            <div style={{ ...labelStyle }}>{f.label}</div>
            <select
              value={current}
              onChange={e => updateGallerySetting(f.key, e.target.value)}
              style={{ ...inputBase, cursor: 'pointer' }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            >
              {FONTS.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            {f.key === 'headingFont' ? (
              <input
                type="text"
                value={(ds.galleryTitle as string) || ''}
                onChange={e => updateGallerySetting('galleryTitle', e.target.value)}
                placeholder={gallery.name || 'הקלידי כותרת לגלריה'}
                maxLength={120}
                dir="auto"
                style={{
                  marginTop: 12, padding: '20px 18px', width: '100%',
                  background: bgSubtle, border: `1px solid ${border}`,
                  fontFamily: `'${current}', sans-serif`,
                  fontSize: 24, fontWeight: 500,
                  color: textPrimary, letterSpacing: '-0.015em',
                  lineHeight: 1.15, outline: 'none',
                  boxSizing: 'border-box' as const,
                }}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            ) : (
              <textarea
                value={(ds.galleryDescription as string) || ''}
                onChange={e => updateGallerySetting('galleryDescription', e.target.value)}
                placeholder="תיאור קצר של האירוע מופיע כאן בגוף הטקסט."
                rows={3}
                maxLength={500}
                dir="auto"
                style={{
                  marginTop: 12, padding: '20px 18px', width: '100%',
                  background: bgSubtle, border: `1px solid ${border}`,
                  fontFamily: `'${current}', sans-serif`,
                  fontSize: 14, fontWeight: 400,
                  color: textPrimary, letterSpacing: '0',
                  lineHeight: 1.5, outline: 'none',
                  resize: 'vertical' as const, minHeight: 72,
                  boxSizing: 'border-box' as const,
                }}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
