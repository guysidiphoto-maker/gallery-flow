import { cn, Eyebrow } from '@/shared/ui'
import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import type { AssignableGalleryRow } from '@/features/clients/api'

export function RecentGalleries({ recent, onSeeAll }: {
  recent: AssignableGalleryRow[]
  onSeeAll: () => void
}) {
  const { t, fmtDate } = useOwnerLocale()
  return (
    <section className="mb-3">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <Eyebrow className="text-[9px] font-medium">{t('overview.recent.title')}</Eyebrow>
        <button
          onClick={onSeeAll}
          className="cursor-pointer border-none bg-transparent text-xs font-semibold text-ink-soft"
        >
          {t('overview.recent.all')}
        </button>
      </div>
      <div className="overflow-hidden rounded-[8px] border border-line-soft bg-raised">
        {recent.map((g, i) => (
          <div key={g.gallery_id} className={cn('flex items-center gap-3 px-[18px] py-3.5', i > 0 && 'border-t border-line-soft')}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">
                {g.name}
              </div>
              <div className="mt-[3px] text-xs text-muted">
                {g.client_name
                  ? g.client_name
                  : t('overview.recent.noClient')}
                {g.event_date ? ` · ${fmtDate(g.event_date)}` : ''}
              </div>
            </div>
            <span
              className={cn(
                'rounded-[3px] border px-[9px] py-1 text-[10px] font-semibold tracking-[0.12em] uppercase',
                g.status === 'live' ? 'border-success text-success' : 'border-line-soft text-muted',
              )}
            >
              {g.status === 'live' ? t('overview.recent.live') : t('overview.recent.draft')}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
