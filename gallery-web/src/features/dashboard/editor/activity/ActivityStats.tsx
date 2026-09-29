import { Icon, type IconName } from '@/shared/ui/Icon'
import { bgSubtle, border, textMuted, textPrimary } from '../../styles'
import type { ActivitySummary } from '../../types'

export function ActivityStats({ summary }: { summary: ActivitySummary }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 0, marginBottom: 36,
      border: `1px solid ${border}`, background: bgSubtle,
    }}>
      {([
        { label: 'Downloads', value: summary.downloads_total, icon: 'download' as IconName },
        { label: 'Favorites', value: summary.favorites_total, icon: 'heart'    as IconName },
        { label: 'Emails',    value: summary.emails_total,    icon: 'mail'     as IconName },
      ]).map((s, i) => (
        <div key={s.label} style={{
          padding: '24px 24px',
          borderInlineStart: i > 0 ? `1px solid ${border}` : 'none',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            fontSize: 10, color: textMuted,
            fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>
            <Icon name={s.icon} size={12} strokeWidth={1.6} />
            <span>{s.label}</span>
          </div>
          <div style={{
            fontSize: 28, fontWeight: 400,
            letterSpacing: '-0.025em', color: textPrimary, lineHeight: 1,
            fontFeatureSettings: '"tnum" 1, "lnum" 1',
          }}>
            {s.value.toLocaleString('he-IL')}
          </div>
        </div>
      ))}
    </div>
  )
}
