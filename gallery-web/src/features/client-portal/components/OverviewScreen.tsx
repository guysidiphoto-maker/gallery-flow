// Opening screen: greeting with the real client name, the latest gallery, then
// recent ones. Deliberately no invented stats.

import { Icon } from '@/shared/ui/Icon'
import { cn, Eyebrow } from '@/shared/ui'
import type { PortalLocale } from '@/shared/i18n/portalLocale'
import { countLabel } from '../lib/countLabel'
import { focusRing } from '../lib/focusRing'
import { PortalCover } from './PortalCover'
import { GalleryCard, type GalleryCardData } from './GalleryCard'
import { EmptyState } from './EmptyState'

interface Props {
  loc: PortalLocale
  clientName: string
  galleries: GalleryCardData[]
  hrefFor: (id: string) => string
  onViewAll: () => void
}

export function OverviewScreen({ loc, clientName, galleries, hrefFor, onViewAll }: Props) {
  const latest = galleries[0] ?? null
  const rest = galleries.slice(1, 4)

  return (
    <div>
      <section className="mb-10">
        <Eyebrow className="mb-3 block">{loc.t('nav.overview')}</Eyebrow>
        <h2 className="mb-3.5 font-serif text-[clamp(28px,4.5vw,40px)] leading-[1.08] font-medium tracking-[-0.01em] text-ink">
          {loc.t('overview.greeting', { name: clientName })}
        </h2>
        <p className="max-w-[560px] text-[15px] leading-[1.6] text-ink-soft">{loc.t('overview.subtitle')}</p>
      </section>

      {!latest ? (
        <EmptyState
          icon={<Icon name="gallery" size={30} strokeWidth={1.4} />}
          title={loc.t('overview.empty.title')}
          body={loc.t('overview.empty.body')}
        />
      ) : (
        <>
          <section className="mb-11">
            <Eyebrow className="mb-4 block">{loc.t('overview.latest')}</Eyebrow>
            <a
              href={hrefFor(latest.id)}
              aria-label={`${loc.t('overview.latestCta')} — ${latest.name}`}
              className={cn(
                'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] overflow-hidden rounded-sm border border-line-soft bg-white text-ink no-underline',
                'max-[641px]:grid-cols-1',
                focusRing,
              )}
            >
              <div className="min-h-[220px]">
                <PortalCover coverUrl={latest.coverUrl} name={latest.name} aspectClass="aspect-[16/10]" className="h-full" />
              </div>
              <div className="flex flex-col justify-center gap-3 p-[clamp(20px,3vw,32px)]">
                <div className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-ink-soft uppercase">
                  <span className="size-1.5 rounded-full bg-sage" />
                  {loc.t('status.published')}
                  {loc.fmtDate(latest.publishedIso) && (
                    <>
                      <span aria-hidden className="opacity-50">·</span>
                      <span>{loc.fmtDate(latest.publishedIso)}</span>
                    </>
                  )}
                </div>
                <h3 className="font-serif text-[clamp(22px,3vw,28px)] leading-[1.2] font-medium tracking-[-0.01em] text-ink">
                  {latest.name}
                </h3>
                <div className="text-[13px] text-muted">{countLabel(loc, latest.imageCount)}</div>
                <span className="mt-2 inline-flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-ink uppercase">
                  {loc.t('overview.latestCta')}
                  <Icon name="arrow-out" size={13} strokeWidth={1.85} />
                </span>
              </div>
            </a>
          </section>

          {rest.length > 0 && (
            <section>
              <div className="mb-[18px] flex flex-wrap items-end justify-between gap-4">
                <Eyebrow className="block">{loc.t('overview.recent')}</Eyebrow>
                <button
                  type="button"
                  onClick={onViewAll}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border border-line-soft bg-transparent px-3.5 py-2',
                    'text-[11px] font-medium tracking-[0.1em] text-ink-soft uppercase',
                    focusRing,
                  )}
                >
                  {loc.t('overview.recentCta')}
                  <Icon name="arrow-out" size={12} strokeWidth={1.85} />
                </button>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
                {rest.map(g => (
                  <GalleryCard
                    key={g.id}
                    data={g}
                    href={hrefFor(g.id)}
                    statusLabel={loc.t('status.published')}
                    dateLabel={loc.fmtDate(g.publishedIso)}
                    countLabel={countLabel(loc, g.imageCount)}
                    openLabel={loc.t('galleries.open')}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
