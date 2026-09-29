import { border, statusLive, textMuted, textPrimary } from '../../styles'
import type { ActivitySummary } from '../../types'
import { ActivitySection, activityTimeStyle, formatActivityTime } from './ActivitySection'

export function RecentEmailsList({ emails }: { emails: ActivitySummary['recent_emails'] }) {
  return (
    <ActivitySection eyebrow="Recent Emails" marginBottom={12}>
      {emails.slice(0, 10).map(e => (
        <div key={e.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 4px', borderBottom: `1px solid ${border}`,
          fontSize: 13, color: textPrimary,
        }}>
          <span style={{
            flex: 1, direction: 'ltr', textAlign: 'right' as const,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {e.recipient_email}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: e.status === 'sent' ? statusLive : textMuted,
          }}>
            {e.status === 'sent' ? 'Sent' : 'Failed'}
          </span>
          <span style={activityTimeStyle}>
            {formatActivityTime(e.created_at)}
          </span>
        </div>
      ))}
    </ActivitySection>
  )
}
