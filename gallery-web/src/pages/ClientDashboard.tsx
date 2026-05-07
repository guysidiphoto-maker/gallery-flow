import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react'
import { supabase, storageUrl } from '../supabase'
// Heavy panels are only rendered when their tab is active. Lazy-loading
// them strips ~220KB (html2canvas + jsPDF in TenderBuilder, plus the rest
// of PortfolioEditor + SocialManager) from the initial bundle most clients
// land on. The settings utility (loadPortfolioSettings) lives in a
// dependency-free file so the eager import below stays light.
const TenderBuilder    = lazy(() => import('../components/TenderBuilder').then(m => ({ default: m.TenderBuilder })))
const SocialManager    = lazy(() => import('../components/SocialManager').then(m => ({ default: m.SocialManager })))
const PortfolioEditor  = lazy(() => import('../components/PortfolioEditor').then(m => ({ default: m.PortfolioEditor })))
const FeedStudio       = lazy(() => import('../components/FeedStudio').then(m => ({ default: m.FeedStudio })))
const CreativeEngineDialog = lazy(() => import('../components/CreativeEngineDialog').then(m => ({ default: m.CreativeEngineDialog })))
import { loadPortfolioSettings } from '../components/portfolioSettings'
import { Icon, type IconName } from '../components/Icon'

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

// ─── Editorial design tokens (Pic-Time aesthetic) ─────────────────────────
// Same palette + spacing system used throughout Dashboard.tsx so the
// public client view feels like the same product as the photographer admin.
const bg          = '#F2EFE9' // cream canvas
const bgSubtle    = '#FAF9F5' // section panels
const card        = '#FBFBF9' // raised surfaces
const border      = '#D0D0D0' // hairline 1px
const textPrimary = '#141413' // charcoal
const textSecondary = '#333333'
const textMuted   = '#767470'  // WCAG-AA accessible muted on cream
const statusLive  = '#7B8F6E' // sage status dot

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
// Story player stays dark on purpose — full-screen video lightbox feels
// most natural over a near-black scrim, not over cream.

function StoryPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,.92)', backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <video src={url} autoPlay controls playsInline onClick={e => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '85vh' }} />
      <button onClick={onClose} aria-label="Close" style={{
        position: 'absolute', top: 24, right: 24, width: 40, height: 40,
        background: 'transparent', border: '1px solid rgba(255,255,255,.4)',
        borderRadius: 2, color: '#fff', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="close" size={16} strokeWidth={1.85} />
      </button>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export function ClientDashboard() {
  // Parse URL — supports four shapes:
  //   /eclipse-media/c/pro-market                ← short, slug-based (NEW)
  //   /eclipse-media/client/<uuid>/dashboard     ← legacy UUID
  //   /eclipse-media/client/<uuid>               ← legacy without /dashboard
  //   /client/<uuid>                             ← root-level legacy
  const parsedUrl = (() => {
    const path = window.location.pathname.replace(/\/dashboard\/?$/, '').replace(/\/$/, '')
    // Short slug form: /<businessSlug>/c/<clientSlug>
    const shortMatch = path.match(/^\/([^/]+)\/c\/([^/]+)$/)
    if (shortMatch) return { slug: shortMatch[1], clientSlug: shortMatch[2], clientId: '' }
    // Legacy UUID forms (clientId is a UUID).
    const slugMatch = path.match(/^\/([^/]+)\/client\/([^/]+)$/)
    if (slugMatch) return { slug: slugMatch[1], clientSlug: '', clientId: slugMatch[2] }
    const directMatch = path.match(/^\/client\/([^/]+)$/)
    if (directMatch) return { slug: '', clientSlug: '', clientId: directMatch[1] }
    return { slug: '', clientSlug: '', clientId: '' }
  })()
  const slug = parsedUrl.slug

  // We need a UUID `clientId` for all existing queries. Resolve from the
  // slug-based URL via a one-time lookup; legacy UUID URLs already give us
  // the UUID directly. When a UUID URL is loaded, we look up the client's
  // slug in the background and rewrite the address bar to the short form
  // (replaceState — no navigation, no re-render) so the user copies a
  // shareable link.
  const [clientId, setClientId] = useState<string>(parsedUrl.clientId)
  const [resolveErr, setResolveErr] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (clientId) {
      // Legacy UUID URL — canonicalize to short form in the URL bar.
      ;(async () => {
        const { data: c } = await supabase
          .from('clients').select('slug, business_id').eq('id', clientId).maybeSingle()
        if (cancelled || !c?.slug) return
        const { data: b } = await supabase
          .from('businesses').select('slug').eq('id', c.business_id).maybeSingle()
        if (cancelled || !b?.slug) return
        const newUrl = `/${b.slug}/c/${c.slug}`
        if (window.location.pathname !== newUrl) {
          window.history.replaceState(null, '', newUrl + window.location.search + window.location.hash)
        }
      })()
      return () => { cancelled = true }
    }
    if (!parsedUrl.slug || !parsedUrl.clientSlug) return
    ;(async () => {
      const { data: biz } = await supabase
        .from('businesses').select('id').eq('slug', parsedUrl.slug).maybeSingle()
      if (cancelled) return
      if (!biz) { setResolveErr('Business not found'); return }
      const { data: c } = await supabase
        .from('clients').select('id')
        .eq('business_id', biz.id).eq('slug', parsedUrl.clientSlug).maybeSingle()
      if (cancelled) return
      if (!c) { setResolveErr('Client not found'); return }
      setClientId(c.id)
    })()
    return () => { cancelled = true }
  }, [parsedUrl.slug, parsedUrl.clientSlug, clientId])

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
  const [tab, setTab] = useState<'feed-studio' | 'content' | 'calendar' | 'galleries' | 'stories' | 'page' | 'tender'>('feed-studio')
  const [selectedPicks, setSelectedPicks] = useState<Set<string>>(() => {
    // Hydrate from sessionStorage so the user's selection survives refresh
    // within the same browser session. Real persistence (a
    // `client_post_selections` table) is Phase 3+ work.
    try {
      const raw = sessionStorage.getItem('selectedPicks-' + clientId)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'))
      }
    } catch { /* ignore */ }
    return new Set()
  })
  const [playingStory, setPlayingStory] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  // Filter & sort for galleries tab
  const [galleryFilter, setGalleryFilter] = useState('')
  const [gallerySortBy, setGallerySortBy] = useState<'date' | 'name' | 'top-picks'>('date')
  const [galleryViewMode, setGalleryViewMode] = useState<'grid' | 'masonry' | 'list'>('grid')
  const [creativeGallery, setCreativeGallery] = useState<{ id: string; name: string; topPicksCount: number } | null>(null)
  const reveal = useReveal()

  // Re-hydrate selectedPicks from sessionStorage when the active client
  // changes (initial state ran with possibly-stale clientId on the very
  // first render). Empty set if no key exists yet — the data loader will
  // seed from photographer top picks.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('selectedPicks-' + clientId)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) {
          setSelectedPicks(new Set(arr.filter((x): x is string => typeof x === 'string')))
          return
        }
      }
      setSelectedPicks(new Set())
    } catch {
      setSelectedPicks(new Set())
    }
  }, [clientId])

  // ── Load data ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!clientId) {
      // Slug-based URL but resolution hasn't finished or it failed.
      if (resolveErr) { setError(resolveErr); setLoading(false) }
      // Otherwise stay in loading state until clientId resolves.
      return
    }
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

      // PostgREST alias: the actual column is `web_preview_path`, but the
      // ImageRow type + every render call site refers to it as
      // `storage_path`. Keep the wire query honest while preserving the
      // existing type contract — same pattern used in Dashboard.tsx.
      const [coverRes, picksRes, allRes, storiesRes] = await Promise.all([
        Promise.all(data.map(async g => {
          const { data: img } = await supabase.from('images').select('thumbnail_path, storage_path:web_preview_path')
            .eq('gallery_id', g.id).order('sort_order', { ascending: true }).limit(1).maybeSingle()
          return { id: g.id, url: img ? storageUrl('gallery-images', img.thumbnail_path || img.storage_path) : null }
        })),
        supabase.from('images').select('id, gallery_id, filename, storage_path:web_preview_path, thumbnail_path, is_top_pick')
          .in('gallery_id', ids).eq('is_top_pick', true).order('sort_order', { ascending: true }).limit(120),
        supabase.from('images').select('id, gallery_id, filename, storage_path:web_preview_path, thumbnail_path, is_top_pick')
          .in('gallery_id', ids).order('sort_order', { ascending: true }),
        supabase.from('stories').select('id, gallery_id, style, storage_path').in('gallery_id', ids),
      ])

      const cm = new Map<string, string>()
      coverRes.forEach(c => { if (c.url) cm.set(c.id, c.url) })
      setCovers(cm)
      if (picksRes.data) setTopPicks(picksRes.data)
      if (allRes.data) setAllImages(allRes.data)

      // Initialize selected picks with photographer's top picks — but only
      // if the user doesn't already have a session-persisted selection.
      if (picksRes.data) {
        const existing = sessionStorage.getItem('selectedPicks-' + clientId)
        if (!existing) {
          const seeded = new Set(picksRes.data.map(p => p.id))
          setSelectedPicks(seeded)
          try {
            sessionStorage.setItem('selectedPicks-' + clientId, JSON.stringify(Array.from(seeded)))
          } catch { /* ignore quota */ }
        }
      }

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
  }, [clientId, resolveErr])

  // ── Helpers ────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{
      minHeight: '100vh', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'inherit', direction: 'rtl',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36, border: `2px solid ${border}`,
          borderTopColor: textPrimary, borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{
          fontSize: 11, color: textMuted, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>Loading</p>
      </div>
    </div>
  )
  if (error) return (
    <div style={{
      minHeight: '100vh', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'inherit', direction: 'rtl',
    }}>
      <div style={{
        textAlign: 'center', padding: '40px 36px',
        background: '#fff', border: `1px solid ${border}`,
        maxWidth: 420,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
          color: textMuted, textTransform: 'uppercase', marginBottom: 14,
        }}>Error</div>
        <p style={{ fontSize: 15, color: textPrimary, margin: 0, lineHeight: 1.5 }}>{error}</p>
      </div>
    </div>
  )

  // ── Code gate ──────────────────────────────────────────────────────────
  if (!authenticated && clientCode) {
    return (
      <div style={{
        minHeight: '100vh', background: bg, color: textPrimary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'inherit', direction: 'rtl',
      }}>
        <div style={{
          textAlign: 'center', maxWidth: 440, padding: '48px 40px',
          background: '#fff', border: `1px solid ${border}`,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
            color: textMuted, textTransform: 'uppercase', marginBottom: 18,
          }}>Client Dashboard</div>
          <h2 style={{
            fontSize: 26, fontWeight: 500, margin: '0 0 12px',
            letterSpacing: '-0.02em', color: textPrimary, lineHeight: 1.15,
          }}>הזינו קוד גישה</h2>
          <p style={{
            fontSize: 14, color: textSecondary, margin: '0 0 32px', lineHeight: 1.55,
          }}>
            הקוד נמצא במייל שקיבלת מהצלם
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
                flex: 1, padding: '12px 14px', fontSize: 15, fontFamily: 'inherit',
                color: textPrimary, background: '#fff',
                border: `1px solid ${codeError ? '#dc2626' : border}`,
                borderRadius: 2, outline: 'none', letterSpacing: '0.18em',
                textAlign: 'center', textTransform: 'uppercase',
                transition: 'border-color .15s',
              }}
              onFocus={e => { if (!codeError) e.currentTarget.style.borderColor = textPrimary }}
              onBlur={e => { if (!codeError) e.currentTarget.style.borderColor = border }}
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
                padding: '12px 24px', borderRadius: 2,
                background: textPrimary, border: `1px solid ${textPrimary}`,
                color: '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.18em', textTransform: 'uppercase',
              }}
            >Enter</button>
          </div>
          {codeError && (
            <p style={{ fontSize: 12, color: '#dc2626', marginTop: 12, fontWeight: 500 }}>
              קוד שגוי
            </p>
          )}
          <a
            href={slug ? `/${slug}/client/${clientId}` : `/client/${clientId}`}
            style={{
              display: 'inline-block', marginTop: 28,
              fontSize: 11, color: textMuted, textDecoration: 'none',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              transition: 'color .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = textPrimary }}
            onMouseLeave={e => { e.currentTarget.style.color = textMuted }}
          >View public page →</a>
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
      try {
        sessionStorage.setItem('selectedPicks-' + clientId, JSON.stringify(Array.from(next)))
      } catch { /* ignore quota */ }
      return next
    })
  }

  const selectedImages = allImages.filter(img => selectedPicks.has(img.id))

  const tabs: Array<{ id: typeof tab; label: string; icon: IconName }> = [
    // Feed Studio is the new flagship — appears first so it's the photographer's
    // first move when demoing piXflow's AI Visual OS to a paying client.
    { id: 'feed-studio', label: '✨ Feed Studio', icon: 'gallery' },
    { id: 'content', label: 'Content Studio', icon: 'gallery' },
    { id: 'calendar', label: 'Content Calendar', icon: 'calendar' },
    { id: 'galleries', label: 'Galleries', icon: 'sections' },
    ...(hasStories ? [{ id: 'stories' as const, label: 'Stories', icon: 'stories' as IconName }] : []),
    { id: 'page', label: 'My Page', icon: 'palette' },
    { id: 'tender', label: 'חיפוש למכרז', icon: 'search' },
  ]

  return (
    <div style={{
      minHeight: '100vh', background: bg, color: textPrimary,
      fontFamily: 'inherit', direction: 'rtl',
    }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{
        borderBottom: `1px solid ${border}`,
        padding: '0 24px',
        background: bg,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 72, gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            {studioName && (
              <div style={{
                fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                color: textMuted, textTransform: 'uppercase',
              }}>
                {studioName}
              </div>
            )}
            <h1 style={{
              fontSize: 18, fontWeight: 500, margin: 0,
              letterSpacing: '-0.015em', color: textPrimary,
            }}>{displayTitle}</h1>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: statusLive, display: 'inline-block',
            }} />
          </div>
          {/* ── Tab Navigation — tracked uppercase, hairline-divided ── */}
          <nav style={{
            display: 'flex', gap: 4,
            border: `1px solid ${border}`,
            background: '#fff',
          }}>
            {tabs.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '8px 14px', border: 'none', cursor: 'pointer',
                  borderInlineStart: i > 0 ? `1px solid ${border}` : 'none',
                  background: tab === t.id ? textPrimary : 'transparent',
                  color: tab === t.id ? '#fff' : textPrimary,
                  fontFamily: 'inherit',
                  fontSize: 10, fontWeight: 500,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  transition: 'background .15s, color .15s',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon name={t.icon} size={12} strokeWidth={1.6} />
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 96px' }}>

        {/* ── Feed Studio Tab — the AI Visual OS surface ──────────────── */}
        {tab === 'feed-studio' && (
          <Suspense fallback={<div style={{ padding: 96, color: textMuted, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', textAlign: 'center' }}>Loading Feed Studio…</div>}>
            <FeedStudio
              clientId={clientId}
              topPicks={topPicks}
              galleries={galleries}
            />
          </Suspense>
        )}

        {/* ── Content Studio Tab ──────────────────────────────────────── */}
        {tab === 'content' && (
          <div>
            {/* Stats bar — single hairline-bordered grid row */}
            <div ref={reveal} style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 0, marginBottom: 56,
              border: `1px solid ${border}`, background: bgSubtle,
            }}>
              {[
                { label: 'Selected', value: selectedPicks.size },
                { label: 'Top Picks', value: topPicks.length },
                { label: 'Galleries', value: galleries.length },
                { label: 'Stories', value: Array.from(stories.values()).flat().length },
              ].map((stat, i) => (
                <div key={i} style={{
                  padding: '24px 28px',
                  borderInlineStart: i > 0 ? `1px solid ${border}` : 'none',
                }}>
                  <div style={{
                    fontSize: 11, color: textMuted, fontWeight: 500,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    marginBottom: 14,
                  }}>{stat.label}</div>
                  <div style={{
                    fontSize: 28, fontWeight: 400, color: textPrimary,
                    letterSpacing: '-0.025em', lineHeight: 1,
                    fontFeatureSettings: '"tnum" 1, "lnum" 1',
                  }}>{stat.value.toLocaleString('he-IL')}</div>
                </div>
              ))}
            </div>

            {/* Section: Instagram Posts */}
            <div ref={reveal} style={{ marginBottom: 56 }}>
              <div style={{
                display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                marginBottom: 24, gap: 16, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{
                    fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                    color: textMuted, textTransform: 'uppercase', marginBottom: 10,
                  }}>For Instagram</div>
                  <h2 style={{
                    fontSize: 26, fontWeight: 500, margin: '0 0 6px',
                    letterSpacing: '-0.02em', color: textPrimary,
                  }}>Posts</h2>
                  <p style={{ fontSize: 13, color: textSecondary, margin: 0, lineHeight: 1.5 }}>
                    Click to select / deselect · Download ready-to-post images
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
                      padding: '11px 22px', borderRadius: 2,
                      background: textPrimary, border: `1px solid ${textPrimary}`,
                      color: '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                      fontFamily: 'inherit',
                      letterSpacing: '0.18em', textTransform: 'uppercase',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <Icon name="download" size={13} strokeWidth={1.85} />
                    {downloading === 'all' ? 'Downloading…' : `Download ${selectedPicks.size}`}
                  </button>
                )}
              </div>

              {/* Instagram grid — Pixieset-tight packing, no card wrappers */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
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
                        cursor: 'pointer', background: bgSubtle,
                        outline: selected ? `2px solid ${textPrimary}` : 'none',
                        outlineOffset: selected ? -2 : 0,
                      }}
                    >
                      <img
                        src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
                        alt="" loading="lazy"
                        style={{
                          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                          opacity: selected ? 1 : 0.45,
                          transition: 'opacity .15s',
                        }}
                      />
                      {/* Selection chip — circular cream/charcoal */}
                      <div style={{
                        position: 'absolute', top: 8, insetInlineEnd: 8,
                        width: 22, height: 22, borderRadius: '50%',
                        background: selected ? textPrimary : 'rgba(255,255,255,.85)',
                        border: `1.5px solid ${selected ? textPrimary : 'rgba(255,255,255,.95)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background .15s',
                        color: '#fff',
                      }}>
                        {selected && <Icon name="check" size={11} strokeWidth={3} />}
                      </div>
                      {/* Gallery label — bottom strip */}
                      {gallery && (
                        <div style={{
                          position: 'absolute', bottom: 0, insetInline: 0,
                          background: 'linear-gradient(to top, rgba(20,20,19,.7), transparent)',
                          padding: '20px 10px 8px',
                          fontSize: 10, fontWeight: 500, color: '#fff',
                          letterSpacing: '0.04em',
                        }}>
                          {gallery.name}
                        </div>
                      )}
                      {/* Per-tile download — only when selected, on hover */}
                      {selected && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            setDownloading(img.id)
                            await downloadImage(storageUrl('gallery-images', img.storage_path), `post_${img.filename}`)
                            setDownloading(null)
                          }}
                          aria-label="Download"
                          style={{
                            position: 'absolute', bottom: 8, insetInlineStart: 8,
                            width: 26, height: 26, borderRadius: '50%',
                            background: 'rgba(255,255,255,.9)', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: textPrimary, padding: 0,
                          }}
                        >
                          <Icon name="download" size={12} strokeWidth={1.85} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Browse more from galleries — quiet horizontal chip row */}
              <div style={{
                marginTop: 28, padding: '20px 22px',
                background: bgSubtle, border: `1px solid ${border}`,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                  color: textMuted, textTransform: 'uppercase', marginBottom: 14,
                }}>Browse more</div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {galleries.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setTab('galleries')}
                      style={{
                        flexShrink: 0, padding: '8px 16px', borderRadius: 2,
                        background: '#fff', border: `1px solid ${border}`,
                        color: textPrimary, fontSize: 11, fontFamily: 'inherit',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        letterSpacing: '0.04em', fontWeight: 500,
                        transition: 'border-color .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = textPrimary }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = border }}
                    >
                      {g.name} · {g.image_count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section: Story Reels */}
            {hasStories && (
              <div ref={reveal} style={{ marginBottom: 56 }}>
                <div style={{
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                  color: textMuted, textTransform: 'uppercase', marginBottom: 10,
                }}>For Stories</div>
                <h2 style={{
                  fontSize: 26, fontWeight: 500, margin: '0 0 6px',
                  letterSpacing: '-0.02em', color: textPrimary,
                }}>Story Reels</h2>
                <p style={{ fontSize: 13, color: textSecondary, margin: '0 0 24px', lineHeight: 1.5 }}>
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
                            aspectRatio: '9 / 16', overflow: 'hidden',
                            border: `1px solid ${border}`, cursor: 'pointer',
                            background: bgSubtle, position: 'relative',
                            transition: 'border-color .15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = textPrimary }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = border }}
                        >
                          {cover && <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />}
                          <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: '50%',
                              background: 'rgba(255,255,255,.92)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: textPrimary,
                            }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <polygon points="5 3 19 12 5 21" />
                              </svg>
                            </div>
                          </div>
                        </div>
                        <div style={{
                          marginTop: 10, fontSize: 12, fontWeight: 500, color: textPrimary,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{g.name}</div>
                        <button
                          onClick={async () => {
                            setDownloading(g.id)
                            const url = storageUrl('gallery-stories', galleryStories[0].storage_path)
                            await downloadImage(url, `story_${g.name.replace(/\s+/g, '_')}.mp4`)
                            setDownloading(null)
                          }}
                          style={{
                            marginTop: 8, width: '100%', padding: '8px 0',
                            background: 'transparent', border: `1px solid ${border}`,
                            borderRadius: 2, color: textPrimary,
                            fontSize: 10, fontWeight: 500,
                            letterSpacing: '0.18em', textTransform: 'uppercase',
                            fontFamily: 'inherit', cursor: 'pointer',
                            transition: 'border-color .15s, background .15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = textPrimary; e.currentTarget.style.background = textPrimary; e.currentTarget.style.color = '#fff' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textPrimary }}
                        >
                          {downloading === g.id ? 'Downloading…' : 'Download'}
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
          <Suspense fallback={<div style={{ padding: 40, color: textMuted, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading…</div>}>
            <SocialManager
              galleries={galleries}
              allImages={allImages}
              topPicks={topPicks}
              clientId={clientId}
              storageUrl={storageUrl}
            />
          </Suspense>
        )}

        {/* ── Galleries Tab ───────────────────────────────────────────── */}
        {tab === 'galleries' && (
          <div>
            {/* Filter & Sort Toolbar — hairline panels, no glass blur */}
            <div style={{
              display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center',
            }}>
              {/* Search */}
              <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
                <span style={{
                  position: 'absolute', insetInlineStart: 14, top: '50%',
                  transform: 'translateY(-50%)', pointerEvents: 'none',
                  color: textMuted, display: 'flex',
                }}>
                  <Icon name="search" size={13} strokeWidth={1.85} />
                </span>
                <input
                  value={galleryFilter} onChange={e => setGalleryFilter(e.target.value)}
                  placeholder="חפש גלריה…"
                  style={{
                    width: '100%', padding: '10px 14px 10px 38px',
                    background: '#fff', border: `1px solid ${border}`, borderRadius: 2,
                    color: textPrimary, fontSize: 13, fontFamily: 'inherit', outline: 'none',
                    transition: 'border-color .15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = textPrimary }}
                  onBlur={e => { e.currentTarget.style.borderColor = border }}
                />
              </div>

              {/* Sort */}
              <div style={{ display: 'flex', border: `1px solid ${border}`, background: '#fff' }}>
                {([
                  { id: 'date' as const, label: 'תאריך' },
                  { id: 'name' as const, label: 'שם' },
                  { id: 'top-picks' as const, label: 'מועדפים' },
                ] as const).map((s, i) => (
                  <button key={s.id} onClick={() => setGallerySortBy(s.id)} style={{
                    padding: '8px 14px', border: 'none', cursor: 'pointer',
                    borderInlineStart: i > 0 ? `1px solid ${border}` : 'none',
                    background: gallerySortBy === s.id ? textPrimary : 'transparent',
                    color: gallerySortBy === s.id ? '#fff' : textPrimary,
                    fontSize: 10, fontWeight: 500, fontFamily: 'inherit',
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    transition: 'background .15s, color .15s',
                  }}>{s.label}</button>
                ))}
              </div>

              {/* View mode */}
              <div style={{ display: 'flex', border: `1px solid ${border}`, background: '#fff' }}>
                {([
                  { id: 'grid' as const,    name: 'gallery'  as IconName, label: 'תצוגת רשת' },
                  { id: 'masonry' as const, name: 'sections' as IconName, label: 'תצוגת אבן' },
                  { id: 'list' as const,    name: 'menu'     as IconName, label: 'תצוגת רשימה' },
                ] as const).map((v, i) => (
                  <button key={v.id} onClick={() => setGalleryViewMode(v.id)} aria-label={v.label} aria-pressed={galleryViewMode === v.id} style={{
                    padding: '8px 10px', border: 'none', cursor: 'pointer',
                    borderInlineStart: i > 0 ? `1px solid ${border}` : 'none',
                    background: galleryViewMode === v.id ? textPrimary : 'transparent',
                    color: galleryViewMode === v.id ? '#fff' : textPrimary,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background .15s, color .15s',
                  }}>
                    <Icon name={v.name} size={13} strokeWidth={1.85} />
                  </button>
                ))}
              </div>
            </div>

            {/* Keyboard shortcut hint — quiet meta line */}
            <p style={{
              fontSize: 11, color: textMuted, marginBottom: 24,
              letterSpacing: '0.04em',
            }}>
              לחצו <kbd style={{
                padding: '2px 6px', background: '#fff', border: `1px solid ${border}`,
                fontSize: 10, fontFamily: 'monospace', color: textPrimary,
              }}>T</kbd> על תמונה כדי לסמן כמועדף
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
                  marginBottom: 32, padding: 28,
                  background: '#fff', border: `1px solid ${border}`,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                    marginBottom: 22, gap: 12, flexWrap: 'wrap',
                  }}>
                    <div>
                      <div style={{
                        fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                        color: textMuted, textTransform: 'uppercase', marginBottom: 8,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', background: statusLive,
                        }} />
                        Published
                        {d && (
                          <>
                            <span style={{ color: border, marginInline: 2 }}>·</span>
                            <span>{MONTHS[d.getMonth()]} {d.getFullYear()}</span>
                          </>
                        )}
                      </div>
                      <h3 style={{
                        fontSize: 22, fontWeight: 500, margin: '0 0 6px',
                        letterSpacing: '-0.015em', color: textPrimary,
                      }}>{g.name}</h3>
                      <p style={{ fontSize: 13, color: textSecondary, margin: 0 }}>
                        {g.image_count.toLocaleString('he-IL')} תמונות
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <button
                        onClick={() => setCreativeGallery({ id: g.id, name: g.name, topPicksCount: galleryImages.filter(i => i.is_top_pick).length })}
                        style={{
                          padding: '11px 22px', borderRadius: 2,
                          background: '#0a0a0f', border: '1px solid #0a0a0f',
                          color: '#D4FF00',
                          fontSize: 11, fontWeight: 700,
                          letterSpacing: '0.18em', textTransform: 'uppercase',
                          fontFamily: 'inherit', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 8,
                          transition: 'background .15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#1a1a25' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#0a0a0f' }}
                      >
                        🎨 מנוע יצירה
                      </button>
                      <a href={galleryUrl(g.id)} style={{
                        padding: '11px 22px', borderRadius: 2,
                        background: 'transparent', border: `1px solid ${textPrimary}`,
                        color: textPrimary,
                        fontSize: 11, fontWeight: 500,
                        letterSpacing: '0.18em', textTransform: 'uppercase',
                        textDecoration: 'none', fontFamily: 'inherit',
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        transition: 'background .15s, color .15s',
                      }}
                        onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.background = textPrimary; e.currentTarget.style.color = '#fff' }}
                        onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textPrimary }}
                      >
                        View Gallery
                        <Icon name="arrow-out" size={12} strokeWidth={1.85} />
                      </a>
                    </div>
                  </div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 4,
                  }}>
                    {galleryImages.map(img => {
                      const selected = selectedPicks.has(img.id)
                      return (
                        <div
                          key={img.id}
                          onClick={() => togglePick(img.id)}
                          style={{
                            aspectRatio: '1', overflow: 'hidden', position: 'relative',
                            cursor: 'pointer', background: bgSubtle,
                            outline: selected ? `2px solid ${textPrimary}` : 'none',
                            outlineOffset: selected ? -2 : 0,
                          }}
                        >
                          <img
                            src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
                            alt="" loading="lazy"
                            style={{
                              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                              opacity: selected ? 1 : 0.55,
                              transition: 'opacity .15s',
                            }}
                          />
                          {selected && (
                            <div style={{
                              position: 'absolute', top: 6, insetInlineEnd: 6,
                              width: 20, height: 20, borderRadius: '50%',
                              background: textPrimary, color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Icon name="check" size={11} strokeWidth={3} />
                            </div>
                          )}
                          {img.is_top_pick && !selected && (
                            <div style={{
                              position: 'absolute', top: 6, insetInlineStart: 6,
                              width: 20, height: 20, borderRadius: '50%',
                              background: 'rgba(255,255,255,.9)', color: textPrimary,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Icon name="star" size={10} strokeWidth={1.85} />
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
            <div ref={reveal} style={{ marginBottom: 32 }}>
              <div style={{
                fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
                color: textMuted, textTransform: 'uppercase', marginBottom: 10,
              }}>Reels</div>
              <h2 style={{
                fontSize: 28, fontWeight: 500, margin: '0 0 6px',
                letterSpacing: '-0.02em', color: textPrimary,
              }}>Stories</h2>
              <p style={{ fontSize: 13, color: textSecondary, margin: 0, lineHeight: 1.5 }}>
                Preview and download your story reels
              </p>
            </div>
            <div ref={reveal} style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 24,
            }}>
              {galleries.filter(g => stories.has(g.id)).map(g => {
                const cover = covers.get(g.id)
                const galleryStories = stories.get(g.id) || []
                return (
                  <div key={g.id} style={{ textAlign: 'center' }}>
                    <div
                      onClick={() => setPlayingStory(storageUrl('gallery-stories', galleryStories[0].storage_path))}
                      style={{
                        aspectRatio: '9 / 16', overflow: 'hidden',
                        border: `1px solid ${border}`, cursor: 'pointer',
                        background: bgSubtle, position: 'relative',
                        transition: 'border-color .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = textPrimary }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = border }}
                    >
                      {cover && <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />}
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: '50%',
                          background: 'rgba(255,255,255,.92)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: textPrimary,
                        }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg>
                        </div>
                      </div>
                      <div style={{
                        position: 'absolute', bottom: 0, insetInline: 0,
                        background: 'linear-gradient(to top, rgba(20,20,19,.78), transparent)',
                        padding: '24px 14px 14px', textAlign: 'right',
                      }}>
                        <div style={{
                          fontSize: 14, fontWeight: 500, color: '#fff',
                          letterSpacing: '-0.01em',
                        }}>{g.name}</div>
                        <div style={{
                          fontSize: 11, fontWeight: 500, letterSpacing: '0.18em',
                          textTransform: 'uppercase', color: 'rgba(255,255,255,.9)', marginTop: 4,
                        }}>{galleryStories.length} {galleryStories.length === 1 ? 'story' : 'stories'}</div>
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
                        marginTop: 12, padding: '10px 20px', borderRadius: 2,
                        background: 'transparent', border: `1px solid ${textPrimary}`,
                        color: textPrimary,
                        fontSize: 10, fontWeight: 500,
                        letterSpacing: '0.18em', textTransform: 'uppercase',
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'background .15s, color .15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = textPrimary; e.currentTarget.style.color = '#fff' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = textPrimary }}
                    >
                      {downloading === g.id ? 'Downloading…' : 'Download Stories'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── My Page Tab ─────────────────────────────────────────────── */}
        {tab === 'page' && (
          <Suspense fallback={<div style={{ padding: 40, color: textMuted, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading…</div>}>
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

        {tab === 'tender' && (
          <Suspense fallback={<div style={{ padding: 40, color: textMuted, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading…</div>}>
            <TenderBuilder
              galleries={galleries}
              allImages={allImages}
              covers={covers}
              businessName={studioName || 'Studio'}
            />
          </Suspense>
        )}
      </div>

      {/* Footer — small, monochrome */}
      <footer style={{
        borderTop: `1px solid ${border}`, padding: '24px 24px',
        textAlign: 'center', background: bg,
      }}>
        <div style={{
          fontSize: 10, color: textMuted, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>
          Powered by Pixflow
        </div>
      </footer>

      {/* Story player */}
      {playingStory && <StoryPlayer url={playingStory} onClose={() => setPlayingStory(null)} />}

      {/* Creative Engine — per-gallery AI design campaign */}
      {creativeGallery && (
        <Suspense fallback={null}>
          <CreativeEngineDialog
            clientId={clientId}
            galleryId={creativeGallery.id}
            galleryName={creativeGallery.name}
            topPicksCount={creativeGallery.topPicksCount}
            imageById={new Map(topPicks.map(p => [p.id, { id: p.id, thumbnail_path: p.thumbnail_path, storage_path: p.storage_path }]))}
            onClose={() => setCreativeGallery(null)}
          />
        </Suspense>
      )}
    </div>
  )
}
