import { Icon } from '@/shared/ui/Icon'
import type { ClientOverviewRow } from './api'
import { formatRelative } from './lib/format'
import { Badge } from './ui/Badge'

export function ClientListRow({ client: cl, onOpen }: { client: ClientOverviewRow; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex flex-wrap items-center justify-between gap-4 bg-surface px-5 py-[18px] text-right transition-colors duration-150 hover:bg-raised/60"
    >
      <div className="min-w-0 flex-[1_1_220px]">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[15.5px] font-semibold text-ink">{cl.name}</span>
          {cl.has_legacy_pin && <Badge tone="warn" icon="shield">קוד PIN ישן</Badge>}
          {cl.active_member_count > 0
            ? <Badge tone="live">{cl.active_member_count} פעילים</Badge>
            : cl.pending_invites > 0
              ? <Badge tone="warn">{cl.pending_invites} הזמנות ממתינות</Badge>
              : <Badge tone="neutral">אין משתמשים</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-[12.5px] text-muted">
          <span>{cl.gallery_count.toLocaleString('he-IL')} גלריות</span>
          <span>{cl.member_count.toLocaleString('he-IL')} משתמשים</span>
          <span>גישה אחרונה: {formatRelative(cl.last_access_at)}</span>
        </div>
      </div>
      <span className="flex -scale-x-100 text-muted">
        <Icon name="logout" size={16} strokeWidth={1.7} />
      </span>
    </button>
  )
}
