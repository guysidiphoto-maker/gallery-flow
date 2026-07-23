// GalleryGrid — the client-facing galleries screen. A responsive card grid with
// a subtle, client-friendly search (not an admin toolbar). No keyboard-shortcut
// hints, no sort/view-mode toggles, no exposed favorite mechanics.

import { useState } from 'react'
import { Icon } from '../Icon'
import type { PortalLocale } from '../../lib/portalLocale'
import { tokens, eyebrow, serifDisplay } from './tokens'
import { GalleryCard, type GalleryCardData } from './GalleryCard'
import { EmptyState } from './EmptyState'

interface Props {
  loc: PortalLocale
  items: GalleryCardData[]
  hrefFor: (id: string) => string
  /** Show the search field only when there are enough galleries to warrant it. */
  searchable?: boolean
}

function countLabel(loc: PortalLocale, n: number): string {
  if (n === 1) return loc.t('galleries.count.one')
  return loc.t('galleries.count', { n: loc.fmtNum(n) })
}

export function GalleryGrid({ loc, items, hrefFor, searchable = true }: Props) {
  const [query, setQuery] = useState('')
  const showSearch = searchable && items.length > 6

  const filtered = query.trim()
    ? items.filter(g => g.name.toLowerCase().includes(query.trim().toLowerCase()))
    : items

  return (
    <section>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 28,
        }}
      >
        <div>
          <div style={{ ...eyebrow, marginBottom: 10 }}>{loc.t('nav.galleries')}</div>
          <h2 style={{ ...serifDisplay, fontSize: 'clamp(24px, 3.4vw, 30px)', margin: '0 0 6px' }}>
            {loc.t('galleries.title')}
          </h2>
          <p style={{ fontSize: 14, color: tokens.textSecondary, margin: 0, lineHeight: 1.55 }}>
            {loc.t('galleries.subtitle')}
          </p>
        </div>

        {showSearch && (
          <div style={{ position: 'relative', flex: '0 1 300px', minWidth: 220 }}>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                insetInlineStart: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: tokens.textMuted,
                display: 'flex',
                pointerEvents: 'none',
              }}
            >
              <Icon name="search" size={14} strokeWidth={1.75} />
            </span>
            <input
              className="pf-focus"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={loc.t('galleries.search')}
              aria-label={loc.t('galleries.search')}
              style={{
                width: '100%',
                padding: loc.dir === 'rtl' ? '11px 40px 11px 14px' : '11px 14px 11px 40px',
                background: '#fff',
                border: `1px solid ${tokens.border}`,
                borderRadius: 999,
                color: tokens.textPrimary,
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
              }}
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 20,
          }}
        >
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
