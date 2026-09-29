import { border, textMuted, textPrimary } from '../../styles'
import type { ActivitySummary } from '../../types'
import { ActivitySection, activityTimeStyle, formatActivityTime } from './ActivitySection'

// Distinct guests who identified via the download email gate.
export function DownloadersList({ downloaders }: { downloaders: NonNullable<ActivitySummary['downloaders']> }) {
  return (
    <ActivitySection eyebrow="מי הוריד · Downloaders">
      {downloaders.slice(0, 50).map(u => (
        <div key={u.guest_email} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 4px', borderBottom: `1px solid ${border}`,
          fontSize: 13, color: textPrimary,
        }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            {u.guest_name && (
              <span style={{ fontWeight: 500 }}>{u.guest_name}</span>
            )}
            <span style={{
              direction: 'ltr', textAlign: 'left' as const, color: u.guest_name ? textMuted : textPrimary,
              fontSize: u.guest_name ? 12 : 13,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {u.guest_email}
            </span>
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: textMuted,
          }}>
            {u.downloads} {u.downloads === 1 ? 'download' : 'downloads'}
          </span>
          <span style={activityTimeStyle}>
            {formatActivityTime(u.last_at)}
          </span>
        </div>
      ))}
    </ActivitySection>
  )
}
