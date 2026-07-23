// OverviewScreen — the personalized opening screen for a selected client.
//
// Honest by design: a warm greeting with the REAL client name, a one-line human
// sentence, the latest gallery highlighted, then recent galleries. NO invented
// stats (no "pending approvals", cadence, or coverage guesses). Warm empty
// state when there are no galleries yet. Same for entitled and non-entitled
// clients — the difference is only which nav areas exist, not fabricated data.

import { Icon } from '../Icon'
import type { PortalLocale } from '../../lib/portalLocale'
import { tokens, eyebrow, serifDisplay } from './tokens'
import { PortalCover } from './CoverFallback'
import { GalleryCard, type GalleryCardData } from './GalleryCard'
import { EmptyState } from './EmptyState'

interface Props {
  loc: PortalLocale
  clientName: string
  galleries: GalleryCardData[]
  hrefFor: (id: string) => string
  onViewAll: () => void
}

function countLabel(loc: PortalLocale, n: number): string {
  if (n === 1) return loc.t('galleries.count.one')
  return loc.t('galleries.count', { n: loc.fmtNum(n) })
}

export function OverviewScreen({ loc, clientName, galleries, hrefFor, onViewAll }: Props) {
  const latest = galleries[0] ?? null
  const rest = galleries.slice(1, 4)

  return (
    <div>
      {/* Greeting */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ ...eyebrow, marginBottom: 12 }}>{loc.t('nav.overview')}</div>
        <h2 style={{ ...serifDisplay, fontSize: 'clamp(28px, 4.5vw, 40px)', margin: '0 0 14px', lineHeight: 1.08 }}>
          {loc.t('overview.greeting', { name: clientName })}
        </h2>
        <p style={{ fontSize: 15, color: tokens.textSecondary, margin: 0, lineHeight: 1.6, maxWidth: 560 }}>
          {loc.t('overview.subtitle')}
        </p>
      </section>

      {!latest ? (
        <EmptyState
          icon={<Icon name="gallery" size={30} strokeWidth={1.4} />}
          title={loc.t('overview.empty.title')}
          body={loc.t('overview.empty.body')}
        />
      ) : (
        <>
          {/* Latest gallery — feature block */}
          <section style={{ marginBottom: 44 }}>
            <div style={{ ...eyebrow, marginBottom: 16 }}>{loc.t('overview.latest')}</div>
            <a
              className="pf-focus pf-anim pf-feature-split"
              href={hrefFor(latest.id)}
              aria-label={`${loc.t('overview.latestCta')} — ${latest.name}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
                gap: 0,
                border: `1px solid ${tokens.border}`,
                borderRadius: 6,
                overflow: 'hidden',
                textDecoration: 'none',
                color: tokens.textPrimary,
                background: '#fff',
              }}
            >
              <div style={{ minHeight: 220 }}>
                <PortalCover coverUrl={latest.coverUrl} name={latest.name} aspectRatio="16 / 10" />
              </div>
              <div style={{ padding: 'clamp(20px, 3vw, 32px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: tokens.textSecondary }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: tokens.statusLive }} />
                  {loc.t('status.published')}
                  {loc.fmtDate(latest.publishedIso) && (
                    <>
                      <span aria-hidden style={{ opacity: 0.5 }}>·</span>
                      <span>{loc.fmtDate(latest.publishedIso)}</span>
                    </>
                  )}
                </div>
                <h3 style={{ ...serifDisplay, fontSize: 'clamp(22px, 3vw, 28px)', margin: 0, lineHeight: 1.2 }}>
                  {latest.name}
                </h3>
                <div style={{ fontSize: 13, color: tokens.textMuted }}>{countLabel(loc, latest.imageCount)}</div>
                <span style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: tokens.textPrimary }}>
                  {loc.t('overview.latestCta')}
                  <Icon name="arrow-out" size={13} strokeWidth={1.85} />
                </span>
              </div>
            </a>
          </section>

          {/* Recent galleries */}
          {rest.length > 0 && (
            <section>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
                <div style={eyebrow}>{loc.t('overview.recent')}</div>
                <button
                  type="button"
                  className="pf-focus pf-anim"
                  onClick={onViewAll}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    border: `1px solid ${tokens.border}`,
                    borderRadius: 999,
                    background: 'transparent',
                    color: tokens.textSecondary,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  {loc.t('overview.recentCta')}
                  <Icon name="arrow-out" size={12} strokeWidth={1.85} />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
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
