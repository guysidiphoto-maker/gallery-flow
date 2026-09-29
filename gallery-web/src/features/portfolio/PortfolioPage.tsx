import { useState } from 'react'
import { getFontFamily } from './portfolioSettings'
import { ensureStylesheet } from './fonts'
import { EVENT_LABELS, readStr, type EventType, type GalleryRow, type PortfolioView } from './page/lib'
import { usePortfolioData } from './page/usePortfolioData'
import { useReveal } from './page/useReveal'
import { useScrollY } from './page/useScrollY'
import { buildMosaicPool, useMosaic } from './page/useMosaic'
import { PortfolioNav } from './page/PortfolioNav'
import { PortfolioHero } from './page/PortfolioHero'
import { EventTypePanels } from './page/EventTypePanels'
import { TypeView } from './page/TypeView'
import { GalleryView } from './page/GalleryView'
import { PortfolioFooter } from './page/PortfolioFooter'
import './portfolio.css'

ensureStylesheet('https://fonts.googleapis.com/css2?family=Marcellus&family=Heebo:wght@300;400;500;600;700;800&family=Rubik:wght@300;400;500;600;700;800&family=Assistant:wght@300;400;500;600;700;800&display=swap')

function clientIdFromPath(): string {
  const path = window.location.pathname.replace(/\/$/, '')
  const m1 = path.match(/^\/([^/]+)\/client\/([^/]+)$/)
  if (m1) return m1[2]
  const m2 = path.match(/^\/client\/([^/]+)$/)
  if (m2) return m2[1]
  return ''
}

export function PortfolioPage() {
  const clientId = clientIdFromPath()
  const { loading, clientName, studioName, galleries, topPicks, covers, settings } = usePortfolioData(clientId)
  const [view, setView] = useState<PortfolioView>('home')
  const [activeType, setActiveType] = useState('')
  const [activeGalleryId, setActiveGalleryId] = useState('')
  const scrollY = useScrollY()
  const reveal = useReveal()

  const visible = galleries.filter(g => !settings.hiddenGalleryIds.includes(g.id))
  const typeMap = new Map<string, GalleryRow[]>()
  visible.forEach(g => {
    const et = readStr(g.delivery_settings, 'eventType') || 'other'
    if (!typeMap.has(et)) typeMap.set(et, [])
    typeMap.get(et)!.push(g)
  })
  const types: EventType[] = Array.from(typeMap.entries()).map(([key, gals]) => ({
    key, label: EVENT_LABELS[key] || key, gals, cover: covers.get(gals[0].id) || '',
  }))
  const typeGals = activeType ? (typeMap.get(activeType) || []) : []
  const galPhotos = activeGalleryId ? topPicks.filter(p => p.gallery_id === activeGalleryId) : []
  const activeGal = galleries.find(g => g.id === activeGalleryId)

  const mosaicTiles = useMosaic(buildMosaicPool(visible, topPicks, covers), topPicks.length, visible.length)

  const navigateTo = (v: PortfolioView, type = '', galId = '') => {
    setView(v); setActiveType(type); setActiveGalleryId(galId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-black">
      <div className="relative h-10 w-px overflow-hidden bg-white/20">
        <div className="absolute inset-0 animate-[pp-load-bar_1s_ease_infinite] bg-white" />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: getFontFamily(settings.fontStyle) }}>
      <PortfolioNav
        logo={settings.logoBase64}
        brandName={studioName || clientName}
        view={view}
        onHome={() => navigateTo('home')}
        onBack={() => navigateTo(view === 'gallery' ? 'type' : 'home', view === 'gallery' ? activeType : '')}
      />

      {view === 'home' && (
        <div className="min-h-screen">
          <PortfolioHero
            scrollY={scrollY}
            tiles={mosaicTiles}
            logo={settings.logoBase64}
            title={settings.pageTitle || clientName}
            tagline={settings.tagline}
          />
          <EventTypePanels types={types} scrollY={scrollY} reveal={reveal} onOpen={key => navigateTo('type', key)} />
        </div>
      )}

      {view === 'type' && (
        <TypeView
          typeKey={activeType}
          galleries={typeGals}
          covers={covers}
          topPicks={topPicks}
          reveal={reveal}
          onOpen={id => navigateTo('gallery', activeType, id)}
        />
      )}

      {view === 'gallery' && activeGal && <GalleryView gallery={activeGal} photos={galPhotos} reveal={reveal} />}

      <PortfolioFooter settings={settings} studioName={studioName} />
    </div>
  )
}
