import { lazy, Suspense, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import type { PortalLocale } from '@/shared/i18n/portalLocale'
import { loadPortfolioSettings } from '@/features/portfolio/portfolioSettings'
import type { PortalMembership } from '../lib/bootstrap'
import { clearLegacySession } from '../lib/legacySession'
import type { PortalGalleryRow } from '../hooks/usePortalGalleries'
import { PortalShell } from './PortalShell'
import type { NavItem } from './PortalNav'
import { OverviewScreen } from './OverviewScreen'
import { GalleryGrid } from './GalleryGrid'
import type { GalleryCardData } from './GalleryCard'

const PortfolioEditor = lazy(() => import('@/features/portfolio/PortfolioEditor').then(m => ({ default: m.PortfolioEditor })))

function readStr(obj: Record<string, unknown> | null, key: string): string {
  if (!obj) return ''; const v = obj[key]; return typeof v === 'string' ? v : ''
}

/** The authorized portal: shell, tabs and sign-out. Galleries is non-empty here. */
export function PortalContent({ loc, slug, clientId, galleries, covers, membership, memberEmail }: {
  loc: PortalLocale
  slug: string
  clientId: string
  galleries: PortalGalleryRow[]
  covers: Map<string, string>
  membership: PortalMembership | null
  memberEmail: string | null
}) {
  const [tab, setTab] = useState<'overview' | 'galleries' | 'page'>('overview')
  const [signingOut, setSigningOut] = useState(false)
  // Default deny: only an active membership that carries production_suite.
  const productionEnabled = membership?.production_suite === true

  const deliverySettings = (galleries[0].delivery_settings || {}) as Record<string, unknown>
  const studioName = readStr(deliverySettings, 'studioName')
  const clientName = galleries[0].client_name || readStr(deliverySettings, 'clientName') || 'Dashboard'
  const displayTitle = loadPortfolioSettings(clientId).pageTitle || clientName
  const galleryUrl = (id: string) => slug ? `/${slug}/gallery/${id}` : `/gallery/${id}`

  // Signs out a member and also clears any legacy PIN session.
  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await supabase.auth.signOut()
    } catch { /* redirect regardless */ }
    try {
      clearLegacySession(clientId)
    } catch { /* ignore */ }
    window.location.href = '/client-login'
  }

  const galleryCards: GalleryCardData[] = galleries.map(g => ({
    id: g.id,
    name: g.name,
    coverUrl: covers.get(g.id) ?? null,
    imageCount: g.image_count,
    publishedIso: g.published_at,
  }))

  const navItems: NavItem[] = [
    { id: 'overview', label: loc.t('nav.overview'), icon: 'activity', onSelect: () => setTab('overview') },
    { id: 'galleries', label: loc.t('nav.galleries'), icon: 'sections', onSelect: () => setTab('galleries') },
    ...(productionEnabled ? [{
      id: 'page', label: loc.t('nav.myPage'), icon: 'palette' as const, onSelect: () => setTab('page'),
    }] : []),
  ]

  return (
    <PortalShell
      loc={loc}
      studioName={studioName}
      clientTitle={displayTitle}
      navItems={navItems}
      activeNavId={tab}
      showAccount={membership !== null}
      email={memberEmail}
      clientName={membership?.client_name ?? clientName}
      signingOut={signingOut}
      onSignOut={() => { void handleSignOut() }}
    >
      <div dir={loc.dir}>
        {tab === 'overview' && (
          <OverviewScreen
            loc={loc}
            clientName={membership?.client_name || clientName}
            galleries={galleryCards}
            hrefFor={galleryUrl}
            onViewAll={() => setTab('galleries')}
          />
        )}
        {tab === 'galleries' && <GalleryGrid loc={loc} items={galleryCards} hrefFor={galleryUrl} />}
        {tab === 'page' && productionEnabled && (
          <Suspense fallback={<div className="p-10 text-[11px] tracking-label text-muted uppercase">Loading…</div>}>
            <PortfolioEditor
              clientId={clientId}
              clientName={clientName}
              studioName={studioName}
              galleries={galleries}
              covers={covers}
              publicUrl={`https://pixflow-ai.com/${slug}/client/${clientId}`}
            />
          </Suspense>
        )}
      </div>
    </PortalShell>
  )
}
