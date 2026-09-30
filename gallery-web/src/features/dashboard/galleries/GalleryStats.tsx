import { Icon, type IconName } from '@/shared/ui/Icon'
import { cn } from '@/shared/ui'
import type { Gallery } from '../types'

// Editorial stats row: hairline borders, tracked labels, large numbers.
export function GalleryStats({ galleries }: { galleries: Gallery[] }) {
  const totalPhotos = galleries.reduce((sum, g) => sum + (g.image_count ?? 0), 0)
  // 'live' is the single publicly-visible status.
  const publishedCount = galleries.filter((g) => g.status === 'live').length
  const draftCount = galleries.length - publishedCount

  const statCards: { label: string; value: number | string; icon: IconName }[] = [
    { label: 'גלריות',   value: galleries.length, icon: 'gallery' },
    { label: 'תמונות',   value: totalPhotos,      icon: 'photo' },
    { label: 'פורסמו',   value: publishedCount,   icon: 'check' },
    { label: 'טיוטות',   value: draftCount,       icon: 'pencil' },
  ]

  return (
    <div className="mb-14 grid animate-[dash-fade-up_.45s_ease_both] grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-0 border border-line bg-surface">
      {statCards.map((s, i) => (
        <div key={i} className={cn('relative p-7', i > 0 && 'border-s border-line')}>
          <div className="mb-3.5 flex items-center gap-2 text-[11px] font-medium text-muted">
            <Icon name={s.icon} size={12} strokeWidth={1.6} />
            <span>{s.label}</span>
          </div>
          <div className="text-[26px] leading-none font-normal tracking-[-0.025em] text-ink tabular-nums lining-nums">
            {(typeof s.value === 'number' ? s.value : Number(s.value) || 0).toLocaleString('he-IL')}
          </div>
        </div>
      ))}
    </div>
  )
}
