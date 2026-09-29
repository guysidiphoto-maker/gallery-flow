import { border, textMuted, textPrimary, textSecondary } from '../../styles'
import type { ActivitySummary, GalleryImage } from '../../types'
import { ActivitySection, activityTimeStyle, formatActivityTime } from './ActivitySection'

export function RecentDownloadsList({ downloads, images }: {
  downloads: ActivitySummary['recent_downloads']
  images: GalleryImage[]
}) {
  return (
    <ActivitySection eyebrow="Recent Downloads">
      {downloads.slice(0, 10).map(d => {
        const img = images.find(g => g.id === d.image_id)
        return (
          <div key={d.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 4px', borderBottom: `1px solid ${border}`,
            fontSize: 13, color: textPrimary,
          }}>
            <span style={{
              flex: 1, direction: 'ltr', textAlign: 'right' as const,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {img?.filename ?? '(תמונה נמחקה)'}
            </span>
            {d.guest_email && (
              <span style={{
                direction: 'ltr', fontSize: 12, color: textSecondary,
                maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }} title={d.guest_name ? `${d.guest_name} · ${d.guest_email}` : d.guest_email}>
                {d.guest_name || d.guest_email}
              </span>
            )}
            <span style={{
              fontSize: 10, fontWeight: 500,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: textMuted,
            }}>
              {d.resolution === 'original' ? 'Original' : 'Web'}
              {d.download_kind === 'batch' ? ' · Batch' : ''}
            </span>
            <span style={activityTimeStyle}>
              {formatActivityTime(d.created_at)}
            </span>
          </div>
        )
      })}
    </ActivitySection>
  )
}
