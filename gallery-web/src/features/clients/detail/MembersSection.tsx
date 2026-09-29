import type { ClientDetailMember, SettableStatus } from '../api'
import { MEMBERSHIP_STATUS_HE, ROLE_HE } from '../labels'
import { formatRelative } from '../lib/format'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { RowList } from '../ui/RowList'
import { Section } from '../ui/Section'

const ROW_BTN = 'px-3.5 py-2'

export function MembersSection({ members, busyId, onInvite, onInviteFromEmpty, onReset, onSetStatus }: {
  members: ClientDetailMember[]
  busyId: string | null
  onInvite: () => void
  onInviteFromEmpty: () => void
  onReset: (membershipId: string, email: string) => void
  onSetStatus: (membershipId: string, status: SettableStatus, verb: string, danger: boolean) => void
}) {
  return (
    <Section
      title={`משתמשי לקוח (${members.length})`}
      action={<Button variant="outline" icon="plus" onClick={onInvite}>הזמן משתמש</Button>}
    >
      {members.length === 0 ? (
        <EmptyState icon="clients" title="אין עדיין משתמשים"
          body="הזמן משתמש כדי לתת ללקוח גישה מאובטחת לפורטל (במקום קוד PIN)."
          action={<Button variant="outline" icon="plus" onClick={onInviteFromEmpty}>הזמן משתמש</Button>} />
      ) : (
        <RowList>
          {members.map(m => {
            const busy = busyId === m.id
            return (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 bg-surface px-[18px] py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span dir="ltr" className="text-sm font-medium text-ink">{m.email}</span>
                    <Badge tone="neutral">{ROLE_HE[m.role] ?? m.role}</Badge>
                    <Badge tone={m.status === 'active' ? 'live' : m.status === 'invited' ? 'warn' : 'danger'}>
                      {MEMBERSHIP_STATUS_HE[m.status] ?? m.status}
                    </Badge>
                  </div>
                  <div className="mt-1.5 text-xs text-muted">
                    גישה אחרונה: {formatRelative(m.last_access_at)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.status === 'active' && (
                    <Button variant="ghost" busy={busy} onClick={() => onReset(m.id, m.email)} className={ROW_BTN}>איפוס סיסמה</Button>
                  )}
                  {m.status === 'active' && (
                    <Button variant="ghost" busy={busy} onClick={() => onSetStatus(m.id, 'disabled', 'השהיית משתמש', true)} className={ROW_BTN}>השהה</Button>
                  )}
                  {(m.status === 'disabled' || m.status === 'invited') && (
                    <Button variant="ghost" busy={busy} onClick={() => onSetStatus(m.id, 'active', 'הפעלה מחדש', false)} className={ROW_BTN}>הפעל</Button>
                  )}
                  {m.status !== 'revoked' && (
                    <Button variant="danger" busy={busy} onClick={() => onSetStatus(m.id, 'revoked', 'ביטול משתמש', true)} className={ROW_BTN}>בטל</Button>
                  )}
                </div>
              </div>
            )
          })}
        </RowList>
      )}
    </Section>
  )
}
