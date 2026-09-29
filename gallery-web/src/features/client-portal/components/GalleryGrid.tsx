// Client-facing galleries screen: responsive card grid with a light search
// (shown only when there are enough galleries to need it).

import { useState } from 'react'
import { Icon } from '@/shared/ui/Icon'
import { cn, Eyebrow } from '@/shared/ui'
import type { PortalLocale } from '@/shared/i18n/portalLocale'
import { countLabel } from '../lib/countLabel'
import { focusRing } from '../lib/focusRing'
import { GalleryCard, type GalleryCardData } from './GalleryCard'
import { EmptyState } from './EmptyState'

interface Props {
  loc: PortalLocale
  items: GalleryCardData[]
  hrefFor: (id: string) => string
  searchable?: boolean
}

export function GalleryGrid({ loc, items, hrefFor, searchable = true }: Props) {
  const [query, setQuery] = useState('')
  const showSearch = searchable && items.length > 6

  const filtered = query.trim()
    ? items.filter(g => g.name.toLowerCase().includes(query.trim().toLowerCase()))
    : items

  return (
    <section>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow className="mb-2.5 block">{loc.t('nav.galleries')}</Eyebrow>
          <h2 className="mb-1.5 font-serif text-[clamp(24px,3.4vw,30px)] font-medium tracking-[-0.01em] text-ink">
            {loc.t('galleries.title')}
          </h2>
          <p className="text-sm leading-[1.55] text-ink-soft">{loc.t('galleries.subtitle')}</p>
        </div>

        {showSearch && (
          <div className="relative min-w-[220px] flex-[0_1_300px]">
            <span aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 flex -translate-y-1/2 text-muted">
              <Icon name="search" size={14} strokeWidth={1.75} />
            </span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={loc.t('galleries.search')}
              aria-label={loc.t('galleries.search')}
              className={cn(
                'w-full rounded-full border border-line-soft bg-white py-[11px] ps-10 pe-3.5 text-[13px] text-ink outline-none',
                focusRing,
              )}
            />
          </div>
        )}
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={<Icon name="gallery" size={30} strokeWidth={1.4} />}
          title={loc.t('galleries.empty.title')}
          body={loc.t('galleries.empty.body')}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title={loc.t('galleries.noResults')} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
          {filtered.map(g => (
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
      )}
    </section>
  )
}
