import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, storageUrl } from '../supabase'
import { loadPortfolioSettings, type PortfolioSettings, DEFAULT_SETTINGS } from '../components/PortfolioEditor'

// ─── Types ──────────────────────────────────────────────────────────────────

interface GalleryRow {
  id: string; name: string; client_name: string | null; image_count: number
  published_at: string | null; delivery_settings: Record<string, unknown> | null
}
interface ImageRow {
  id: string; gallery_id: string; filename: string
  storage_path: string; thumbnail_path: string | null
}

const EVENT_LABELS: Record<string, string> = {
  'conference': 'Conferences', 'corporate-event': 'Corporate', 'government': 'Government',
  'retreat-abroad': 'Retreats Abroad', 'retreat-local': 'Local Retreats',
  'pre-event': 'Pre-Events', 'other': 'Events',
}

function readStr(obj: Record<string, unknown> | null, key: string): string {
  if (!obj) return ''; const v = obj[key]; return typeof v === 'string' ? v : ''
}
function imgUrl(path: string | null) { return path ? storageUrl('gallery-images', path) : '' }

// ─── Scroll reveal ──────────────────────────────────────────────────────────

function useReveal(delay = 0) {
  const obs = useRef<IntersectionObserver | null>(null)
  return useCallback((el: HTMLElement | null) => {
    if (!el) return
    if (!obs.current) {
      obs.current = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const d = Number((e.target as HTMLElement).dataset.delay || delay)
            setTimeout(() => {
              ;(e.target as HTMLElement).style.opacity = '1'
              ;(e.target as HTMLElement).style.transform = 'none'
            }, d)
            obs.current?.unobserve(e.target)
          }
        })
      }, { threshold: 0.05 })
    }
    el.style.opacity = '0'
    el.style.transform = 'translateY(40px)'
    el.style.transition = 'opacity .9s cubic-bezier(.16,1,.3,1), transform .9s cubic-bezier(.16,1,.3,1)'
    requestAnimationFrame(() => obs.current?.observe(el))
  }, [delay])
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PortfolioPage() {
  const { clientId } = (() => {
    const path = window.location.pathname.replace(/\/$/, '')
    const m1 = path.match(/^\/([^/]+)\/client\/([^/]+)$/); if (m1) return { clientId: m1[2] }
    const m2 = path.match(/^\/client\/([^/]+)$/); if (m2) return { clientId: m2[1] }
    return { clientId: '' }
  })()

  const [loading, setLoading] = useState(true)
  const [clientName, setClientName] = useState('')
  const [studioName, setStudioName] = useState('')
  const [galleries, setGalleries] = useState<GalleryRow[]>([])
  const [topPicks, setTopPicks] = useState<ImageRow[]>([])
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
  const [settings, setSettings] = useState<PortfolioSettings>(DEFAULT_SETTINGS)
  const [view, setView] = useState<'home' | 'type' | 'gallery'>('home')
  const [activeType, setActiveType] = useState('')
  const [activeGalleryId, setActiveGalleryId] = useState('')
  const [scrollY, setScrollY] = useState(0)
  const reveal = useReveal()

  // Track scroll for parallax/fade effects
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // ── Load ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!clientId) { setLoading(false); return }
    ;(async () => {
      const { data } = await supabase.from('galleries')
        .select('id, name, client_name, image_count, published_at, delivery_settings')
        .eq('client_id', clientId).eq('status', 'live').order('published_at', { ascending: false })
      if (!data?.length) { setLoading(false); return }
      setGalleries(data)
      const s0 = (data[0].delivery_settings || {}) as Record<string, unknown>
      setClientName(data[0].client_name || readStr(s0, 'clientName') || '')
      setStudioName(readStr(s0, 'studioName'))
      // covers
      const cm = new Map<string, string>()
      await Promise.all(data.map(async g => {
        const { data: img } = await supabase.from('images').select('thumbnail_path, storage_path')
          .eq('gallery_id', g.id).order('sort_order', { ascending: true }).limit(1).maybeSingle()
        if (img) cm.set(g.id, imgUrl(img.thumbnail_path || img.storage_path))
      }))
      setCovers(cm)
      // top picks
      const { data: picks } = await supabase.from('images')
        .select('id, gallery_id, filename, storage_path, thumbnail_path')
        .in('gallery_id', data.map(g => g.id)).eq('is_top_pick', true)
        .order('sort_order', { ascending: true }).limit(200)
      if (picks) setTopPicks(picks)
      setSettings(loadPortfolioSettings(clientId))
      setLoading(false)
    })()
  }, [clientId])

  // ── Derived ───────────────────────────────────────────────────────────

  const visible = galleries.filter(g => !settings.hiddenGalleryIds.includes(g.id))
  const typeMap = new Map<string, GalleryRow[]>()
  visible.forEach(g => {
    const et = readStr(g.delivery_settings, 'eventType') || 'other'
    if (!typeMap.has(et)) typeMap.set(et, [])
    typeMap.get(et)!.push(g)
  })
  const types = Array.from(typeMap.entries()).map(([key, gals]) => ({
    key, label: EVENT_LABELS[key] || key, gals, cover: covers.get(gals[0].id) || '',
  }))

  const typeGals = activeType ? (typeMap.get(activeType) || []) : []
  const galPhotos = activeGalleryId ? topPicks.filter(p => p.gallery_id === activeGalleryId) : []
  const activeGal = galleries.find(g => g.id === activeGalleryId)
  const accent = settings.accentColor

  // Build mosaic pool: top 5 picks per gallery
  const mosaicPool: string[] = []
  visible.forEach(g => {
    const picks = topPicks.filter(p => p.gallery_id === g.id).slice(0, 5)
    picks.forEach(p => mosaicPool.push(imgUrl(p.thumbnail_path || p.storage_path)))
  })
  // Pad to at least 30 by repeating
  while (mosaicPool.length > 0 && mosaicPool.length < 30) {
    mosaicPool.push(mosaicPool[mosaicPool.length % mosaicPool.length])
  }

  // Mosaic state: 30 tiles, each cycling through images
  const [mosaicTiles, setMosaicTiles] = useState<string[]>([])
  const mosaicRef = useRef<number>(0)

  useEffect(() => {
    if (mosaicPool.length === 0) return
    // Initial fill — shuffled, NO duplicates
    const shuffled = [...mosaicPool].sort(() => Math.random() - .5)
    const unique: string[] = []
    for (const url of shuffled) {
      if (!unique.includes(url)) unique.push(url)
      if (unique.length >= 30) break
    }
    // Pad if not enough unique
    while (unique.length < 30 && mosaicPool.length > 0) {
      unique.push(mosaicPool[unique.length % mosaicPool.length])
    }
    setMosaicTiles(unique)

    // Swap one tile every 2s — pick tile that won't create a duplicate
    const interval = setInterval(() => {
      setMosaicTiles(prev => {
        const next = [...prev]
        // Pick a random tile to swap
        const tileIdx = Math.floor(Math.random() * 30)
        // Pick a random image NOT already in the grid
        const candidates = mosaicPool.filter(url => !next.includes(url))
        if (candidates.length > 0) {
          next[tileIdx] = candidates[Math.floor(Math.random() * candidates.length)]
        } else {
          // All images used, just pick a different one from what's in this tile
          const others = mosaicPool.filter(url => url !== next[tileIdx])
          if (others.length > 0) next[tileIdx] = others[Math.floor(Math.random() * others.length)]
        }
        return next
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [topPicks.length, visible.length])

  const navigateTo = (v: 'home' | 'type' | 'gallery', type = '', galId = '') => {
    setView(v); setActiveType(type); setActiveGalleryId(galId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Loading ───────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ height: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,.2)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: '#fff', animation: 'loadBar 1s ease infinite' }} />
      </div>
      <style>{`@keyframes loadBar { 0% { transform: translateY(-100%) } 50% { transform: translateY(0) } 100% { transform: translateY(100%) } }`}</style>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh', background: '#000', color: '#fff',
      fontFamily: "'Marcellus', Georgia, 'Times New Roman', serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Marcellus&display=swap');
        * { box-sizing: border-box; }
        .pf-panel { position: relative; overflow: hidden; cursor: pointer; }
        .pf-panel img { transition: transform .8s cubic-bezier(.4,0,.2,1), filter .6s; }
        .pf-panel:hover img { transform: scale(1.04); filter: brightness(1.1); }
        .pf-panel:hover .pf-overlay { opacity: .45; }
        .pf-panel .pf-overlay { transition: opacity .6s; }
        .pf-panel:hover .pf-label { opacity: 1; transform: translateY(0); }
        .pf-panel .pf-label { transition: opacity .5s .1s, transform .5s .1s cubic-bezier(.16,1,.3,1); }
        .pf-thumb { overflow: hidden; cursor: pointer; }
        .pf-thumb img { transition: transform .6s cubic-bezier(.4,0,.2,1); }
        .pf-thumb:hover img { transform: scale(1.06); }
        .pf-back { transition: opacity .2s; }
        .pf-back:hover { opacity: 1 !important; }
      `}</style>

      {/* ═══ Navigation ═══ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '20px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(180deg, rgba(0,0,0,.6) 0%, transparent 100%)',
        pointerEvents: 'none',
      }}>
        <div style={{ pointerEvents: 'auto', cursor: 'pointer' }} onClick={() => navigateTo('home')}>
          {settings.logoBase64 ? (
            <img src={settings.logoBase64} alt="" style={{ maxHeight: 36, filter: 'brightness(10) grayscale(1)', opacity: .9 }} />
          ) : (
            <div style={{
              fontSize: 11, fontWeight: 400, letterSpacing: '.25em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,.7)',
            }}>
              {studioName || clientName}
            </div>
          )}
        </div>
        {view !== 'home' && (
          <button className="pf-back" onClick={() => navigateTo(view === 'gallery' ? 'type' : 'home', view === 'gallery' ? activeType : '')}
            style={{
              pointerEvents: 'auto', background: 'none', border: '1px solid rgba(255,255,255,.2)',
              borderRadius: 0, padding: '8px 20px', cursor: 'pointer',
              color: 'rgba(255,255,255,.6)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase',
              fontFamily: 'inherit', opacity: .7,
            }}>
            Back
          </button>
        )}
      </nav>

      {/* ═══ HOME: Split panels ═══ */}
      {view === 'home' && (
        <div style={{ minHeight: '100vh' }}>
          {/* Hero — parallax: image moves slower, content fades out on scroll */}
          {(() => {
            const vh = typeof window !== 'undefined' ? window.innerHeight : 900
            // Sequential: name fully gone, THEN question appears after a gap
            const showName = scrollY < vh * 0.3
            const showQuestion = scrollY >= vh * 0.5 && scrollY < vh * 0.9
            const heroDarken = Math.min(.92, .15 + scrollY / (vh * 0.5))
            const heroImgY = scrollY * 0.3
            return (
              <section style={{
                height: '200vh', position: 'relative',
              }}>
                {/* Sticky frame — stays in view during scroll */}
                <div style={{
                  position: 'sticky', top: 0, height: '100vh',
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* Mosaic collage background — 30 tiles cycling images */}
                  {mosaicTiles.length > 0 && (
                    <div style={{
                      position: 'absolute', inset: -10, /* slight overflow to avoid edge gaps */
                      display: 'grid',
                      gridTemplateColumns: 'repeat(6, 1fr)',
                      gridTemplateRows: 'repeat(5, 1fr)',
                      gap: 3,
                      transform: `translateY(${-heroImgY * 0.5}px)`,
                      willChange: 'transform',
                    }}>
                      {mosaicTiles.map((url, i) => (
                        <div key={i} style={{
                          overflow: 'hidden', position: 'relative',
                          background: '#0a0a0a',
                        }}>
                          <img src={url} alt="" style={{
                            position: 'absolute', inset: 0, width: '100%', height: '100%',
                            objectFit: 'cover', display: 'block',
                            animation: `tileFade 2s ease both`,
                          }} key={url + '-' + i} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dynamic darken overlay — gets darker as you scroll */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: `rgba(0,0,0,${heroDarken})`,
                  }} />

                  {/* Company name — visible only before 35% scroll */}
                  {(() => {
                    return (
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        opacity: showName ? 1 : 0,
                        transform: showName ? 'none' : 'translateY(20px)',
                        transition: 'opacity .6s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1)',
                        willChange: 'opacity, transform',
                        pointerEvents: 'none',
                        animation: 'heroFadeIn 1.4s cubic-bezier(.16,1,.3,1) both',
                      }}>
                        {settings.logoBase64 && (
                          <img src={settings.logoBase64} alt="" style={{
                            maxHeight: 70, maxWidth: 240, marginBottom: 20, display: 'block',
                          }} />
                        )}
                        <h1 style={{
                          fontSize: 'clamp(32px, 6vw, 80px)', fontWeight: 400, margin: 0,
                          letterSpacing: '.04em', lineHeight: 1.1,
                        }}>
                          {clientName}
                        </h1>
                        {settings.tagline && (
                          <p style={{
                            fontSize: 'clamp(12px, 1.4vw, 16px)', fontWeight: 400,
                            color: 'rgba(255,255,255,.5)', marginTop: 14,
                            letterSpacing: '.15em', textTransform: 'uppercase',
                          }}>
                            {settings.tagline}
                          </p>
                        )}
                      </div>
                    )
                  })()}

                  {/* Scroll indicator — fades with name */}
                  <div style={{
                    position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    opacity: showName ? 1 : 0,
                    transition: 'opacity .5s',
                    animation: 'heroFadeIn 1.4s cubic-bezier(.16,1,.3,1) both .6s',
                    pointerEvents: 'none',
                  }}>
                    <div style={{ fontSize: 9, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)' }}>
                      Scroll
                    </div>
                    <div style={{ animation: 'scrollBounce 2s ease infinite' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.5">
                        <path d="M12 5v14M19 12l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Question text — ONLY visible between 35%-90% scroll */}
                  {(() => {
                    const qOpacity = showQuestion ? 1 : 0
                    const qY = showQuestion ? 0 : 30
                    return (
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        opacity: qOpacity,
                        transform: `translateY(${qY}px)`,
                        transition: 'opacity .6s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1)',
                        pointerEvents: 'none',
                      }}>
                        <div style={{
                          width: 30, height: 1, background: 'rgba(255,255,255,.2)', marginBottom: 28,
                        }} />
                        <div style={{
                          fontSize: 'clamp(26px, 5vw, 64px)', fontWeight: 400,
                          letterSpacing: '.01em', lineHeight: 1.15,
                          maxWidth: 700, textAlign: 'center', color: '#fff',
                        }}>
                          Step into the
                          <br />
                          <span style={{ fontStyle: 'italic', letterSpacing: '.04em' }}>experience</span>
                        </div>
                        <div style={{
                          fontSize: 'clamp(9px, 1.1vw, 13px)', letterSpacing: '.3em', textTransform: 'uppercase',
                          color: 'rgba(255,255,255,.3)', marginTop: 22,
                        }}>
                          Choose your event
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </section>
            )
          })()}

          {/* Event type panels */}
          <section style={{ padding: '0' }}>
            {types.length === 1 ? (
              /* Single type — full screen panel */
              <div className="pf-panel" ref={reveal}
                onClick={() => navigateTo('type', types[0].key)}
                style={{ height: '100vh', position: 'relative' }}>
                {types[0].cover && <img src={types[0].cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                <div className="pf-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                  <div style={{ fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
                    {types[0].gals.length} {types[0].gals.length === 1 ? 'Project' : 'Projects'}
                  </div>
                  <h2 style={{ fontSize: 'clamp(28px, 4vw, 56px)', fontWeight: 400, margin: 0, letterSpacing: '.06em' }}>
                    {types[0].label}
                  </h2>
                  <div className="pf-label" style={{ opacity: 0, transform: 'translateY(8px)', marginTop: 20, fontSize: 10, letterSpacing: '.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', borderBottom: '1px solid rgba(255,255,255,.3)', paddingBottom: 4 }}>
                    See More
                  </div>
                </div>
              </div>
            ) : types.length === 2 ? (
              /* Two types — split screen */
              <div style={{ display: 'flex', height: '100vh' }}>
                {types.map(t => (
                  <div key={t.key} className="pf-panel" ref={reveal}
                    onClick={() => navigateTo('type', t.key)}
                    style={{ flex: 1, position: 'relative', transition: 'flex .6s cubic-bezier(.4,0,.2,1)' }}
                    onMouseEnter={e => { e.currentTarget.style.flex = '1.8' }}
                    onMouseLeave={e => { e.currentTarget.style.flex = '1' }}>
                    {t.cover && <img src={t.cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                    <div className="pf-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                      <div style={{ fontSize: 10, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', marginBottom: 8 }}>
                        {t.gals.length} Projects
                      </div>
                      <h2 style={{ fontSize: 'clamp(20px, 3vw, 40px)', fontWeight: 400, margin: 0, letterSpacing: '.06em' }}>
                        {t.label}
                      </h2>
                      <div className="pf-label" style={{ opacity: 0, transform: 'translateY(8px)', marginTop: 16, fontSize: 10, letterSpacing: '.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', borderBottom: '1px solid rgba(255,255,255,.3)', paddingBottom: 4 }}>
                        See More
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* 3+ types — stacked full-width panels */
              types.map(t => (
                <div key={t.key} className="pf-panel" ref={reveal}
                  onClick={() => navigateTo('type', t.key)}
                  style={{ height: '70vh', minHeight: 400, position: 'relative' }}>
                  {t.cover && <img src={t.cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                  <div className="pf-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                    <div style={{ fontSize: 10, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', marginBottom: 8 }}>
                      {t.gals.length} Projects
                    </div>
                    <h2 style={{ fontSize: 'clamp(24px, 4vw, 52px)', fontWeight: 400, margin: 0, letterSpacing: '.06em' }}>
                      {t.label}
                    </h2>
                    <div className="pf-label" style={{ opacity: 0, transform: 'translateY(8px)', marginTop: 16, fontSize: 10, letterSpacing: '.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', borderBottom: '1px solid rgba(255,255,255,.3)', paddingBottom: 4 }}>
                      See More
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}

      {/* ═══ TYPE VIEW: Gallery list ═══ */}
      {view === 'type' && (
        <div style={{ paddingTop: 120, paddingBottom: 80, animation: 'viewFadeIn .7s cubic-bezier(.16,1,.3,1) both' }}>
          <div style={{ textAlign: 'center', marginBottom: 60, padding: '0 24px' }}>
            <div style={{ fontSize: 10, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginBottom: 12 }}>
              {typeGals.length} Projects
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 400, margin: 0, letterSpacing: '.04em' }}>
              {EVENT_LABELS[activeType] || activeType}
            </h2>
          </div>

          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
            {typeGals.map((g, i) => {
              const cover = covers.get(g.id)
              const pickCount = topPicks.filter(p => p.gallery_id === g.id).length
              return (
                <div key={g.id} ref={reveal} data-delay={i * 100}
                  className="pf-panel"
                  onClick={() => navigateTo('gallery', activeType, g.id)}
                  style={{
                    position: 'relative', marginBottom: 4,
                    height: 'clamp(300px, 50vw, 500px)',
                  }}>
                  {cover && <img src={cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                  <div className="pf-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }} />
                  <div style={{
                    position: 'absolute', bottom: 40, left: 40, right: 40,
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                  }}>
                    <div>
                      <h3 style={{ fontSize: 'clamp(20px, 3vw, 36px)', fontWeight: 400, margin: 0, letterSpacing: '.03em' }}>
                        {g.name}
                      </h3>
                      <div style={{ fontSize: 10, letterSpacing: '.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', marginTop: 8 }}>
                        {readStr(g.delivery_settings, 'eventLocation')}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)' }}>
                      {pickCount} Photos
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ GALLERY VIEW: Photo grid ═══ */}
      {view === 'gallery' && activeGal && (
        <div style={{ paddingTop: 120, paddingBottom: 80, animation: 'viewFadeIn .7s cubic-bezier(.16,1,.3,1) both' }}>
          <div style={{ textAlign: 'center', marginBottom: 60, padding: '0 24px' }}>
            <div style={{ fontSize: 10, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginBottom: 12 }}>
              {galPhotos.length} Highlights
            </div>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 44px)', fontWeight: 400, margin: 0, letterSpacing: '.04em' }}>
              {activeGal.name}
            </h2>
            {readStr(activeGal.delivery_settings, 'eventLocation') && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginTop: 10, letterSpacing: '.15em', textTransform: 'uppercase' }}>
                {readStr(activeGal.delivery_settings, 'eventLocation')}
              </div>
            )}
          </div>

          <div style={{
            maxWidth: 1200, margin: '0 auto', padding: '0 24px',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 350px), 1fr))',
            gap: 4,
          }}>
            {galPhotos.map((img, i) => (
              <div key={img.id} ref={reveal} data-delay={i * 60}
                className="pf-thumb" style={{ borderRadius: 0 }}>
                <img src={imgUrl(img.thumbnail_path || img.storage_path)} alt=""
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Footer ═══ */}
      <footer style={{
        padding: '60px 24px 32px', textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,.06)',
      }}>
        {(settings.phone || settings.email || settings.instagram) && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', marginBottom: 32 }}>
            {settings.phone && <a href={`tel:${settings.phone}`} style={linkStyle}>{settings.phone}</a>}
            {settings.email && <a href={`mailto:${settings.email}`} style={linkStyle}>{settings.email}</a>}
            {settings.instagram && <a href={`https://instagram.com/${settings.instagram}`} target="_blank" rel="noopener" style={linkStyle}>@{settings.instagram}</a>}
          </div>
        )}
        {settings.logoBase64 && <img src={settings.logoBase64} alt="" style={{ maxHeight: 28, opacity: .3, marginBottom: 16 }} />}
        <div style={{ fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.15)' }}>
          {studioName && <span>{studioName} · </span>}
          Powered by Pixflow
        </div>
      </footer>

      <style>{`
        @keyframes heroFadeIn { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: none } }
        @keyframes viewFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scrollBounce { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(6px) } }
        @keyframes tileFade { from { opacity: 0; transform: scale(1.08) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </div>
  )
}

const linkStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,.4)', fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase',
  textDecoration: 'none', transition: 'color .2s',
}
