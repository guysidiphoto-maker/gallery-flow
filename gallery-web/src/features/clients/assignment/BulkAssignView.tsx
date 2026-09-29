// Owner-side gallery-assignment workspace: multi-select + bulk assign, filters,
// per-gallery "no client can see this" indicator, reassign/unassign with
// explicit confirms and a per-row public-page preview.
import type { ToastInput } from '@/shared/ui/Toast'
import { BackLink } from '../ui/BackLink'
import { EmptyState } from '../ui/EmptyState'
import { ErrorBanner } from '../ui/ErrorBanner'
import { FilterTabs } from '../ui/FilterTabs'
import { RowList } from '../ui/RowList'
import { SearchField } from '../ui/SearchField'
import { Skeleton } from '../ui/Skeleton'
import { AssignModal } from './AssignModal'
import { BulkActionBar } from './BulkActionBar'
import { BulkGalleryRow } from './BulkGalleryRow'
import { useBulkAssign, type BulkFilter } from './useBulkAssign'
import { t, dirFor, type AssignmentLocale } from './strings'

export interface BulkAssignViewProps {
  businessSlug: string | null
  onBack: () => void
  showToast: (toast: ToastInput) => void
  locale?: AssignmentLocale
}

export default function BulkAssignView({ businessSlug, onBack, showToast, locale = 'he' }: BulkAssignViewProps) {
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k)
  const b = useBulkAssign(locale, showToast)

  const filterTabs: { id: BulkFilter; label: string }[] = [
    { id: 'all', label: tr('bulk.filter.all') },
    { id: 'assigned', label: tr('bulk.filter.assigned') },
    { id: 'unassigned', label: tr('bulk.filter.unassigned') },
    { id: 'published', label: tr('bulk.filter.published') },
    { id: 'draft', label: tr('bulk.filter.draft') },
  ]

  return (
    <div dir={dirFor(locale)}>
      <b.ConfirmHost />
      <BackLink onClick={onBack}>{tr('bulk.back')}</BackLink>

      <div className="mb-7">
        <div className="mb-2.5 text-[11px] font-medium tracking-wide-label text-muted uppercase">{tr('bulk.kicker')}</div>
        <h1 className="text-[clamp(24px,3.2vw,36px)] font-medium tracking-[-0.025em] text-ink">{tr('bulk.title')}</h1>
        <p className="mt-2.5 max-w-[560px] text-[13.5px] leading-normal text-muted">{tr('bulk.subtitle')}</p>
      </div>

      {b.loading ? (
        <Skeleton height={64} count={5} />
      ) : b.error ? (
        <ErrorBanner text={b.error} onRetry={b.load} />
      ) : b.galleries.length === 0 ? (
        <EmptyState icon="gallery" title={tr('bulk.empty.title')} body={tr('bulk.empty.body')} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <SearchField
              value={b.query}
              onChange={b.setQuery}
              placeholder={tr('bulk.search')}
              ariaLabel={tr('bulk.search')}
              className="flex-[1_1_240px]"
            />
            <FilterTabs tabs={filterTabs} value={b.filter} onChange={b.setFilter} ariaLabel={tr('bulk.title')} />
          </div>

          <BulkActionBar
            locale={locale}
            selectedCount={b.selected.size}
            allVisibleSelected={b.allVisibleSelected}
            onToggleAll={b.toggleAllVisible}
            onClear={() => b.setSelected(new Set())}
            bulkClient={b.bulkClient}
            onBulkClient={b.setBulkClient}
            bulkBusy={b.bulkBusy}
            onRun={() => void b.runBulk()}
          />

          {b.filtered.length === 0 ? (
            <EmptyState icon="search" title={tr('bulk.noResults.title')} body={tr('bulk.noResults.body')} />
          ) : (
            <RowList>
              {b.filtered.map(g => (
                <BulkGalleryRow
                  key={g.gallery_id}
                  gallery={g}
                  locale={locale}
                  businessSlug={businessSlug}
                  selected={b.selected.has(g.gallery_id)}
                  busy={b.busyId === g.gallery_id}
                  activeMembers={g.client_id ? b.clientById.get(g.client_id)?.active_member_count : undefined}
                  onToggle={() => b.toggleOne(g.gallery_id)}
                  onAssign={() => b.openAssign(g)}
                  onUnassign={() => void b.doUnassign(g)}
                />
              ))}
            </RowList>
          )}
        </>
      )}

      <AssignModal state={b.modal} locale={locale} />
    </div>
  )
}
