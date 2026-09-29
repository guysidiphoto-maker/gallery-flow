import { cn } from '@/shared/ui'
import type { BrandKitWatermarkPosition } from '../brandKit'
import { WATERMARK_LABELS, WATERMARK_POSITIONS, positionDotClass } from '../watermark'

export function WatermarkPositionPicker({ value, onSelect }: {
  value: BrandKitWatermarkPosition
  onSelect: (p: BrandKitWatermarkPosition) => void
}) {
  return (
    <div className="grid grid-cols-[repeat(3,44px)] gap-1.5">
      {WATERMARK_POSITIONS.map(p => {
        const active = value === p
        return (
          <button
            key={p}
            type="button"
            aria-label={WATERMARK_LABELS[p]}
            title={WATERMARK_LABELS[p]}
            onClick={() => onSelect(p)}
            className={cn(
              'relative size-11 rounded-hair border p-0',
              active ? 'border-ink bg-ink' : 'border-line bg-raised',
            )}
          >
            <span
              className={cn(
                'absolute size-2 rounded-[1px]',
                active ? 'bg-white' : 'bg-ink',
                positionDotClass(p),
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
