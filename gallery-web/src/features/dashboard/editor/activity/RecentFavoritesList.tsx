import { border, textPrimary, textSecondary } from '../../styles'
import type { ActivitySummary, GalleryImage } from '../../types'
import { ActivitySection, activityTimeStyle, formatActivityTime } from './ActivitySection'

export function RecentFavoritesList({ favorites, images }: {
  favorites: ActivitySummary['recent_favorites']
  images: GalleryImage[]
}) {
  return (
    <ActivitySection eyebrow="Recent Favorites">
      {favorites.slice(0, 10).map(f => {
        const img = images.find(g => g.id === f.image_id)
        return (
          <div key={f.id} style={{
            padding: '12px 4px', borderBottom: `1px solid ${border}`,
            fontSize: 13, color: textPrimary,
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                flex: 1, direction: 'ltr', textAlign: 'right' as const,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {img?.filename ?? '(תמונה נמחקה)'}
              </span>
              {f.guest_name && (
                <span style={{ fontSize: 12, color: textSecondary }}>
                  {f.guest_name}
                </span>
              )}
              <span style={activityTimeStyle}>
                {formatActivityTime(f.created_at)}
              </span>
            </div>
            {f.note && (
              <div style={{
                fontSize: 12, color: textSecondary,
                fontStyle: 'italic', lineHeight: 1.5,
              }}>
                "{f.note}"
              </div>
            )}
          </div>
        )
      })}
    </ActivitySection>
  )
}
