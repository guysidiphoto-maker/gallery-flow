import type { ClientDetailGallery } from '../api'
import { GALLERY_STATUS_HE } from '../labels'
import { formatDate } from '../lib/format'
import { computeVisibilityIndicator } from '../assignment/visibility'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { FilterTabs } from '../ui/FilterTabs'
import { RowList } from '../ui/RowList'
import { Section } from '../ui/Section'
import type { GalleryFilter } from './useClientDetail'

const TABS: { id: GalleryFilter; label: string }[] = [
  { id: 'all', label: 'הכול' },
  { id: 'live', label: 'פורסמו' },
  { id: 'draft', label: 'טיוטות' },
]

export function GalleriesSection({ clientId, galleries, activeMembers, filter, onFilter }: {
  clientId: string
  galleries: ClientDetailGallery[]
  activeMembers: number
  filter: GalleryFilter
  onFilter: (f: GalleryFilter) => void
}) {
  const shown = galleries.filter(g =>
    filter === 'all' ? true : filter === 'live' ? g.status === 'live' : g.status !== 'live')

  return (
    <Section
      title={`גלריות משויכות (${galleries.length})`}
      action={galleries.length > 0 ? <FilterTabs tabs={TABS} value={filter} onChange={onFilter} size="sm" /> : undefined}
    >
      {galleries.length === 0 ? (
        <EmptyState icon="gallery" title="אין גלריות משויכות"
          body="שייך גלריות ללקוח זה דרך מסך «שיוך גלריות» ברשימת הלקוחות." />
      ) : shown.length === 0 ? (
        <div className="py-2 text-[13px] text-muted">אין גלריות בסינון הנוכחי.</div>
      ) : (
        <RowList>
          {shown.map(g => {
            // Every gallery here belongs to this client, so only drafts or a
            // client with no active users can hide it.
            const hiddenReason = computeVisibilityIndicator({ client_id: clientId, status: g.status }, activeMembers)
            return (
              <div key={g.id} className="flex items-center justify-between gap-4 bg-surface px-[18px] py-3.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{g.name}</div>
                  {g.event_date && <div className="mt-0.5 text-xs text-muted">{formatDate(g.event_date)}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {hiddenReason && (
                    <span title={hiddenReason === 'not_published'
                      ? 'הלקוח לא רואה את הגלריה: היא עדיין לא פורסמה'
                      : 'הלקוח לא רואה את הגלריה: אין לו משתמשים פעילים'}>
                      <Badge tone="warn" icon="shield">לא גלוי ללקוח</Badge>
                    </span>
                  )}
                  <Badge tone={g.status === 'live' ? 'live' : 'neutral'}>{GALLERY_STATUS_HE[g.status] ?? g.status}</Badge>
                </div>
              </div>
            )
          })}
        </RowList>
      )}
    </Section>
  )
}
