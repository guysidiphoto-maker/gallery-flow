import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, storageUrl } from '../supabase'
import { TenderBuilder } from '../components/TenderBuilder'
import { SocialManager } from '../components/SocialManager'

// ─── Types ─────────────────────────────────────────────────────────────────

interface GalleryRow {
  id: string; name: string; client_name: string | null; image_count: number
  published_at: string | null; delivery_settings: Record<string, unknown> | null
}
interface ImageRow {
  id: string; gallery_id: string; filename: string
  storage_path: string; thumbnail_path: string | null; is_top_pick: boolean
}
interface StoryRow { id: string; gallery_id: string; style: string; storage_path: string }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function readStr(obj: Record<string, unknown> | null, key: string): string {
  if (!obj) return ''; const v = obj[key]; return typeof v === 'string' ? v : ''
}

// ─── Scroll Reveal ─────────────────────────────────────────────────────────

function useReveal() {
  const obs = useRef<IntersectionObserver | null>(null)
  return useCallback((el: HTMLElement | null) => {
    if (!el) return
    if (!obs.current) {
      obs.current = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).style.opacity = '1';
            (e.target as HTMLElement).style.transform = 'translateY(0)'
            obs.current?.unobserve(e.target)
          }
        })
      }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' })
    }
    el.style.opacity = '0'; el.style.transform = 'translateY(20px)'
    el.style.transition = 'opacity .5s ease, transform .5s ease'
    obs.current.observe(el)
  }, [])
}

// ─── Download Helper ───────────────────────────────────────────────────────

async function downloadImage(url: string, filename: string) {
  const res = await fetch(url)
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Story Player ──────────────────────────────────────────────────────────

function StoryPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,.92)', backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <video src={url} autoPlay controls playsInline onClick={e => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,.6)' }} />
      <button onClick={onClose} style={{
        position: 'absolute', top: 20, right: 20, width: 40, height: 40, borderRadius: '50%',
        background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>×</button>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export function ClientDashboard() {
  // Parse URL
  const { clientId, slug } = (() => {
    const path = window.location.pathname.replace(/\/dashboard\/?$/, '').replace(/\/$/, '')
    const slugMatch = path.match(/^\/([^/]+)\/client\/([^/]+)$/)
    if (slugMatch) return { slug: slugMatch[1], clientId: slugMatch[2] }
    const directMatch = path.match(/^\/client\/([^/]+)$/)
    if (directMatch) return { slug: '', clientId: directMatch[1] }
    return { slug: '', clientId: '' }
  })()

  // Auth state
  const [authenticated, setAuthenticated] = useState(() => {
    return sessionStorage.getItem(`client-dash-${clientId}`) === 'true'
  })
  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState(false)
  const [clientCode, setClientCode] = useState('')

  // State
  const [galleries, setGalleries] = useState<GalleryRow[]>([])
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
  const [topPicks, setTopPicks] = useState<ImageRow[]>([])
  const [allImages, setAllImages] = useState<ImageRow[]>([])
  const [stories, setStories] = useState<Map<string, StoryRow[]>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'content' | 'calendar' | 'galleries' | 'stories' | 'page' | 'tender'>('content')
  const [selectedPicks, setSelectedPicks] = useState<Set<string>>(new Set())
  const [playingStory, setPlayingStory] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const reveal = useReveal()

  // ── Load data ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!clientId) { setError('No client ID'); setLoading(false); return }
    load()
    async function load() {
      const { data, error: e } = await supabase
        .from('galleries')
        .select('id, name, client_name, image_count, published_at, delivery_settings')
        .eq('client_id', clientId).eq('status', 'live')
        .order('published_at', { ascending: false })
      if (e || !data?.length) { setError(e ? 'Could not load' : 'No galleries found'); setLoading(false); return }
      setGalleries(data)
      // Extract client code from first gallery's settings
      const s = (data[0].delivery_settings || {}) as Record<string, unknown>
      if (typeof s.clientCode === 'string' && s.clientCode) setClientCode(s.clientCode)
      const ids = data.map(g => g.id)

      const [coverRes, picksRes, allRes, storiesRes] = await Promise.all([
        Promise.all(data.map(async g => {
          const { data: img } = await supabase.from('images').select('thumbnail_path, storage_path')
            .eq('gallery_id', g.id).order('sort_order', { ascending: true }).limit(1).maybeSingle()
          return { id: g.id, url: img ? storageUrl('gallery-images', img.thumbnail_path || img.storage_path) : null }
        })),
        supabase.from('images').select('id, gallery_id, filename, storage_path, thumbnail_path, is_top_pick')
          .in('gallery_id', ids).eq('is_top_pick', true).order('sort_order', { ascending: true }).limit(120),
        supabase.from('images').select('id, gallery_id, filename, storage_path, thumbnail_path, is_top_pick')
          .in('gallery_id', ids).order('sort_order', { ascending: true }),
        supabase.from('stories').select('id, gallery_id, style, storage_path').in('gallery_id', ids),
      ])

      const cm = new Map<string, string>()
      coverRes.forEach(c => { if (c.url) cm.set(c.id, c.url) })
      setCovers(cm)
      if (picksRes.data) setTopPicks(picksRes.data)
      if (allRes.data) setAllImages(allRes.data)

      // Initialize selected picks with photographer's top picks
      if (picksRes.data) setSelectedPicks(new Set(picksRes.data.map(p => p.id)))

      if (storiesRes.data?.length) {
        const sm = new Map<string, StoryRow[]>()
        await Promise.all(storiesRes.data.map(async s => {
          try {
            const r = await fetch(storageUrl('gallery-stories', s.storage_path), { method: 'HEAD' })
            if (r.ok) { const arr = sm.get(s.gallery_id) || []; arr.push(s); sm.set(s.gallery_id, arr) }
          } catch {}
        }))
        setStories(sm)
      }
      setLoading(false)
    }
  }, [clientId])

  // ── Helpers ────────────────────────────────────────────────────────────

  if (loading) return <div className="center-msg"><div className="loader" /></div>
  if (error) return <div className="center-msg"><p>{error}</p></div>

  // ── Code gate ──────────────────────────────────────────────────────────
  if (!authenticated && clientCode) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0a0f', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 360, padding: '0 24px' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, margin: '0 auto 20px',
            background: 'linear-gradient(135deg, rgba(99,102,241,.15), rgba(139,92,246,.1))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Client Dashboard</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', margin: '0 0 28px' }}>
            Enter your client code to access your content
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={codeInput}
              onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeError(false) }}
              placeholder="CODE"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && codeInput === clientCode) {
                  setAuthenticated(true)
                  sessionStorage.setItem(`client-dash-${clientId}`, 'true')
                } else if (e.key === 'Enter') {
                  setCodeError(true)
                }
              }}
              style={{
                flex: 1, padding: '12px 16px', fontSize: 15, fontFamily: 'inherit',
                color: '#fff', background: 'rgba(255,255,255,.05)',
                border: codeError ? '1px solid #ef4444' : '1px solid rgba(255,255,255,.12)',
                borderRadius: 10, outline: 'none', letterSpacing: '0.12em',
                textAlign: 'center', transition: 'border-color .2s',
              }}
            />
            <button
              onClick={() => {
                if (codeInput === clientCode) {
                  setAuthenticated(true)
                  sessionStorage.setItem(`client-dash-${clientId}`, 'true')
                } else {
                  setCodeError(true)
                }
              }}
              style={{
                padding: '12px 24px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(99,102,241,.3)',
              }}
            >
              Enter
            </button>
          </div>
          {codeError && (
            <p style={{ fontSize: 12, color: '#ef4444', marginTop: 10 }}>Invalid code</p>
          )}
          <a
            href={slug ? `/${slug}/client/${clientId}` : `/client/${clientId}`}
            style={{ display: 'inline-block', marginTop: 24, fontSize: 12, color: 'rgba(255,255,255,.3)', textDecoration: 'none' }}
          >
            View public page instead
          </a>
        </div>
      </div>
    )
  }

  const first = galleries[0]
  const settings = (first.delivery_settings || {}) as Record<string, unknown>
  const studioName = readStr(settings, 'studioName')
  const clientName = first.client_name || readStr(settings, 'clientName') || 'Dashboard'
  const galleryUrl = (id: string) => slug ? `/${slug}/gallery/${id}` : `/gallery/${id}`
  const hasStories = stories.size > 0

  const togglePick = (id: string) => {
    setSelectedPicks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectedImages = allImages.filter(img => selectedPicks.has(img.id))

  const tabs = [
    { id: 'content' as const, label: 'Content Studio', icon: '◈' },
    { id: 'calendar' as const, label: 'Content Calendar', icon: '◫' },
    { id: 'galleries' as const, label: 'Galleries', icon: '▦' },
    ...(hasStories ? [{ id: 'stories' as const, label: 'Stories', icon: '◉' }] : []),
    { id: 'page' as const, label: 'My Page', icon: '◧' },
    { id: 'tender' as const, label: 'חיפוש למכרז', icon: '◆' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{
        borderBottom: '1px solid rgba(255,255,255,.06)',
        padding: '20px 24px',
        background: 'rgba(10,10,15,.95)', backdropFilter: 'blur(16px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {studioName && (
              <div style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginBottom: 2 }}>
                {studioName}
              </div>
            )}
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>{clientName}</h1>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
                  background: tab === t.id ? 'rgba(99,102,241,.15)' : 'transparent',
                  color: tab === t.id ? '#818cf8' : 'rgba(255,255,255,.4)',
                  transition: 'all .2s',
                }}
              >
                <span style={{ marginRight: 6, fontSize: 14 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 96px' }}>

        {/* ── Content Studio Tab ──────────────────────────────────────── */}
        {tab === 'content' && (
          <div>
            {/* Stats bar */}
            <div ref={reveal} style={{
              display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap',
            }}>
              {[
                { label: 'Selected Photos', value: selectedPicks.size, accent: true },
                { label: 'Total Top Picks', value: topPicks.length },
                { label: 'Galleries', value: galleries.length },
                { label: 'Stories', value: Array.from(stories.values()).flat().length },
              ].map((stat, i) => (
                <div key={i} style={{
                  flex: '1 1 120px', padding: '16px 20px',
                  background: stat.accent ? 'linear-gradient(135deg, rgba(99,102,241,.12), rgba(139,92,246,.08))' : 'rgba(255,255,255,.02)',
                  border: `1px solid ${stat.accent ? 'rgba(99,102,241,.2)' : 'rgba(255,255,255,.06)'}`,
                  borderRadius: 12,
                }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: stat.accent ? '#818cf8' : '#fff', marginBottom: 4 }}>{stat.value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Section: Instagram Posts */}
            <div ref={reveal} style={{ marginBottom: 40 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.01em' }}>Instagram Posts</h2>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', margin: 0 }}>
                    Click to select/deselect · Download ready-to-post images
                  </p>
                </div>
                {selectedPicks.size > 0 && (
                  <button
                    onClick={async () => {
                      setDownloading('all')
                      for (const img of selectedImages.slice(0, 20)) {
                        const url = storageUrl('gallery-images', img.storage_path)
                        await downloadImage(url, `post_${img.filename}`)
                        await new Promise(r => setTimeout(r, 300))
                      }
                      setDownloading(null)
                    }}
                    style={{
                      padding: '10px 24px', borderRadius: 10,
                      background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                      border: 'none', color: '#fff', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                      boxShadow: '0 4px 16px rgba(99,102,241,.3)',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {downloading === 'all' ? 'Downloading...' : `Download ${selectedPicks.size} photos`}
                  </button>
                )}
              </div>

              {/* Instagram grid */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3,
                borderRadius: 8, overflow: 'hidden',
              }}>
                {allImages.filter(img => img.is_top_pick || selectedPicks.has(img.id)).slice(0, 60).map(img => {
                  const selected = selectedPicks.has(img.id)
                  const gallery = galleries.find(g => g.id === img.gallery_id)
                  return (
                    <div
                      key={img.id}
                      onClick={() => togglePick(img.id)}
                      style={{
                        aspectRatio: '1', overflow: 'hidden', position: 'relative',
                        cursor: 'pointer', background: 'rgba(255,255,255,.02)',
                      }}
                    >
                      <img
                        src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
                        alt="" loading="lazy"
                        style={{
                          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                          opacity: selected ? 1 : 0.4,
                          transition: 'opacity .2s, transform .3s',
                        }}
                      />
                      {/* Selection indicator */}
                      <div style={{
                        position: 'absolute', top: 8, right: 8,
                        width: 24, height: 24, borderRadius: '50%',
                        background: selected ? 'linear-gradient(135deg, #6366f1, #818cf8)' : 'rgba(0,0,0,.4)',
                        border: selected ? 'none' : '2px solid rgba(255,255,255,.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .15s',
                      }}>
                        {selected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      {/* Gallery label */}
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,.7), transparent)',
                        padding: '20px 10px 8px', fontSize: 10, color: 'rgba(255,255,255,.7)',
                      }}>
                        {gallery?.name}
                      </div>
                      {/* Individual download */}
                      {selected && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            setDownloading(img.id)
                            await downloadImage(storageUrl('gallery-images', img.storage_path), `post_${img.filename}`)
                            setDownloading(null)
                          }}
                          style={{
                            position: 'absolute', bottom: 8, right: 8,
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'rgba(0,0,0,.6)', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backdropFilter: 'blur(4px)',
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Browse more from galleries */}
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
                  Browse galleries to add more
                </h3>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                  {galleries.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setTab('galleries')}
                      style={{
                        flexShrink: 0, padding: '8px 16px', borderRadius: 8,
                        background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
                        color: 'rgba(255,255,255,.6)', fontSize: 12, fontFamily: 'inherit',
                        cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap',
                      }}
                    >
                      {g.name} · {g.image_count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section: Story Reels */}
            {hasStories && (
              <div ref={reveal} style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.01em' }}>Story Reels</h2>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', margin: '0 0 16px' }}>
                  Download and share on Instagram Stories
                </p>
                <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
                  {galleries.filter(g => stories.has(g.id)).map(g => {
                    const cover = covers.get(g.id)
                    const galleryStories = stories.get(g.id) || []
                    return (
                      <div key={g.id} style={{ flexShrink: 0, width: 140 }}>
                        {/* Phone-shaped preview */}
                        <div
                          onClick={() => setPlayingStory(storageUrl('gallery-stories', galleryStories[0].storage_path))}
                          style={{
                            aspectRatio: '9 / 16', borderRadius: 16, overflow: 'hidden',
                            border: '2px solid rgba(255,255,255,.08)', cursor: 'pointer',
                            background: '#111', position: 'relative',
                            transition: 'border-color .2s, transform .2s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.4)'; e.currentTarget.style.transform = 'scale(1.03)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; e.currentTarget.style.transform = 'scale(1)' }}
                        >
                          {cover && <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />}
                          <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <div style={{
                              width: 40, height: 40, borderRadius: '50%',
                              background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" stroke="none">
                                <polygon points="5 3 19 12 5 21" />
                              </svg>
                            </div>
                          </div>
                        </div>
                        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,.7)' }}>{g.name}</div>
                        <button
                          onClick={async () => {
                            setDownloading(g.id)
                            const url = storageUrl('gallery-stories', galleryStories[0].storage_path)
                            await downloadImage(url, `story_${g.name.replace(/\s+/g, '_')}.mp4`)
                            setDownloading(null)
                          }}
                          style={{
                            marginTop: 6, width: '100%', padding: '6px 0',
                            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
                            borderRadius: 6, color: 'rgba(255,255,255,.5)', fontSize: 10,
                            fontFamily: 'inherit', cursor: 'pointer',
                          }}
                        >
                          {downloading === g.id ? 'Downloading...' : 'Download'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Content Calendar Tab ─────────────────────────────────── */}
        {tab === 'calendar' && (
          <SocialManager
            galleries={galleries}
            allImages={allImages}
            topPicks={topPicks}
            clientId={clientId}
            storageUrl={storageUrl}
          />
        )}

        {/* Legacy calendar code (replaced by SocialManager) */}
        {false && (() => {
          const selected = allImages.filter(img => selectedPicks.has(img.id))
          const weekCount = Math.max(4, Math.ceil(selected.length / 3))
          const weeks: Array<{ weekNum: number; posts: typeof selected; story: boolean }> = []
          const hasStoryContent = stories.size > 0
          for (let w = 0; w < weekCount && w < 12; w++) {
            const start = w * 3
            const posts = selected.slice(start, start + 3)
            if (posts.length === 0) break
            weeks.push({ weekNum: w + 1, posts, story: hasStoryContent && w < Array.from(stories.values()).flat().length })
          }
          const DAYS = ['Monday', 'Wednesday', 'Friday']

          return (
            <div>
              <div ref={reveal} style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>Content Calendar</h2>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', margin: 0 }}>
                  {selected.length} photos spread over {weeks.length} weeks · 3 posts per week
                </p>
              </div>

              {weeks.map((week, wi) => (
                <div key={wi} ref={reveal} style={{
                  marginBottom: 24, padding: 20,
                  background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
                  borderRadius: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'rgba(255,255,255,.7)' }}>
                      Week {week.weekNum}
                    </h3>
                    {week.story && (
                      <span style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 4,
                        background: 'rgba(236,72,153,.1)', color: '#ec4899', fontWeight: 600,
                      }}>
                        + Story
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${week.posts.length}, 1fr)`, gap: 12 }}>
                    {week.posts.map((img, pi) => {
                      const gallery = galleries.find(g => g.id === img.gallery_id)
                      return (
                        <div key={img.id}>
                          <div style={{
                            fontSize: 10, color: 'rgba(255,255,255,.3)', marginBottom: 6,
                            textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
                          }}>
                            {DAYS[pi] || 'Bonus'}
                          </div>
                          <div style={{
                            aspectRatio: '1', borderRadius: 8, overflow: 'hidden',
                            position: 'relative', border: '1px solid rgba(255,255,255,.06)',
                          }}>
                            <img
                              src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
                              alt="" loading="lazy"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                            <button
                              onClick={async () => {
                                setDownloading(img.id)
                                await downloadImage(storageUrl('gallery-images', img.storage_path), `week${week.weekNum}_${DAYS[pi]?.toLowerCase() || 'post'}_${img.filename}`)
                                setDownloading(null)
                              }}
                              style={{
                                position: 'absolute', bottom: 6, right: 6,
                                width: 26, height: 26, borderRadius: '50%',
                                background: 'rgba(0,0,0,.6)', border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                backdropFilter: 'blur(4px)', opacity: 0.7, transition: 'opacity .15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = '0.7' }}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                            </button>
                          </div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {gallery?.name}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Download all calendar content */}
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button
                  onClick={async () => {
                    setDownloading('calendar')
                    for (const week of weeks) {
                      for (let pi = 0; pi < week.posts.length; pi++) {
                        const img = week.posts[pi]
                        await downloadImage(
                          storageUrl('gallery-images', img.storage_path),
                          `week${week.weekNum}_${DAYS[pi]?.toLowerCase() || 'post'}_${img.filename}`
                        )
                        await new Promise(r => setTimeout(r, 200))
                      }
                    }
                    setDownloading(null)
                  }}
                  style={{
                    padding: '12px 32px', borderRadius: 10,
                    background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                    border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 4px 16px rgba(99,102,241,.3)',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {downloading === 'calendar' ? 'Downloading...' : 'Download All Calendar Content'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── Galleries Tab ───────────────────────────────────────────── */}
        {tab === 'galleries' && (
          <div>
            {galleries.map(g => {
              const galleryImages = allImages.filter(img => img.gallery_id === g.id)
              const d = g.published_at ? new Date(g.published_at) : null
              return (
                <div key={g.id} ref={reveal} style={{ marginBottom: 40 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>{g.name}</h3>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', margin: 0 }}>
                        {g.image_count} photos{d ? ` · ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : ''}
                      </p>
                    </div>
                    <a href={galleryUrl(g.id)} style={{
                      padding: '8px 16px', borderRadius: 8,
                      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
                      color: 'rgba(255,255,255,.6)', fontSize: 12, textDecoration: 'none',
                      fontFamily: 'inherit', transition: 'all .15s',
                    }}>
                      View Gallery
                    </a>
                  </div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 3,
                    borderRadius: 8, overflow: 'hidden',
                  }}>
                    {galleryImages.map(img => {
                      const selected = selectedPicks.has(img.id)
                      return (
                        <div
                          key={img.id}
                          onClick={() => togglePick(img.id)}
                          style={{
                            aspectRatio: '1', overflow: 'hidden', position: 'relative',
                            cursor: 'pointer',
                          }}
                        >
                          <img
                            src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
                            alt="" loading="lazy"
                            style={{
                              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                              opacity: selected ? 1 : 0.5,
                              transition: 'opacity .15s',
                            }}
                          />
                          {selected && (
                            <div style={{
                              position: 'absolute', top: 4, right: 4,
                              width: 18, height: 18, borderRadius: '50%',
                              background: '#6366f1',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                          {img.is_top_pick && !selected && (
                            <div style={{
                              position: 'absolute', top: 4, left: 4,
                              fontSize: 8, background: 'rgba(99,102,241,.7)', color: '#fff',
                              padding: '2px 5px', borderRadius: 3, fontWeight: 600,
                            }}>
                              TOP
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Stories Tab ──────────────────────────────────────────────── */}
        {tab === 'stories' && hasStories && (
          <div>
            <div ref={reveal} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20 }}>
              {galleries.filter(g => stories.has(g.id)).map(g => {
                const cover = covers.get(g.id)
                const galleryStories = stories.get(g.id) || []
                return (
                  <div key={g.id} style={{ textAlign: 'center' }}>
                    <div
                      onClick={() => setPlayingStory(storageUrl('gallery-stories', galleryStories[0].storage_path))}
                      style={{
                        aspectRatio: '9 / 16', borderRadius: 20, overflow: 'hidden',
                        border: '2px solid rgba(255,255,255,.08)', cursor: 'pointer',
                        background: '#111', position: 'relative',
                        transition: 'transform .2s, border-color .2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)' }}
                    >
                      {cover && <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />}
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: '50%',
                          background: 'rgba(255,255,255,.15)', backdropFilter: 'blur(8px)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21" /></svg>
                        </div>
                      </div>
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,.8), transparent)',
                        padding: '24px 12px 12px', textAlign: 'left',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{galleryStories.length} {galleryStories.length === 1 ? 'story' : 'stories'}</div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        setDownloading(g.id)
                        for (const s of galleryStories) {
                          await downloadImage(storageUrl('gallery-stories', s.storage_path), `story_${g.name.replace(/\s+/g, '_')}_${s.style}.mp4`)
                        }
                        setDownloading(null)
                      }}
                      style={{
                        marginTop: 10, padding: '8px 20px', borderRadius: 8,
                        background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)',
                        color: '#818cf8', fontSize: 12, fontWeight: 500,
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                      }}
                    >
                      {downloading === g.id ? 'Downloading...' : 'Download Stories'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── My Page Tab ─────────────────────────────────────────────── */}
        {tab === 'page' && (
          <div ref={reveal}>
            <div style={{
              padding: 24, background: 'rgba(255,255,255,.02)',
              border: '1px solid rgba(255,255,255,.06)', borderRadius: 16,
              textAlign: 'center',
            }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>Your Public Page</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', margin: '0 0 24px' }}>
                Share this link with your clients and on social media
              </p>

              {/* URL display */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                justifyContent: 'center',
              }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', fontFamily: 'ui-monospace, monospace' }}>
                  pixflow-ai.com/{slug}/client/{clientId}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://pixflow-ai.com/${slug}/client/${clientId}`)
                    setDownloading('url')
                    setTimeout(() => setDownloading(null), 1500)
                  }}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: downloading === 'url' ? '#10b981' : '#6366f1',
                    border: 'none', color: '#fff', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'background .2s',
                  }}
                >
                  {downloading === 'url' ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Preview */}
              <div style={{
                marginTop: 24, padding: '32px 24px',
                background: 'rgba(255,255,255,.02)', borderRadius: 12,
                border: '1px solid rgba(255,255,255,.05)',
              }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,.3)', marginBottom: 8 }}>Preview</div>
                <div style={{ fontSize: 28, fontWeight: 200, marginBottom: 8 }}>{clientName}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,.35)' }}>
                  {galleries.length} galleries · {selectedPicks.size} highlights
                  {hasStories ? ` · ${Array.from(stories.values()).flat().length} stories` : ''}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginTop: 16, maxWidth: 300, margin: '16px auto 0' }}>
                  {topPicks.slice(0, 5).map(img => (
                    <div key={img.id} style={{ flex: 1, aspectRatio: '1', borderRadius: 4, overflow: 'hidden' }}>
                      <img src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'tender' && (
          <TenderBuilder
            galleries={galleries}
            allImages={allImages}
            covers={covers}
            businessName={studioName || 'Studio'}
          />
        )}
      </div>

      {/* Story player */}
      {playingStory && <StoryPlayer url={playingStory} onClose={() => setPlayingStory(null)} />}
    </div>
  )
}
