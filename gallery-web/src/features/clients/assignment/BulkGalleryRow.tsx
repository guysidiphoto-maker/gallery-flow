import { Icon } from '@/shared/ui/Icon'
import { cn } from '@/shared/ui'
import type { AssignableGalleryRow } from '../api'
import { GALLERY_STATUS_HE } from '../labels'
import { formatDate } from '../lib/format'
import { portalUrl } from '../lib/portalUrl'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { computeVisibilityIndicator, type VisibilityReason } from './visibility'
import { t, type AssignmentLocale } from './strings'

const HIDDEN_REASON_KEY: Record<VisibilityReason, 'bulk.hidden.unassigned' | 'bulk.hidden.notPublished' | 'bulk.hidden.noActiveMembers'> = {
  unassigned: 'bulk.hidden.unassigned',
  not_published: 'bulk.hidden.notPublished',
  no_active_members: 'bulk.hidden.noActiveMembers',
}

export function BulkGalleryRow({
  gallery: g, locale, businessSlug, selected, busy, activeMembers, onToggle, onAssign, onUnassign,
}: {
  gallery: AssignableGalleryRow
  locale: AssignmentLocale
  businessSlug: string | null
  selected: boolean
  busy: boolean
  activeMembers: number | undefined
  onToggle: () => void
  onAssign: () => void
  onUnassign: () => void
}) {
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k)
  const hiddenReason = computeVisibilityIndicator({ client_id: g.client_id, status: g.status }, activeMembers)
  return (
    <div className={cn('flex flex-wrap items-center gap-3.5 px-[18px] py-4', selected ? 'bg-raised/60' : 'bg-surface')}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={g.name}
        className="size-4 shrink-0 cursor-pointer accent-ink"
      />
      <div className="min-w-0 flex-[1_1_240px]">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[14.5px] font-medium text-ink">{g.name}</span>
          <Badge tone={g.status === 'live' ? 'live' : 'neutral'}>{GALLERY_STATUS_HE[g.status] ?? g.status}</Badge>
          {hiddenReason && (
            <span title={tr(HIDDEN_REASON_KEY[hiddenReason])}>
              <Badge tone="warn" icon="shield">{tr('bulk.hiddenBadge')}</Badge>
            </span>
          )}
        </div>
        <div className="mt-1.5 text-[12.5px] text-muted">
          {g.client_name
            ? <>{tr('bulk.assignedTo')} <span className="font-medium text-ink-soft">{g.client_name}</span></>
            : tr('bulk.unassigned')}
          {g.event_date && <> · {formatDate(g.event_date)}</>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {g.client_id ? (
          <>
            <a
              href={portalUrl(businessSlug, g.client_id)}
              target="_blank"
              rel="noopener noreferrer"
              title={tr('bulk.previewTitle')}
              className="inline-flex items-center gap-1.5 rounded-hair border border-line px-3.5 py-2 text-xs font-medium tracking-[0.12em] text-ink-soft uppercase no-underline"
            >
              <Icon name="arrow-out" size={12} strokeWidth={1.8} />
              {tr('bulk.preview')}
            </a>
            <Button variant="ghost" busy={busy} onClick={onAssign} className="px-3.5 py-2">{tr('bulk.reassign')}</Button>
            <Button variant="danger" busy={busy} onClick={onUnassign} className="px-3.5 py-2">{tr('bulk.unassign')}</Button>
          </>
        ) : (
          <Button variant="outline" busy={busy} onClick={onAssign} className="px-4 py-2">{tr('bulk.assign')}</Button>
        )}
      </div>
    </div>
  )
}
