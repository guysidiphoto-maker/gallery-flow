import type { ActivitySummary, GalleryImage } from '../../types'
import { ActivitySection, activityTimeClass, formatActivityTime, truncateLtrEnd } from './ActivitySection'

export function RecentFavoritesList({ favorites, images }: {
  favorites: ActivitySummary['recent_favorites']
  images: GalleryImage[]
}) {
  return (
    <ActivitySection eyebrow="מועדפים אחרונים">
      {favorites.slice(0, 10).map(f => {
        const img = images.find(g => g.id === f.image_id)
        return (
          <div key={f.id} className="flex flex-col gap-1 border-b border-line px-1 py-3 text-[13px] text-ink">
            <div className="flex items-center gap-3">
              <span className={truncateLtrEnd}>
                {img?.filename ?? '(תמונה נמחקה)'}
              </span>
              {f.guest_name && (
                <span className="text-[12px] text-ink-soft">
                  {f.guest_name}
                </span>
              )}
              <span className={activityTimeClass}>
                {formatActivityTime(f.created_at)}
              </span>
            </div>
            {f.note && (
              <div className="text-[12px] leading-normal text-ink-soft italic">
                "{f.note}"
              </div>
            )}
          </div>
        )
      })}
    </ActivitySection>
  )
}
