import type { CSSProperties } from 'react'
import type { BrandKit } from '../brandKit'
import { BrandKitCard } from './BrandKitCard'
import { FieldLabel } from './FieldLabel'

type ColorKey = keyof NonNullable<BrandKit['colors']>

const FIELDS: Array<{ key: ColorKey; label: string; desc: string }> = [
  { key: 'primary',   label: 'ראשי',  desc: 'לוגו, כפתורים, אקסנט מרכזי' },
  { key: 'secondary', label: 'משני',  desc: 'מסגרות, רקעים משניים' },
  { key: 'accent',    label: 'הדגשה', desc: 'קישורים, סטטוסים' },
  { key: 'ink',       label: 'טקסט',  desc: 'כותרות ופסקאות' },
  { key: 'paper',     label: 'רקע',   desc: 'קנבס הגלריה' },
]

// <input type="color"> requires a full #rrggbb value.
const COLOR_INPUT_FALLBACK = '#000000'

export function ColorsSection({ brand, onChange, onBlur, onToggleApply }: {
  brand: BrandKit
  onChange: (next: BrandKit) => void
  onBlur: () => void
  onToggleApply: (next: boolean) => void
}) {
  const colors = brand.colors ?? {}
  const setColor = (key: ColorKey, value: string) =>
    onChange({ ...brand, colors: { ...colors, [key]: value } })

  return (
    <BrandKitCard
      eyebrow="02"
      title="צבעים"
      description="חמשת הצבעים שמגדירים את הוויזואל של הסטודיו. מומלץ ניגוד גבוה בין טקסט לרקע."
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
        {FIELDS.map(f => (
          <div key={f.key}>
            <FieldLabel>{f.label}</FieldLabel>
            <div className="flex items-center gap-2.5 rounded-hair border border-line bg-raised p-2">
              <input
                type="color"
                aria-label={`צבע ${f.label}`}
                value={colors[f.key] ?? COLOR_INPUT_FALLBACK}
                onChange={e => setColor(f.key, e.target.value)}
                onBlur={onBlur}
                className="size-9 cursor-pointer border-none bg-transparent p-0"
              />
              <input
                type="text"
                dir="ltr"
                value={colors[f.key] ?? ''}
                onChange={e => setColor(f.key, e.target.value)}
                onBlur={onBlur}
                className="min-w-0 flex-1 border-none bg-transparent px-2 py-1.5 text-left font-mono text-xs text-ink outline-none"
              />
            </div>
            <div className="mt-1.5 text-[11px] leading-normal text-muted">{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Live swatch strip */}
      <div className="mt-[22px] flex overflow-hidden rounded-hair border border-line">
        {FIELDS.map(f => (
          <div
            key={f.key}
            className="flex h-14 flex-1 items-end justify-start bg-(--swatch) p-2"
            style={{ '--swatch': colors[f.key] ?? 'var(--color-white)' } as CSSProperties}
          >
            <span className="bg-white/80 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.14em] text-black uppercase">
              {f.label}
            </span>
          </div>
        ))}
      </div>

      <label className="mt-6 flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={Boolean(brand.apply_to_galleries)}
          onChange={e => onToggleApply(e.target.checked)}
          className="size-4 accent-ink"
        />
        <span className="text-[13px] text-ink">השתמש כברירת מחדל בגלריות חדשות</span>
        <span className="text-[11px] text-muted">(לא משכתב גלריות קיימות)</span>
      </label>
    </BrandKitCard>
  )
}
