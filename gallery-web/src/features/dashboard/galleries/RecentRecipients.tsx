import { cn } from '@/shared/ui'
import type { ActivitySummary } from '../types'

// Real send history from the gallery email log; never fabricated.
export function RecentRecipients({ activitySummary, activityLoading }: {
  activitySummary: ActivitySummary | null
  activityLoading: boolean
}) {
  return (
    <div className="mt-[22px] border-t border-line pt-[18px]">
      <div className="mb-2.5 text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">נמענים אחרונים</div>
      {activityLoading && !activitySummary ? (
        <div className="py-2 text-xs text-muted">טוען…</div>
      ) : (activitySummary?.recent_emails?.length ?? 0) === 0 ? (
        <div className="py-2 text-xs leading-normal text-muted">
          עדיין לא נשלחו מיילים לגלריה זו. שליחה ראשונה תופיע כאן.
        </div>
      ) : (
        <div className="flex max-h-[180px] flex-col gap-2 overflow-y-auto">
          {activitySummary!.recent_emails.slice(0, 8).map(row => {
            const failed = row.status === 'failed'
            return (
              <div key={row.id} className="flex items-center justify-between gap-2.5 text-xs">
                <span className="truncate text-left text-ink [direction:ltr]">
                  {row.recipient_email}
                </span>
                <span className={cn('inline-flex shrink-0 items-center gap-[5px]', failed ? 'text-danger' : 'text-muted')}>
                  <span className={cn('size-1.5 rounded-full', failed ? 'bg-danger' : 'bg-success')} />
                  {failed ? 'נכשל' : 'נשלח'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
