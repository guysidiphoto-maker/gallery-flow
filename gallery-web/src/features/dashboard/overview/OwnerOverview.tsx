// Owner home: a dismissible first-run checklist plus a compact studio status
// grid, built only from the existing self-scoped owner RPCs (no business_id
// from the browser). Handles loading, empty and error + retry states.

import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { WorkspaceView } from '@/shared/ui'
import { useOwnerOverview } from './useOwnerOverview'
import { OnboardingChecklist } from './OnboardingChecklist'
import { StatusGrid } from './StatusGrid'
import { RecentGalleries } from './RecentGalleries'

// The set of Dashboard views OwnerOverview can send the operator to.
export type OverviewNavTarget = 'galleries' | 'clients' | 'search' | 'import'

export interface OwnerOverviewProps {
  businessId: string | null
  businessSlug: string | null
  locale: 'he' | 'en'
  onNavigate: (view: OverviewNavTarget) => void
  onNewGallery: () => void
}

export default function OwnerOverview({
  businessId,
  locale,
  onNavigate,
  onNewGallery,
}: OwnerOverviewProps) {
  const { t, dir } = useOwnerLocale()
  const {
    loading, error, load, stats, checklist, doneCount, allDone, checklistDismissed, dismissChecklist,
  } = useOwnerOverview({ businessId, onNavigate, onNewGallery })

  return (
    <WorkspaceView dir={dir} eyebrow={t('nav.workspace')} title={t('overview.title')} description={t('overview.subtitle')}>

      {error && (
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-line-soft bg-raised px-[22px] py-5">
          <span className="text-sm text-ink-soft">{t('overview.error')}</span>
          <button
            onClick={() => void load()}
            className="cursor-pointer rounded-[4px] border-none bg-ink px-[18px] py-[9px] text-[13px] font-semibold text-white"
          >
            {t('overview.retry')}
          </button>
        </div>
      )}

      {!error && !checklistDismissed && !allDone && (
        <OnboardingChecklist loading={loading} checklist={checklist} doneCount={doneCount} onDismiss={dismissChecklist} />
      )}

      <StatusGrid loading={loading} stats={stats} onNavigate={onNavigate} />

      {stats && stats.recent.length > 0 && (
        <RecentGalleries recent={stats.recent} onSeeAll={() => onNavigate('galleries')} />
      )}

      {/* Empty state: no galleries at all */}
      {stats && stats.totalGalleries === 0 && (
        <div className="rounded-[8px] border border-dashed border-line-soft bg-raised px-6 py-8 text-center">
          <p className="mb-[18px] text-[15px] text-ink-soft">
            {t('overview.empty')}
          </p>
          <button
            onClick={onNewGallery}
            className="cursor-pointer rounded-[4px] border-none bg-ink px-[22px] py-[11px] text-sm font-semibold text-white"
          >
            {t('overview.empty.cta')}
          </button>
        </div>
      )}
    </WorkspaceView>
  )
}
