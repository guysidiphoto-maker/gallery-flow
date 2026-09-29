import type { IconName } from '@/shared/ui/Icon'
import { Icon } from '@/shared/ui/Icon'
import { OptionTile } from '@/shared/ui/OptionTile'
import { Eyebrow, Input, Textarea, cn } from '@/shared/ui'
import { useEditor, useOpenGallery } from '../EditorContext'
import { CoverImageSection } from './CoverImageSection'
import { fieldClass, labelClass, tileClass } from './designStyles'

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
    <div className="flex flex-col gap-7">
      <div>
        <Eyebrow className={labelClass}>סגנון מסך פתיחה</Eyebrow>
        <div className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-1">
          {WELCOME_STYLES.map(s => {
            const selected = ((ds.welcomeStyle as string) || 'mosaic') === s.id
            return (
              <OptionTile key={s.id} selected={selected} onClick={() => updateGallerySetting('welcomeStyle', s.id)} className={tileClass}>
                <Icon name={s.icon} size={22} strokeWidth={selected ? 1.85 : 1.4} />
                <div className={cn('text-[13px] text-ink', selected ? 'font-semibold' : 'font-medium')}>{s.label}</div>
                <div className="text-center text-[11px] leading-[1.4] text-muted">{s.desc}</div>
              </OptionTile>
            )
          })}
        </div>
      </div>

      <CoverImageSection />

      <label className="block">
        <Eyebrow className={labelClass}>כותרת הגלריה</Eyebrow>
        <Input
          type="text"
          value={(ds.galleryTitle as string) || gallery.name}
          onChange={e => renameGalleryTitle(e.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block">
        <Eyebrow className={labelClass}>שם לקוח / אירוע</Eyebrow>
        <Input
          type="text"
          value={(ds.clientName as string) || ''}
          onChange={e => updateGallerySetting('clientName', e.target.value)}
          placeholder="לדוגמה: יוסי ומיכל"
          className={fieldClass}
        />
      </label>
      <label className="block">
        <Eyebrow className={labelClass}>תיאור האלבום</Eyebrow>
        <Textarea
          value={(ds.galleryDescription as string) || ''}
          onChange={e => updateGallerySetting('galleryDescription', e.target.value)}
          placeholder="טקסט קצר שמופיע ללקוח על הגלריה — מקום, סיפור, הוקרה."
          rows={3}
          maxLength={500}
          className={cn(fieldClass, 'min-h-[72px] leading-[1.45]')}
        />
      </label>
    </div>
  )
}
