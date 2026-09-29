import { cn } from '@/shared/ui'

// Placeholder "photos" for the window mockups.
const MOCK_BACKGROUNDS = [
  'bg-(image:--mk-lp-mock-1)', 'bg-(image:--mk-lp-mock-2)', 'bg-(image:--mk-lp-mock-3)',
  'bg-(image:--mk-lp-mock-4)', 'bg-(image:--mk-lp-mock-5)', 'bg-(image:--mk-lp-mock-6)',
]

/** 3-column grid of gradient tiles; `stars` marks top picks by index. */
export function MockGrid({ stars }: { stars?: number[] }) {
  return (
    <div className="grid grid-cols-[repeat(3,1fr)] gap-1 p-2">
      {MOCK_BACKGROUNDS.map((bg, i) => (
        <div key={i} className={cn('relative aspect-[4/3] overflow-hidden rounded-sm', bg)}>
          {stars?.includes(i) && (
            <span className="absolute top-1 right-1 text-[16px] text-(--mk-star) [text-shadow:var(--mk-lp-star-shadow)]">&#9733;</span>
          )}
        </div>
      ))}
    </div>
  )
}
