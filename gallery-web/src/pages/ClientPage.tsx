import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, storageUrl } from '../supabase'

// ─── Types ─────────────────────────────────────────────────────────────────

interface GalleryRow {
  id: string
  name: string
  client_name: string | null
  image_count: number
  published_at: string | null
  delivery_settings: Record<string, unknown> | null
}

interface TopPickImage {
  id: string
  gallery_id: string
  filename: string
  storage_path: string
  thumbnail_path: string | null
}

interface StoryRow {
  id: string
  gallery_id: string
  style: string
  storage_path: string
}

function readString(obj: Record<string, unknown> | null, key: string): string {
  if (!obj) return ''
  const v = obj[key]
  return typeof v === 'string' ? v : ''
}

// ─── Scroll reveal hook ────────────────────────────────────────────────────

function useScrollReveal() {
  const observer = useRef<IntersectionObserver | null>(null)
  const refCallback = useCallback((el: HTMLElement | null) => {
    if (!el) return
    if (!observer.current) {
      observer.current = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const target = e.target as HTMLElement
            target.style.opacity = '1'
            target.style.transform = 'translateY(0)'
            observer.current?.unobserve(target)
          }
        })
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' })
    }
    el.style.opacity = '0'
    el.style.transform = 'translateY(24px)'
    el.style.transition = 'opacity .6s ease, transform .6s ease'
    observer.current.observe(el)
  }, [])
  return refCallback
}

// ─── Month names ───────────────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// ─── Story Player Modal ────────────────────────────────────────────────────

function StoryPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,.9)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn .2s ease',
      }}
    >
      <video
        src={url}
        autoPlay
        controls
        playsInline
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw', maxHeight: '85vh',
          borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,.6)',
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 20, right: 20,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,.1)', border: 'none',
          color: '#fff', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ×
      </button>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export function ClientPage() {
  const { clientId, slug } = (() => {
    const path = window.location.pathname.replace(/\/$/, '')
    const slugMatch = path.match(/^\/([^/]+)\/client\/([^/]+)$/)
    if (slugMatch) return { clientId: slugMatch[2], slug: slugMatch[1] }
    const directMatch = path.match(/^\/client\/([^/]+)$/)
    if (directMatch) return { clientId: directMatch[1], slug: '' }
    return { clientId: '', slug: '' }
  })()

  const [galleries, setGalleries] = useState<GalleryRow[]>([])
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
  const [topPicks, setTopPicks] = useState<TopPickImage[]>([])
  const [stories, setStories] = useState<Map<string, StoryRow[]>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('galleries')
  const [feedLimit, setFeedLimit] = useState(30)
  const [playingStory, setPlayingStory] = useState<string | null>(null)

  const reveal = useScrollReveal()

  // ── Data loading ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!clientId) { setError('No client ID in URL'); setLoading(false); return }
    load()
    async function load() {
      const { data, error: qErr } = await supabase
        .from('galleries')
        .select('id, name, client_name, image_count, published_at, delivery_settings')
        .eq('client_id', clientId)
        .eq('status', 'live')
        .order('published_at', { ascending: false })

      if (qErr || !data || data.length === 0) {
        setError(qErr ? 'Could not load client page' : 'No galleries found')
        setLoading(false)
        return
      }
      setGalleries(data)
      const galleryIds = data.map(g => g.id)

      // Parallel: covers + top picks + stories
      const [coverResults, picksResult, storiesResult] = await Promise.all([
        // Covers
        Promise.all(data.map(async (g) => {
          const coverImageId = readString(g.delivery_settings as Record<string, unknown> | null, 'coverImageId')
          let img: { thumbnail_path: string | null; storage_path: string } | null = null
          if (coverImageId) {
            const { data: d } = await supabase.from('images').select('thumbnail_path, storage_path')
              .eq('gallery_id', g.id).eq('id', coverImageId).maybeSingle()
            if (d) img = d
          }
          if (!img) {
            const { data: d } = await supabase.from('images').select('thumbnail_path, storage_path')
              .eq('gallery_id', g.id).order('sort_order', { ascending: true }).limit(1).maybeSingle()
            if (d) img = d
          }
          return { galleryId: g.id, url: img ? storageUrl('gallery-images', img.thumbnail_path || img.storage_path) : null }
        })),
        // Top picks
        supabase.from('images')
          .select('id, gallery_id, filename, storage_path, thumbnail_path')
          .in('gallery_id', galleryIds)
          .eq('is_top_pick', true)
          .order('sort_order', { ascending: true })
          .limit(90),
        // Stories
        supabase.from('stories')
          .select('id, gallery_id, style, storage_path')
          .in('gallery_id', galleryIds),
      ])

      // Process covers
      const coverMap = new Map<string, string>()
      coverResults.forEach(c => { if (c.url) coverMap.set(c.galleryId, c.url) })
      setCovers(coverMap)

      // Process top picks
      if (picksResult.data) setTopPicks(picksResult.data)

      // Process stories — verify they exist
      if (storiesResult.data && storiesResult.data.length > 0) {
        const storyMap = new Map<string, StoryRow[]>()
        await Promise.all(storiesResult.data.map(async (s) => {
          const url = storageUrl('gallery-stories', s.storage_path)
          try {
            const res = await fetch(url, { method: 'HEAD' })
            if (res.ok) {
              const arr = storyMap.get(s.gallery_id) || []
              arr.push(s)
              storyMap.set(s.gallery_id, arr)
            }
          } catch { /* skip */ }
        }))
        setStories(storyMap)
      }

      setLoading(false)
    }
  }, [clientId])

  // ── Scroll spy for nav ─────────────────────────────────────────────────

  useEffect(() => {
    const ids = ['section-galleries', 'section-feed', 'section-stories']
    const elements = ids.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    if (elements.length === 0) return
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) {
        const id = visible[0].target.id.replace('section-', '')
        setActiveSection(id)
      }
    }, { rootMargin: '-80px 0px -50% 0px', threshold: 0 })
    elements.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [loading])

  // ── Loading / Error ────────────────────────────────────────────────────

  if (loading) return <div className="center-msg"><div className="loader" /></div>
  if (error) return <div className="center-msg"><p>{error}</p></div>

  // ── Resolve settings ───────────────────────────────────────────────────

  const first = galleries[0]
  const settings = (first.delivery_settings || {}) as Record<string, unknown>
  const studioName = readString(settings, 'studioName')
  const studioWebsite = readString(settings, 'studioWebsite')
  const clientName = first.client_name || readString(settings, 'clientName') || 'Your Galleries'
  const showFooterCredit = settings.showFooterCredit !== false

  // ── Group galleries by year + month ────────────────────────────────────

  const timeline = new Map<string, Map<number, GalleryRow[]>>()
  galleries.forEach(g => {
    const d = g.published_at ? new Date(g.published_at) : null
    const year = d ? String(d.getFullYear()) : 'Other'
    const month = d ? d.getMonth() : -1
    if (!timeline.has(year)) timeline.set(year, new Map())
    const yearMap = timeline.get(year)!
    if (!yearMap.has(month)) yearMap.set(month, [])
    yearMap.get(month)!.push(g)
  })
  const sortedYears = Array.from(timeline.keys()).sort((a, b) => (b === 'Other' ? -1 : Number(b)) - (a === 'Other' ? -1 : Number(a)))

  // ── Date range ─────────────────────────────────────────────────────────

  const dates = galleries.map(g => g.published_at).filter(Boolean).map(d => new Date(d!))
  const minYear = dates.length > 0 ? Math.min(...dates.map(d => d.getFullYear())) : null
  const maxYear = dates.length > 0 ? Math.max(...dates.map(d => d.getFullYear())) : null
  const dateRange = minYear && maxYear ? (minYear === maxYear ? String(minYear) : `${minYear} – ${maxYear}`) : ''

  // ── Stories with galleries ─────────────────────────────────────────────

  const galleriesWithStories = galleries.filter(g => stories.has(g.id))
  const hasStories = galleriesWithStories.length > 0
  const hasFeed = topPicks.length > 0

  // Nav items
  const navItems = [
    { id: 'galleries', label: 'Galleries' },
    ...(hasFeed ? [{ id: 'feed', label: 'Highlights' }] : []),
    ...(hasStories ? [{ id: 'stories', label: 'Stories' }] : []),
  ]

  const galleryUrl = (id: string) => slug ? `/${slug}/gallery/${id}` : `/gallery/${id}`

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* ── Sticky Nav ──────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(10,10,15,.85)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,.05)',
        padding: '0 24px',
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32,
          height: 52,
        }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => document.getElementById(`section-${item.id}`)?.scrollIntoView({ behavior: 'smooth' })}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: activeSection === item.id ? '#fff' : 'rgba(255,255,255,.4)',
                fontSize: 13, fontWeight: activeSection === item.id ? 600 : 400,
                fontFamily: 'inherit', padding: '14px 0',
                borderBottom: activeSection === item.id ? '2px solid #6366f1' : '2px solid transparent',
                transition: 'all .2s',
              }}
            >
              {item.label}
            </button>
          ))}
          {/* Client login button */}
          <a
            href={slug ? `/${slug}/client/${clientId}/dashboard` : `/client/${clientId}/dashboard`}
            style={{
              marginLeft: 16, padding: '6px 14px', borderRadius: 7,
              background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)',
              color: '#818cf8', fontSize: 11, fontWeight: 600,
              textDecoration: 'none', transition: 'all .2s', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,.2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,.1)' }}
          >
            Client Login
          </a>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section style={{
        height: '70vh', minHeight: 400,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {/* Subtle gradient glow */}
        <div style={{
          position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
          width: '120%', height: '80%',
          background: 'radial-gradient(ellipse at center, rgba(99,102,241,.06) 0%, transparent 60%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {studioName && (
            studioWebsite ? (
              <a
                href={studioWebsite.startsWith('http') ? studioWebsite : `https://${studioWebsite}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-block', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: 'rgba(255,255,255,.4)', marginBottom: 20, fontWeight: 500,
                  textDecoration: 'none', transition: 'color .2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,.7)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.4)' }}
              >
                {studioName}
              </a>
            ) : (
              <p style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', margin: '0 0 20px', fontWeight: 500 }}>
                {studioName}
              </p>
            )
          )}

          <h1 style={{
            fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 200, color: '#fff',
            margin: '0 0 16px', lineHeight: 1.05, letterSpacing: '-0.03em',
          }}>
            {clientName}
          </h1>

          {/* Animated gradient line */}
          <div style={{
            width: 60, height: 2, borderRadius: 1, margin: '0 auto 20px',
            background: 'linear-gradient(90deg, #6366f1, #818cf8, #a78bfa)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 3s ease infinite',
          }} />

          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.35)', margin: 0, fontWeight: 400 }}>
            {galleries.length} {galleries.length === 1 ? 'gallery' : 'galleries'}
            {dateRange ? ` · ${dateRange}` : ''}
          </p>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          animation: 'float 2s ease-in-out infinite',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </section>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 96px' }}>

        {/* ── Galleries Timeline ───────────────────────────────────────── */}
        <section id="section-galleries" style={{ paddingTop: 32 }}>
          {sortedYears.map(year => {
            const yearMap = timeline.get(year)!
            const sortedMonths = Array.from(yearMap.keys()).sort((a, b) => b - a)
            return (
              <div key={year} ref={reveal}>
                {/* Year heading */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32,
                }}>
                  <h2 style={{
                    fontSize: 48, fontWeight: 200, color: 'rgba(255,255,255,.08)',
                    margin: 0, letterSpacing: '-0.02em', lineHeight: 1,
                  }}>
                    {year}
                  </h2>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.04)' }} />
                </div>

                {sortedMonths.map(month => {
                  const monthGalleries = yearMap.get(month)!
                  return (
                    <div key={month} style={{ marginBottom: 40 }}>
                      {month >= 0 && (
                        <h3 style={{
                          fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,.4)',
                          margin: '0 0 16px', letterSpacing: '0.02em',
                        }}>
                          {MONTHS[month]}
                        </h3>
                      )}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: 20,
                      }}>
                        {monthGalleries.map(g => {
                          const cover = covers.get(g.id)
                          const d = g.published_at ? new Date(g.published_at) : null
                          return (
                            <a
                              key={g.id}
                              href={galleryUrl(g.id)}
                              ref={reveal}
                              style={{
                                display: 'block', textDecoration: 'none', color: 'inherit',
                                background: 'rgba(255,255,255,.02)',
                                border: '1px solid rgba(255,255,255,.06)',
                                borderRadius: 12, overflow: 'hidden',
                                transition: 'transform .3s, border-color .3s, box-shadow .3s',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-4px)'
                                e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)'
                                e.currentTarget.style.boxShadow = '0 12px 40px rgba(99,102,241,.1)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.transform = 'translateY(0)'
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,.06)'
                                e.currentTarget.style.boxShadow = 'none'
                              }}
                            >
                              <div style={{ aspectRatio: '3 / 2', overflow: 'hidden', background: 'rgba(255,255,255,.02)' }}>
                                {cover ? (
                                  <img src={cover} alt="" loading="lazy" style={{
                                    width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                                    transition: 'transform .4s ease',
                                  }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)' }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                                  />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="1.5">
                                      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                              <div style={{ padding: '16px 18px' }}>
                                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{g.name}</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', display: 'flex', gap: 8 }}>
                                  <span>{g.image_count} photos</span>
                                  {d && <span>· {MONTHS[d.getMonth()]} {d.getDate()}</span>}
                                </div>
                              </div>
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </section>

        {/* ── Instagram Feed (Highlights) ──────────────────────────────── */}
        {hasFeed && (
          <section id="section-feed" style={{ paddingTop: 64 }} ref={reveal}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h2 style={{ fontSize: 28, fontWeight: 200, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
                Highlights
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,.3)', margin: 0 }}>
                {topPicks.length} curated {topPicks.length === 1 ? 'photo' : 'photos'}
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 3,
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              {topPicks.slice(0, feedLimit).map((img, i) => {
                const gallery = galleries.find(g => g.id === img.gallery_id)
                return (
                  <a
                    key={img.id}
                    href={galleryUrl(img.gallery_id)}
                    ref={i < 9 ? reveal : undefined}
                    style={{
                      display: 'block', aspectRatio: '1', overflow: 'hidden',
                      position: 'relative', background: 'rgba(255,255,255,.02)',
                    }}
                  >
                    <img
                      src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
                      alt="" loading="lazy"
                      style={{
                        width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                        transition: 'transform .3s, filter .3s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.filter = 'brightness(0.8)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'brightness(1)' }}
                    />
                    {/* Gallery name overlay on hover */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,.6) 0%, transparent 50%)',
                      display: 'flex', alignItems: 'flex-end', padding: 10,
                      opacity: 0, transition: 'opacity .2s',
                      pointerEvents: 'none',
                    }}
                      className="feed-overlay"
                    >
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,.85)', fontWeight: 500 }}>
                        {gallery?.name}
                      </span>
                    </div>
                  </a>
                )
              })}
            </div>

            {topPicks.length > feedLimit && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <button
                  onClick={() => setFeedLimit(prev => prev + 30)}
                  style={{
                    padding: '10px 32px', borderRadius: 50,
                    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                    color: 'rgba(255,255,255,.6)', fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
                >
                  Show more
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Stories ──────────────────────────────────────────────────── */}
        {hasStories && (
          <section id="section-stories" style={{ paddingTop: 64 }} ref={reveal}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h2 style={{ fontSize: 28, fontWeight: 200, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
                Stories
              </h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,.3)', margin: 0 }}>
                Event highlights
              </p>
            </div>

            <div style={{
              display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap',
              padding: '0 16px',
            }}>
              {galleriesWithStories.map(g => {
                const cover = covers.get(g.id)
                const galleryStories = stories.get(g.id) || []
                return (
                  <div key={g.id} style={{ textAlign: 'center', cursor: 'pointer' }}
                    onClick={() => {
                      if (galleryStories.length > 0) {
                        setPlayingStory(storageUrl('gallery-stories', galleryStories[0].storage_path))
                      }
                    }}
                  >
                    {/* Gradient ring */}
                    <div style={{
                      width: 80, height: 80, borderRadius: '50%',
                      padding: 3,
                      background: 'linear-gradient(135deg, #6366f1, #a78bfa, #ec4899)',
                      marginBottom: 8,
                      transition: 'transform .2s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                    >
                      <div style={{
                        width: '100%', height: '100%', borderRadius: '50%',
                        overflow: 'hidden', border: '2px solid #0a0a0f',
                        background: 'rgba(255,255,255,.05)',
                      }}>
                        {cover ? (
                          <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.5">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 11, color: 'rgba(255,255,255,.5)', fontWeight: 500,
                      maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {g.name}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer style={{
          textAlign: 'center', marginTop: 80, paddingTop: 32,
          borderTop: '1px solid rgba(255,255,255,.05)',
        }}>
          {studioName && (
            <div style={{ marginBottom: 8 }}>
              {studioWebsite ? (
                <a
                  href={studioWebsite.startsWith('http') ? studioWebsite : `https://${studioWebsite}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    color: 'rgba(255,255,255,.4)', textDecoration: 'none', fontSize: 13,
                    fontWeight: 500, transition: 'color .2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,.7)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.4)' }}
                >
                  {studioName}
                </a>
              ) : (
                <span style={{ color: 'rgba(255,255,255,.35)', fontSize: 13 }}>{studioName}</span>
              )}
            </div>
          )}
          {showFooterCredit && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.15)', margin: 0 }}>
              Powered by Pixflow
            </p>
          )}
        </footer>
      </div>

      {/* Story player modal */}
      {playingStory && <StoryPlayer url={playingStory} onClose={() => setPlayingStory(null)} />}

      {/* CSS animations */}
      <style>{`
        @keyframes shimmer {
          0%, 100% { background-position: 0% center; }
          50% { background-position: 100% center; }
        }
        @keyframes float {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(6px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .feed-overlay { pointer-events: none; }
        a:hover .feed-overlay { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
