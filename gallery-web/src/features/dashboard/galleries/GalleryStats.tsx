import { Icon, type IconName } from '@/shared/ui/Icon'
import { bgSubtle, border, textMuted, textPrimary } from '../styles'
import type { Gallery } from '../types'

// Editorial stats row: hairline borders, tracked labels, large numbers.
export function GalleryStats({ galleries }: { galleries: Gallery[] }) {
  const totalPhotos = galleries.reduce((sum, g) => sum + (g.image_count ?? 0), 0)
  // 'live' is the single publicly-visible status.
  const publishedCount = galleries.filter((g) => g.status === 'live').length
  const draftCount = galleries.length - publishedCount

  const statCards: { label: string; value: number | string; icon: IconName; color: string }[] = [
    { label: 'Galleries',  value: galleries.length, icon: 'gallery', color: textPrimary },
    { label: 'Photos',     value: totalPhotos,      icon: 'photo',   color: textPrimary },
    { label: 'Published',  value: publishedCount,   icon: 'check',   color: textPrimary },
    { label: 'Drafts',     value: draftCount,       icon: 'duplicate', color: textPrimary },
  ]

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 0, marginBottom: 56,
      animation: 'fadeInUp .45s ease both',
      border: `1px solid ${border}`,
      background: bgSubtle,
    }}>
      {statCards.map((s, i) => (
        <div key={i} style={{
          padding: '28px 28px',
          borderInlineStart: i > 0 ? `1px solid ${border}` : 'none',
          position: 'relative',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
            fontSize: 10, color: textMuted,
            fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>
            <Icon name={s.icon} size={12} strokeWidth={1.6} />
            <span>{s.label}</span>
          </div>
          <div style={{
            fontSize: 26, fontWeight: 400,
            letterSpacing: '-0.025em', color: textPrimary, lineHeight: 1,
            fontFeatureSettings: '"tnum" 1, "lnum" 1',
          }}>
            {(typeof s.value === 'number' ? s.value : Number(s.value) || 0).toLocaleString('he-IL')}
          </div>
        </div>
      ))}
    </div>
  )
}
