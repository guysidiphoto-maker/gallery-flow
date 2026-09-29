import type { IconName } from '@/shared/ui/Icon'
import { Icon } from '@/shared/ui/Icon'
import { textMuted, textPrimary } from '../../styles'
import { useEditor, useOpenGallery } from '../EditorContext'
import { CoverImageSection } from './CoverImageSection'
import { inputBase, labelStyle, tileStyle, focusBorder, blurBorder } from './designStyles'

const WELCOME_STYLES = [
  { id: 'mosaic' as const,    label: 'מוזאיקה', desc: 'תמונות גוללות ברקע',           icon: 'sections' as IconName },
  { id: 'cinematic' as const, label: 'קולנועי', desc: 'תמונת רקע עם אפקט זום',     icon: 'photo'    as IconName },
  { id: 'minimal' as const,   label: 'מינימלי', desc: 'רקע נקי, טיפוגרפיה בלבד',   icon: 'gallery'  as IconName },
]

// Welcome style + cover image + title / client name / description.
export function CoverSubTab() {
  const { settings: { updateGallerySetting, renameGalleryTitle } } = useEditor()
  const gallery = useOpenGallery()
  const ds = (gallery.delivery_settings ?? {}) as Record<string, unknown>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <div style={{ ...labelStyle }}>סגנון מסך פתיחה</div>
        <div className="dash-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {WELCOME_STYLES.map(s => {
            const selected = ((ds.welcomeStyle as string) || 'mosaic') === s.id
            return (
              <button key={s.id} onClick={() => updateGallerySetting('welcomeStyle', s.id)} style={tileStyle(selected)}>
                <Icon name={s.icon} size={22} strokeWidth={selected ? 1.85 : 1.4} />
                <div style={{ fontSize: 13, fontWeight: selected ? 600 : 500, color: textPrimary }}>{s.label}</div>
                <div style={{ fontSize: 11, color: textMuted, lineHeight: 1.4, textAlign: 'center' }}>{s.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      <CoverImageSection />

      <label style={{ display: 'block' }}>
        <span style={{ ...labelStyle }}>כותרת הגלריה</span>
        <input
          type="text"
          value={(ds.galleryTitle as string) || gallery.name}
          onChange={e => renameGalleryTitle(e.target.value)}
          style={inputBase}
          onFocus={focusBorder}
          onBlur={blurBorder}
        />
      </label>
      <label style={{ display: 'block' }}>
        <span style={{ ...labelStyle }}>שם לקוח / אירוע</span>
        <input
          type="text"
          value={(ds.clientName as string) || ''}
          onChange={e => updateGallerySetting('clientName', e.target.value)}
          placeholder="לדוגמה: יוסי ומיכל"
          style={inputBase}
          onFocus={focusBorder}
          onBlur={blurBorder}
        />
      </label>
      <label style={{ display: 'block' }}>
        <span style={{ ...labelStyle }}>תיאור האלבום</span>
        <textarea
          value={(ds.galleryDescription as string) || ''}
          onChange={e => updateGallerySetting('galleryDescription', e.target.value)}
          placeholder="טקסט קצר שמופיע ללקוח על הגלריה — מקום, סיפור, הוקרה."
          rows={3}
          maxLength={500}
          style={{ ...inputBase, resize: 'vertical' as const, minHeight: 72, fontFamily: 'inherit', lineHeight: 1.45 }}
          onFocus={focusBorder}
          onBlur={blurBorder}
        />
      </label>
    </div>
  )
}
