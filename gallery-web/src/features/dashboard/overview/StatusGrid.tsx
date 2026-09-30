import { Eyebrow } from '@/shared/ui'
import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import type { DerivedStats } from './overviewStats'
import type { OverviewNavTarget } from './OwnerOverview'
import { StatCard } from './StatCard'
import { SkeletonRows } from './SkeletonRows'

export function StatusGrid({ loading, stats, onNavigate }: {
  loading: boolean
  stats: DerivedStats | null
  onNavigate: (view: OverviewNavTarget) => void
}) {
  const { t, fmtNum } = useOwnerLocale()
  return (
    <section className="mb-9">
    <Eyebrow className="mb-4 block text-[9px] font-medium">{t('overview.status.title')}</Eyebrow>
    {loading && !stats ? (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-[8px] border border-line-soft bg-raised p-[22px]">
            <SkeletonRows count={2} />
          </div>
        ))}
      </div>
    ) : stats ? (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
        <StatCard
          value={fmtNum(stats.activeClients)}
          label={t('overview.card.activeClients')}
          onClick={() => onNavigate('clients')}
        />
        <StatCard
          value={fmtNum(stats.published)}
          hint={t('overview.card.drafts', { n: fmtNum(stats.drafts) })}
          label={t('overview.card.published')}
          onClick={() => onNavigate('galleries')}
        />
        <StatCard
          value={fmtNum(stats.unassigned)}
          label={t('overview.card.unassigned')}
          tone={stats.unassigned > 0 ? 'warn' : undefined}
          onClick={() => onNavigate('clients')}
        />
        <StatCard
          value={fmtNum(stats.notVisible)}
          label={t('overview.card.notVisible')}
          tone={stats.notVisible > 0 ? 'warn' : undefined}
          onClick={() => onNavigate('clients')}
        />
        <StatCard
          value={fmtNum(stats.pendingInvites)}
          label={t('overview.card.pendingInvites')}
          onClick={() => onNavigate('clients')}
        />
        <StatCard
          value={fmtNum(stats.totalGalleries)}
          label={t('overview.card.totalGalleries')}
          onClick={() => onNavigate('galleries')}
        />
      </div>
    ) : null}
  </section>
  )
}
