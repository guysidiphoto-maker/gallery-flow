import { cn } from '@/shared/ui'
import type { ActivitySummary, GalleryImage } from '../../types'
import { ActivitySection, activityRowClass, activityTagClass, activityTimeClass, formatActivityTime, truncateLtrEnd } from './ActivitySection'

export function RecentDownloadsList({ downloads, images }: {
  downloads: ActivitySummary['recent_downloads']
  images: GalleryImage[]
}) {
  return (
    <ActivitySection eyebrow="Recent Downloads">
      {downloads.slice(0, 10).map(d => {
        const img = images.find(g => g.id === d.image_id)
        return (
          <div key={d.id} className={activityRowClass}>
            <span className={truncateLtrEnd}>
              {img?.filename ?? '(תמונה נמחקה)'}
            </span>
            {d.guest_email && (
              <span className="max-w-[180px] truncate text-[12px] text-ink-soft [direction:ltr]"
                title={d.guest_name ? `${d.guest_name} · ${d.guest_email}` : d.guest_email}>
                {d.guest_name || d.guest_email}
              </span>
            )}
            <span className={cn(activityTagClass, 'text-muted')}>
              {d.resolution === 'original' ? 'מקור' : 'רשת'}
              {d.download_kind === 'batch' ? ' · Batch' : ''}
            </span>
            <span className={activityTimeClass}>
              {formatActivityTime(d.created_at)}
            </span>
          </div>
        )
      })}
    </ActivitySection>
  )
}
