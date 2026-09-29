import { cn } from '@/shared/ui'
import type { ActivitySummary } from '../../types'
import { ActivitySection, activityRowClass, activityTagClass, activityTimeClass, formatActivityTime, truncateLtrEnd } from './ActivitySection'

export function RecentEmailsList({ emails }: { emails: ActivitySummary['recent_emails'] }) {
  return (
    <ActivitySection eyebrow="Recent Emails" className="mb-3">
      {emails.slice(0, 10).map(e => (
        <div key={e.id} className={activityRowClass}>
          <span className={truncateLtrEnd}>
            {e.recipient_email}
          </span>
          <span className={cn(activityTagClass, e.status === 'sent' ? 'text-sage' : 'text-muted')}>
            {e.status === 'sent' ? 'Sent' : 'Failed'}
          </span>
          <span className={activityTimeClass}>
            {formatActivityTime(e.created_at)}
          </span>
        </div>
      ))}
    </ActivitySection>
  )
}
