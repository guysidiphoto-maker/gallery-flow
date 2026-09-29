import { cn } from '@/shared/ui'
import type { ActivitySummary } from '../../types'
import { ActivitySection, activityRowClass, activityTagClass, activityTimeClass, formatActivityTime } from './ActivitySection'

// Distinct guests who identified via the download email gate.
export function DownloadersList({ downloaders }: { downloaders: NonNullable<ActivitySummary['downloaders']> }) {
  return (
    <ActivitySection eyebrow="מי הוריד">
      {downloaders.slice(0, 50).map(u => (
        <div key={u.guest_email} className={activityRowClass}>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {u.guest_name && (
              <span className="font-medium">{u.guest_name}</span>
            )}
            <span className={cn(
              'truncate text-left [direction:ltr]',
              u.guest_name ? 'text-[12px] text-muted' : 'text-[13px] text-ink',
            )}>
              {u.guest_email}
            </span>
          </span>
          <span className={cn(activityTagClass, 'text-muted')}>
            {u.downloads} {u.downloads === 1 ? 'download' : 'downloads'}
          </span>
          <span className={activityTimeClass}>
            {formatActivityTime(u.last_at)}
          </span>
        </div>
      ))}
    </ActivitySection>
  )
}
