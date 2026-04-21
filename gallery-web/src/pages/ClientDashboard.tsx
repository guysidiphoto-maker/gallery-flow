import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, storageUrl } from '../supabase'
import { TenderBuilder } from '../components/TenderBuilder'
import { SocialManager } from '../components/SocialManager'
import { PortfolioEditor, loadPortfolioSettings, getFontFamily } from '../components/PortfolioEditor'

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
      background: 'rgba(0,0,0,.92)', backdropFilter: 'blur(24px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <video src={url} autoPlay controls playsInline onClick={e => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.06)' }} />
      <button onClick={onClose} style={{
        position: 'absolute', top: 24, right: 24, width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(255,255,255,.08)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontSize: 18, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background .2s, transform .15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.15)'; e.currentTarget.style.transform = 'scale(1.05)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.08)'; e.currentTarget.style.transform = 'scale(1)' }}
      >&times;</button>
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
  // Filter & sort for galleries tab
  const [galleryFilter, setGalleryFilter] = useState('')
  const [gallerySortBy, setGallerySortBy] = useState<'date' | 'name' | 'top-picks'>('date')
  const [galleryViewMode, setGalleryViewMode] = useState<'grid' | 'masonry' | 'list'>('grid')
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

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 40, height: 40, border: '3px solid rgba(99,102,241,.15)',
          borderTopColor: '#818cf8', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,.35)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Loading your dashboard...</p>
      </div>
    </div>
  )
  if (error) return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        textAlign: 'center', padding: '48px 36px',
        background: 'rgba(255,255,255,.025)', borderRadius: 20,
        border: '1px solid rgba(255,255,255,.06)',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, margin: '0 auto 20px',
          background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,.6)', margin: 0, fontWeight: 500 }}>{error}</p>
      </div>
    </div>
  )

  // ── Code gate ──────────────────────────────────────────────────────────
  if (!authenticated && clientCode) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at 50% 30%, rgba(99,102,241,.08) 0%, #0a0a0f 70%)',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{
          textAlign: 'center', maxWidth: 400, padding: '48px 36px',
          background: 'rgba(255,255,255,.025)',
          border: '1px solid rgba(255,255,255,.06)',
          borderRadius: 24, backdropFilter: 'blur(20px)',
          boxShadow: '0 24px 64px rgba(0,0,0,.4)',
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, margin: '0 auto 24px',
            background: 'linear-gradient(135deg, rgba(99,102,241,.18), rgba(139,92,246,.12))',
            border: '1px solid rgba(99,102,241,.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.03em' }}>Client Dashboard</h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.4)', margin: '0 0 32px', lineHeight: 1.5 }}>
            Enter your client code to access your content
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
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
                flex: 1, padding: '13px 16px', fontSize: 15, fontFamily: 'inherit',
                color: '#fff', background: 'rgba(255,255,255,.05)',
                border: codeError ? '1.5px solid #ef4444' : '1.5px solid rgba(255,255,255,.1)',
                borderRadius: 12, outline: 'none', letterSpacing: '0.12em',
                textAlign: 'center', transition: 'border-color .25s, box-shadow .25s',
                boxShadow: codeError ? '0 0 0 3px rgba(239,68,68,.15)' : 'none',
              }}
              onFocus={e => { if (!codeError) { e.currentTarget.style.borderColor = 'rgba(99,102,241,.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,.12)' }}}
              onBlur={e => { if (!codeError) { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.boxShadow = 'none' }}}
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
                padding: '13px 28px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 4px 20px rgba(99,102,241,.35), inset 0 1px 0 rgba(255,255,255,.15)',
                transition: 'transform .15s, box-shadow .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(99,102,241,.45), inset 0 1px 0 rgba(255,255,255,.15)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,.35), inset 0 1px 0 rgba(255,255,255,.15)' }}
            >
              Enter
            </button>
          </div>
          {codeError && (
            <p style={{ fontSize: 12, color: '#ef4444', marginTop: 12, fontWeight: 500 }}>Invalid code</p>
          )}
          <a
            href={slug ? `/${slug}/client/${clientId}` : `/client/${clientId}`}
            style={{ display: 'inline-block', marginTop: 28, fontSize: 12, color: 'rgba(255,255,255,.3)', textDecoration: 'none', transition: 'color .2s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,.5)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.3)' }}
          >
            View public page instead
          </a>
        </div>
      </div>
    )
  }

  const first = galleries[0]
  const deliverySettings = (first.delivery_settings || {}) as Record<string, unknown>
  const studioName = readStr(deliverySettings, 'studioName')
  const clientName = first.client_name || readStr(deliverySettings, 'clientName') || 'Dashboard'
  const portfolioSettings = loadPortfolioSettings(clientId)
  const displayTitle = portfolioSettings.pageTitle || clientName
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
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0a0f 0%, #0d0d1a 40%, #0a0a0f 100%)',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{
        borderBottom: '1px solid rgba(255,255,255,.06)',
        padding: '0 24px',
        background: 'rgba(10,10,15,.85)', backdropFilter: 'blur(24px) saturate(180%)',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 24px rgba(0,0,0,.4)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Branding mark */}
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(99,102,241,.2), rgba(139,92,246,.15))',
              border: '1px solid rgba(99,102,241,.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8">
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
              </svg>
            </div>
            <div>
              {studioName && (
                <div style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginBottom: 1, fontWeight: 500 }}>
                  {studioName}
                </div>
              )}
              <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.025em', background: 'linear-gradient(135deg, #fff 60%, rgba(255,255,255,.7))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{displayTitle}</h1>
            </div>
          </div>
          {/* ── Tab Navigation (pill bar) ────────────────── */}
          <nav style={{
            display: 'flex', gap: 2,
            background: 'rgba(255,255,255,.04)',
            borderRadius: 12, padding: 3,
            border: '1px solid rgba(255,255,255,.06)',
          }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
                  background: tab === t.id ? 'rgba(99,102,241,.18)' : 'transparent',
                  color: tab === t.id ? '#a5b4fc' : 'rgba(255,255,255,.4)',
                  transition: 'all .25s cubic-bezier(.4,0,.2,1)',
                  boxShadow: tab === t.id ? '0 1px 8px rgba(99,102,241,.15), inset 0 1px 0 rgba(255,255,255,.05)' : 'none',
                  position: 'relative',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (tab !== t.id) { e.currentTarget.style.color = 'rgba(255,255,255,.65)'; e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}}
                onMouseLeave={e => { if (tab !== t.id) { e.currentTarget.style.color = 'rgba(255,255,255,.4)'; e.currentTarget.style.background = 'transparent' }}}
              >
                <span style={{ marginRight: 6, fontSize: 13, opacity: tab === t.id ? 1 : 0.6 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 96px' }}>

        {/* ── Content Studio Tab ──────────────────────────────────────── */}
        {tab === 'content' && (
          <div>
            {/* Stats bar */}
            <div ref={reveal} style={{
              display: 'flex', gap: 16, marginBottom: 40, flexWrap: 'wrap',
            }}>
              {[
                { label: 'Selected Photos', value: selectedPicks.size, accent: true },
                { label: 'Total Top Picks', value: topPicks.length },
                { label: 'Galleries', value: galleries.length },
                { label: 'Stories', value: Array.from(stories.values()).flat().length },
              ].map((stat, i) => (
                <div key={i} style={{
                  flex: '1 1 140px', padding: '20px 24px',
                  background: stat.accent
                    ? 'linear-gradient(135deg, rgba(99,102,241,.12), rgba(139,92,246,.08))'
                    : 'rgba(255,255,255,.025)',
                  border: `1px solid ${stat.accent ? 'rgba(99,102,241,.2)' : 'rgba(255,255,255,.06)'}`,
                  borderRadius: 16,
                  backdropFilter: 'blur(12px)',
                  transition: 'transform .2s, border-color .2s',
                }}>
                  <div style={{
                    fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em',
                    color: stat.accent ? '#a5b4fc' : '#fff', marginBottom: 6,
                    background: stat.accent ? 'linear-gradient(135deg, #818cf8, #a78bfa)' : undefined,
                    WebkitBackgroundClip: stat.accent ? 'text' : undefined,
                    WebkitTextFillColor: stat.accent ? 'transparent' : undefined,
                  }}>{stat.value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Section: Instagram Posts */}
            <div ref={reveal} style={{ marginBottom: 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Instagram Posts</h2>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,.35)', margin: 0, lineHeight: 1.5 }}>
                    Click to select/deselect &middot; Download ready-to-post images
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
                      padding: '10px 24px', borderRadius: 12,
                      background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                      border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                      boxShadow: '0 4px 20px rgba(99,102,241,.35), inset 0 1px 0 rgba(255,255,255,.15)',
                      display: 'flex', alignItems: 'center', gap: 8,
                      transition: 'transform .15s, box-shadow .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(99,102,241,.45), inset 0 1px 0 rgba(255,255,255,.15)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,.35), inset 0 1px 0 rgba(255,255,255,.15)' }}
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
                borderRadius: 14, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,.06)',
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
              <div style={{ marginTop: 28, padding: '20px 24px', background: 'rgba(255,255,255,.02)', borderRadius: 16, border: '1px solid rgba(255,255,255,.05)' }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 14, letterSpacing: '-0.01em' }}>
                  Browse galleries to add more
                </h3>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {galleries.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setTab('galleries')}
                      style={{
                        flexShrink: 0, padding: '8px 18px', borderRadius: 10,
                        background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
                        color: 'rgba(255,255,255,.6)', fontSize: 12, fontFamily: 'inherit',
                        cursor: 'pointer', transition: 'all .2s', whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)'; e.currentTarget.style.color = '#a5b4fc'; e.currentTarget.style.background = 'rgba(99,102,241,.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; e.currentTarget.style.color = 'rgba(255,255,255,.6)'; e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
                    >
                      {g.name} &middot; {g.image_count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section: Story Reels */}
            {hasStories && (
              <div ref={reveal} style={{ marginBottom: 48 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Story Reels</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,.35)', margin: '0 0 20px', lineHeight: 1.5 }}>
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
                            marginTop: 8, width: '100%', padding: '7px 0',
                            background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.18)',
                            borderRadius: 8, color: '#a5b4fc', fontSize: 11, fontWeight: 500,
                            fontFamily: 'inherit', cursor: 'pointer', transition: 'all .2s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,.15)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,.08)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.18)' }}
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
            {/* Filter & Sort Toolbar */}
            <div style={{
              display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center',
            }}>
              {/* Search */}
              <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
                <input
                  value={galleryFilter} onChange={e => setGalleryFilter(e.target.value)}
                  placeholder="חפש גלריה..."
                  style={{
                    width: '100%', padding: '10px 40px 10px 14px', borderRadius: 12,
                    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
                    color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                    direction: 'rtl', transition: 'border-color .2s, box-shadow .2s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.4)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,.1)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>

              {/* Sort buttons */}
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,.03)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,.05)' }}>
                {([
                  { id: 'date' as const, label: 'תאריך' },
                  { id: 'name' as const, label: 'שם' },
                  { id: 'top-picks' as const, label: '★ מועדפים' },
                ] as const).map(s => (
                  <button key={s.id} onClick={() => setGallerySortBy(s.id)} style={{
                    padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: gallerySortBy === s.id ? 600 : 400, fontFamily: 'inherit',
                    background: gallerySortBy === s.id ? 'rgba(99,102,241,.2)' : 'transparent',
                    color: gallerySortBy === s.id ? '#a5b4fc' : 'rgba(255,255,255,.4)',
                    transition: 'all .15s',
                  }}>{s.label}</button>
                ))}
              </div>

              {/* View mode */}
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,.03)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,.05)' }}>
                {([
                  { id: 'grid' as const, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
                  { id: 'masonry' as const, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="10"/><rect x="14" y="3" width="7" height="6"/><rect x="3" y="16" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/></svg> },
                  { id: 'list' as const, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> },
                ] as const).map(v => (
                  <button key={v.id} onClick={() => setGalleryViewMode(v.id)} style={{
                    padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: galleryViewMode === v.id ? 'rgba(99,102,241,.2)' : 'transparent',
                    color: galleryViewMode === v.id ? '#a5b4fc' : 'rgba(255,255,255,.35)',
                    transition: 'all .15s', display: 'flex', alignItems: 'center',
                  }}>{v.icon}</button>
                ))}
              </div>
            </div>

            {/* Keyboard shortcut hint */}
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.2)', marginBottom: 20, direction: 'rtl' }}>
              💡 לחצו <kbd style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.1)', fontSize: 10, fontFamily: 'monospace' }}>T</kbd> על תמונה כדי לסמן כמועדף
            </p>

            {galleries
              .filter(g => !galleryFilter || g.name.toLowerCase().includes(galleryFilter.toLowerCase()) || (g.client_name || '').toLowerCase().includes(galleryFilter.toLowerCase()))
              .sort((a, b) => {
                if (gallerySortBy === 'name') return a.name.localeCompare(b.name)
                if (gallerySortBy === 'top-picks') {
                  const aTops = allImages.filter(img => img.gallery_id === a.id && img.is_top_pick).length
                  const bTops = allImages.filter(img => img.gallery_id === b.id && img.is_top_pick).length
                  return bTops - aTops
                }
                return (b.published_at || '').localeCompare(a.published_at || '')
              })
              .map(g => {
              const galleryImages = allImages.filter(img => img.gallery_id === g.id)
              const d = g.published_at ? new Date(g.published_at) : null
              return (
                <div key={g.id} ref={reveal} style={{
                  marginBottom: 40, padding: 24,
                  background: 'rgba(255,255,255,.02)', borderRadius: 20,
                  border: '1px solid rgba(255,255,255,.06)',
                  backdropFilter: 'blur(8px)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 5px', letterSpacing: '-0.02em' }}>{g.name}</h3>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', margin: 0 }}>
                        {g.image_count} photos{d ? ` \u00b7 ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : ''}
                      </p>
                    </div>
                    <a href={galleryUrl(g.id)} style={{
                      padding: '9px 20px', borderRadius: 10,
                      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
                      color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 500, textDecoration: 'none',
                      fontFamily: 'inherit', transition: 'all .2s',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                      onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)'; e.currentTarget.style.color = '#a5b4fc'; e.currentTarget.style.background = 'rgba(99,102,241,.08)' }}
                      onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = 'rgba(255,255,255,.6)'; e.currentTarget.style.background = 'rgba(255,255,255,.04)' }}
                    >
                      View Gallery
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </a>
                  </div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 3,
                    borderRadius: 12, overflow: 'hidden',
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
            <div ref={reveal} style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Stories</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,.35)', margin: 0, lineHeight: 1.5 }}>
                Preview and download your story reels
              </p>
            </div>
            <div ref={reveal} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 24 }}>
              {galleries.filter(g => stories.has(g.id)).map(g => {
                const cover = covers.get(g.id)
                const galleryStories = stories.get(g.id) || []
                return (
                  <div key={g.id} style={{ textAlign: 'center' }}>
                    <div
                      onClick={() => setPlayingStory(storageUrl('gallery-stories', galleryStories[0].storage_path))}
                      style={{
                        aspectRatio: '9 / 16', borderRadius: 22, overflow: 'hidden',
                        border: '2px solid rgba(255,255,255,.08)', cursor: 'pointer',
                        background: '#111', position: 'relative',
                        transition: 'transform .25s cubic-bezier(.4,0,.2,1), border-color .25s, box-shadow .25s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.35)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(99,102,241,.15)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; e.currentTarget.style.boxShadow = 'none' }}
                    >
                      {cover && <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />}
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: '50%',
                          background: 'rgba(255,255,255,.12)', backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(255,255,255,.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'transform .2s',
                        }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21" /></svg>
                        </div>
                      </div>
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,.85), transparent)',
                        padding: '28px 14px 14px', textAlign: 'left',
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>{g.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>{galleryStories.length} {galleryStories.length === 1 ? 'story' : 'stories'}</div>
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
                        marginTop: 12, padding: '9px 22px', borderRadius: 10,
                        background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)',
                        color: '#a5b4fc', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,.18)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.35)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,.1)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.2)' }}
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
          <PortfolioEditor
            clientId={clientId}
            clientName={clientName}
            studioName={studioName}
            galleries={galleries}
            covers={covers}
            publicUrl={`https://pixflow-ai.com/${slug}/client/${clientId}`}
          />
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
