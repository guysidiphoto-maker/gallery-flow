import { cn } from '@/shared/ui'
import { FONT_PAIRS, type BrandKit } from '../brandKit'
import { BrandKitCard } from './BrandKitCard'

export function TypographySection({ brand, onSelect }: {
  brand: BrandKit
  onSelect: (headingFamily: string, bodyFamily: string) => void
}) {
  const current = brand.typography
  return (
    <BrandKitCard
      eyebrow="03"
      title="טיפוגרפיה"
      description="חמישה זיווגי פונטים אוצרים. בחירה אחת מחילה את שני הפונטים יחד."
    >
      <div className="flex flex-col gap-3">
        {FONT_PAIRS.map(pair => {
          const active =
            current?.heading_family === pair.heading_family &&
            current?.body_family === pair.body_family
          return (
            <button
              key={pair.id}
              type="button"
              onClick={() => onSelect(pair.heading_family, pair.body_family)}
              className={cn(
                'flex items-center gap-6 rounded-hair border px-[22px] py-5 text-right text-ink transition-[border-color,background] duration-150',
                active ? 'border-ink bg-raised' : 'border-line bg-transparent',
              )}
            >
              {/* Sample text renders in the pair's own fonts. */}
              <div className="min-w-0 flex-1">
                <div
                  className="mb-1.5 text-[26px] font-medium tracking-[-0.01em] text-ink"
                  style={{ fontFamily: pair.heading_family }}
                >
                  {pair.sample_heading}
                </div>
                <div className="text-[13px] leading-[1.6] text-ink-soft" style={{ fontFamily: pair.body_family }}>
                  {pair.sample_body}
                </div>
              </div>
              <div
                dir="ltr"
                className={cn(
                  'min-w-40 shrink-0 text-left text-[10px] font-medium tracking-label uppercase',
                  active ? 'text-ink' : 'text-muted',
                )}
              >
                {pair.label}
                {active && <div className="mt-1 text-[9px] text-ink">● ACTIVE</div>}
              </div>
            </button>
          )
        })}
      </div>
    </BrandKitCard>
  )
}
