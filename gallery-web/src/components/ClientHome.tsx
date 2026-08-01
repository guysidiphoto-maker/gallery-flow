// ClientHome — the Overview screen for ENTITLED (Production) clients.
//
// Honest by design. The earlier version showed fabricated engine stats
// (weeks-of-content, "pending approvals: 0", cadence math, guessed missing
// categories) that were not backed by real data — those are removed. This is
// now the same warm, personalized Overview non-entitled clients get (greeting +
// latest gallery + recent galleries), with two quiet entry points into the
// Production surfaces the client already has access to. No invented numbers.

import type { PortalLocale } from '../lib/portalLocale'
import { OverviewScreen } from './portal/OverviewScreen'
import type { GalleryCardData } from './portal/GalleryCard'
import { tokens } from './portal/tokens'
import { Icon } from './Icon'

interface GalleryLike {
  id: string
  name?: string | null
  client_name?: string | null
  image_count?: number | null
  published_at?: string | null
}

export interface ClientHomeProps {
  loc: PortalLocale
  clientName: string
  galleries: GalleryLike[]
  covers: Map<string, string>
  galleryHref: (id: string) => string
  onGoSocial: () => void
  onGoLibrary: () => void
}

export function ClientHome({
  loc,
  clientName,
  galleries,
  covers,
  galleryHref,
  onGoSocial,
  onGoLibrary,
}: ClientHomeProps) {
  const cards: GalleryCardData[] = galleries.map(g => ({
    id: g.id,
    name: g.name || g.client_name || loc.t('nav.galleries'),
    coverUrl: covers.get(g.id) ?? null,
    imageCount: g.image_count ?? 0,
    publishedIso: g.published_at ?? null,
  }))

  const quickAction = (label: string, icon: 'stories' | 'sections', onClick: () => void) => (
    <button
      type="button"
      className="pf-focus pf-anim"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 18px',
        border: `1px solid ${tokens.border}`,
        borderRadius: 999,
        background: '#fff',
        color: tokens.textPrimary,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.02em',
      }}
    >
      <Icon name={icon} size={15} strokeWidth={1.65} />
      {label}
    </button>
  )

  return (
    <div>
      <OverviewScreen
        loc={loc}
        clientName={clientName}
        galleries={cards}
        hrefFor={galleryHref}
        onViewAll={onGoLibrary}
      />
      {cards.length > 0 && (
        <div style={{ marginTop: 36, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {quickAction(loc.t('nav.socialStudio'), 'stories', onGoSocial)}
          {quickAction(loc.t('nav.galleries'), 'sections', onGoLibrary)}
        </div>
      )}
    </div>
  )
}
