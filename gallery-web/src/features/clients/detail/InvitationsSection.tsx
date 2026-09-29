import type { ClientDetailInvitation } from '../api'
import { INVITATION_STATUS_HE } from '../labels'
import { formatDate } from '../lib/format'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { RowList } from '../ui/RowList'
import { Section } from '../ui/Section'

export function InvitationsSection({ invitations, busyId, onResend, onCancel }: {
  invitations: ClientDetailInvitation[]
  busyId: string | null
  onResend: (invitationId: string) => void
  onCancel: (invitationId: string) => void
}) {
  return (
    <Section title={`הזמנות ממתינות (${invitations.length})`}>
      <RowList>
        {invitations.map(inv => {
          const busy = busyId === inv.id
          const expired = inv.expires_at ? new Date(inv.expires_at).getTime() < Date.now() : false
          return (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 bg-surface px-[18px] py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span dir="ltr" className="text-sm font-medium text-ink">{inv.email}</span>
                  <Badge tone={expired ? 'danger' : 'warn'}>{expired ? 'פג תוקף' : INVITATION_STATUS_HE[inv.status] ?? inv.status}</Badge>
                  {inv.resent_count > 0 && <Badge tone="neutral">נשלח {inv.resent_count}×</Badge>}
                </div>
                <div className="mt-1.5 text-xs text-muted">
                  תוקף עד: {formatDate(inv.expires_at)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" busy={busy} onClick={() => onResend(inv.id)} className="px-3.5 py-2">שלח קישור חדש</Button>
                <Button variant="danger" busy={busy} onClick={() => onCancel(inv.id)} className="px-3.5 py-2">בטל</Button>
              </div>
            </div>
          )
        })}
      </RowList>
    </Section>
  )
}
