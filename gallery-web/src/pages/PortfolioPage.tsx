import { useEffect, useState } from 'react'
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

const EVENT_TYPE_META: Record<string, { label: string; icon: string }> = {
  'conference': { label: 'כנסים', icon: '🎤' },
  'corporate-event': { label: 'אירועי חברה', icon: '🏢' },
  'government': { label: 'אירועים ממשלתיים', icon: '🏛️' },
  'retreat-abroad': { label: 'נופשים בחו״ל', icon: '✈️' },
  'retreat-local': { label: 'נופשים בארץ', icon: '🏖️' },
  'pre-event': { label: 'ימי קדם', icon: '📋' },
  'other': { label: 'אירועים נוספים', icon: '📸' },
}

function readStr(obj: Record<string, unknown> | null, key: string): string {
  if (!obj) return ''
  const v = obj[key]
  return typeof v === 'string' ? v : ''
}

function imgUrl(path: string | null) {
  return path ? storageUrl('gallery-images', path) : ''
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PortfolioPage() {
  // Parse URL
  const { clientId, slug } = (() => {
    const path = window.location.pathname.replace(/\/$/, '')
    const m1 = path.match(/^\/([^/]+)\/client\/([^/]+)$/)
    if (m1) return { slug: m1[1], clientId: m1[2] }
    const m2 = path.match(/^\/client\/([^/]+)$/)
    if (m2) return { slug: '', clientId: m2[1] }
    return { slug: '', clientId: '' }
  })()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [studioName, setStudioName] = useState('')
  const [galleries, setGalleries] = useState<GalleryRow[]>([])
  const [topPicks, setTopPicks] = useState<ImageRow[]>([])
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
  const [activeType, setActiveType] = useState<string | null>(null)
  const [activeGallery, setActiveGallery] = useState<string | null>(null)
  const [settings, setSettings] = useState<PortfolioSettings>(DEFAULT_SETTINGS)

  // ── Load data ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!clientId) { setError('No client ID'); setLoading(false); return }
    load()
    async function load() {
      const { data, error: e } = await supabase
        .from('galleries')
        .select('id, name, client_name, image_count, published_at, delivery_settings')
        .eq('client_id', clientId).eq('status', 'live')
        .order('published_at', { ascending: false })
      if (e || !data?.length) { setError('Not found'); setLoading(false); return }
      setGalleries(data)

      const settings = (data[0].delivery_settings || {}) as Record<string, unknown>
      setClientName(data[0].client_name || readStr(settings, 'clientName') || '')
      setStudioName(readStr(settings, 'studioName'))

      const ids = data.map(g => g.id)

      // Covers
      const coverResults = await Promise.all(data.map(async g => {
        const { data: img } = await supabase.from('images')
          .select('thumbnail_path, storage_path')
          .eq('gallery_id', g.id).order('sort_order', { ascending: true }).limit(1).maybeSingle()
        return { id: g.id, url: img ? imgUrl(img.thumbnail_path || img.storage_path) : '' }
      }))
      const cm = new Map<string, string>()
      coverResults.forEach(c => { if (c.url) cm.set(c.id, c.url) })
      setCovers(cm)

      // Top picks
      const { data: picks } = await supabase.from('images')
        .select('id, gallery_id, filename, storage_path, thumbnail_path')
        .in('gallery_id', ids).eq('is_top_pick', true)
        .order('sort_order', { ascending: true }).limit(200)
      if (picks) setTopPicks(picks)

      setSettings(loadPortfolioSettings(clientId))
      setLoading(false)
    }
  }, [clientId])

  // ── Derived data ──────────────────────────────────────────────────────

  // Accent color and background from settings
  const accent = settings.accentColor
  const bgBase = settings.bgStyle === 'midnight' ? '#0a0a1a' : settings.bgStyle === 'gradient' ? '#0a0a1a' : '#050508'
  const bgGradient = settings.bgStyle === 'gradient'
    ? `linear-gradient(135deg, #050510 0%, #0a0a2a 50%, #150a20 100%)`
    : bgBase

  // Filter hidden galleries
  const visibleGalleries = galleries.filter(g => !settings.hiddenGalleryIds.includes(g.id))

  // Group galleries by event type
  const eventTypes: { key: string; label: string; icon: string; galleries: GalleryRow[]; coverUrl: string }[] = []
  const typeMap = new Map<string, GalleryRow[]>()

  visibleGalleries.forEach(g => {
    const et = readStr(g.delivery_settings, 'eventType') || 'other'
    if (!typeMap.has(et)) typeMap.set(et, [])
    typeMap.get(et)!.push(g)
  })

  typeMap.forEach((gals, key) => {
    const meta = EVENT_TYPE_META[key] || { label: key, icon: '📸' }
    const coverGal = gals[0]
    eventTypes.push({
      key,
      label: meta.label,
      icon: meta.icon,
      galleries: gals,
      coverUrl: covers.get(coverGal.id) || '',
    })
  })

  // Active type galleries
  const activeGalleries = activeType ? (typeMap.get(activeType) || []) : []

  // Active gallery photos
  const activePhotos = activeGallery ? topPicks.filter(p => p.gallery_id === activeGallery) : []

  // Hero background: first cover image
  const heroBg = covers.values().next().value || ''

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#050508', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(99,102,241,.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#050508', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.4)', fontSize: 16 }}>
      {error}
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', background: bgGradient,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#fff', direction: 'rtl',
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(30px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes spin { to { transform: rotate(360deg) } }
        .pf-type-card { transition: all .35s cubic-bezier(.4,0,.2,1); }
        .pf-type-card:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 24px 60px rgba(0,0,0,.5), 0 0 40px ${accent}25; }
        .pf-type-card:hover .pf-type-cover { transform: scale(1.08); filter: brightness(1.1); }
        .pf-gal-card { transition: all .25s cubic-bezier(.4,0,.2,1); }
        .pf-gal-card:hover { transform: translateY(-3px); border-color: rgba(129,140,248,.3); }
        .pf-gal-card:hover .pf-gal-cover { transform: scale(1.05); }
        .pf-photo { transition: all .2s; cursor: pointer; }
        .pf-photo:hover { transform: scale(1.03); z-index: 1; box-shadow: 0 8px 32px rgba(0,0,0,.5); }
      `}</style>

      {/* ═══ Hero ═══ */}
      <section style={{
        position: 'relative', height: '100vh', minHeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {/* Background image */}
        {heroBg && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${heroBg})`, backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(20px) brightness(.35) saturate(1.2)',
            transform: 'scale(1.1)',
          }} />
        )}

        {/* Gradient overlays */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,5,8,.4) 0%, rgba(5,5,8,.85) 70%, #050508 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, ${accent}14 0%, transparent 70%)` }} />
        {/* Animated grid lines for high-tech feel */}
        <div style={{
          position: 'absolute', inset: 0, opacity: .04,
          backgroundImage: `linear-gradient(${accent}40 1px, transparent 1px), linear-gradient(90deg, ${accent}40 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />

        {/* Content */}
        <div style={{
          position: 'relative', zIndex: 1, textAlign: 'center',
          animation: 'fadeUp .8s ease both',
          padding: '0 24px', maxWidth: 800,
        }}>
          {studioName && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 16px', borderRadius: 50, marginBottom: 20,
              background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)',
              backdropFilter: 'blur(12px)',
              fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', letterSpacing: '.1em', textTransform: 'uppercase',
            }}>
              {studioName}
            </div>
          )}

          <h1 style={{
            fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 800, margin: '0 0 16px',
            lineHeight: 1.05, letterSpacing: '-0.04em',
            background: 'linear-gradient(135deg, #fff 30%, #c7d2fe 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {clientName}
          </h1>

          <p style={{
            fontSize: 'clamp(14px, 2vw, 18px)', color: 'rgba(255,255,255,.45)',
            margin: '0 0 40px', lineHeight: 1.6, maxWidth: 500, marginInline: 'auto',
          }}>
            {settings.tagline || 'הפקת אירועים'} · {visibleGalleries.length} אירועים · {topPicks.length} תמונות
          </p>

          {/* Scroll indicator */}
          <div style={{
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            color: 'rgba(255,255,255,.3)', fontSize: 11, fontWeight: 500,
            animation: 'fadeUp 1.2s ease both .3s',
          }}>
            <span>גלול למטה</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'bounce 1.5s infinite' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </section>

      {/* ═══ Event Types Grid ═══ */}
      {!activeType && (
        <section style={{
          padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)',
          maxWidth: 1200, margin: '0 auto',
          animation: 'fadeUp .6s ease both',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{
              fontSize: 'clamp(24px, 3.5vw, 40px)', fontWeight: 800, margin: '0 0 12px',
              letterSpacing: '-0.03em', color: '#fff',
            }}>
              סוגי אירועים
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,.4)', margin: 0 }}>
              בחר סוג אירוע לצפייה בעבודות
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}>
            {eventTypes.map(et => {
              const totalPicks = et.galleries.reduce((sum, g) =>
                sum + topPicks.filter(p => p.gallery_id === g.id).length, 0)
              return (
                <div
                  key={et.key}
                  className="pf-type-card"
                  onClick={() => setActiveType(et.key)}
                  style={{
                    position: 'relative', borderRadius: 20, overflow: 'hidden',
                    cursor: 'pointer', aspectRatio: '4/3',
                    border: '1px solid rgba(255,255,255,.06)',
                    boxShadow: '0 8px 32px rgba(0,0,0,.3)',
                  }}
                >
                  {/* Cover image */}
                  {et.coverUrl && (
                    <img className="pf-type-cover" src={et.coverUrl} alt="" style={{
                      position: 'absolute', inset: 0, width: '100%', height: '100%',
                      objectFit: 'cover', transition: 'transform .6s cubic-bezier(.4,0,.2,1), filter .3s',
                    }} />
                  )}

                  {/* Gradient overlay */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,.85) 0%, rgba(0,0,0,.3) 40%, rgba(0,0,0,.1) 100%)',
                  }} />

                  {/* Content */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '24px 22px',
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 4 }}>{et.icon}</div>
                    <h3 style={{
                      fontSize: 22, fontWeight: 700, margin: '0 0 6px',
                      letterSpacing: '-0.01em', color: '#fff',
                    }}>
                      {et.label}
                    </h3>
                    <div style={{
                      fontSize: 13, color: 'rgba(255,255,255,.5)',
                      display: 'flex', gap: 10,
                    }}>
                      <span>{et.galleries.length} {et.galleries.length === 1 ? 'אירוע' : 'אירועים'}</span>
                      <span>·</span>
                      <span>{totalPicks} תמונות</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ═══ Active Event Type → Gallery List ═══ */}
      {activeType && !activeGallery && (
        <section style={{
          padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)',
          maxWidth: 1200, margin: '0 auto',
          animation: 'fadeUp .4s ease both',
        }}>
          {/* Back button */}
          <button onClick={() => setActiveType(null)} style={{
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 10, padding: '8px 18px', cursor: 'pointer',
            color: 'rgba(255,255,255,.6)', fontSize: 13, fontWeight: 500,
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 32, transition: 'all .15s',
          }}>
            ← חזרה לסוגי אירועים
          </button>

          {/* Section title */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 42, marginBottom: 8 }}>
              {EVENT_TYPE_META[activeType]?.icon || '📸'}
            </div>
            <h2 style={{
              fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, margin: '0 0 8px',
              letterSpacing: '-0.03em', color: '#fff',
            }}>
              {EVENT_TYPE_META[activeType]?.label || activeType}
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,.4)' }}>
              {activeGalleries.length} {activeGalleries.length === 1 ? 'אירוע' : 'אירועים'}
            </p>
          </div>

          {/* Gallery cards grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}>
            {activeGalleries.map(g => {
              const cover = covers.get(g.id)
              const pickCount = topPicks.filter(p => p.gallery_id === g.id).length
              const location = readStr(g.delivery_settings, 'eventLocation')
              const date = readStr(g.delivery_settings, 'eventDate')
              return (
                <div
                  key={g.id}
                  className="pf-gal-card"
                  onClick={() => setActiveGallery(g.id)}
                  style={{
                    background: 'rgba(255,255,255,.02)',
                    border: '1px solid rgba(255,255,255,.06)',
                    borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                  }}
                >
                  <div style={{ position: 'relative', aspectRatio: '16/10', overflow: 'hidden' }}>
                    {cover ? (
                      <img className="pf-gal-cover" src={cover} alt="" style={{
                        width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                        transition: 'transform .5s cubic-bezier(.4,0,.2,1)',
                      }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.15)', fontSize: 28 }}>📷</div>
                    )}
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,.6) 0%, transparent 50%)',
                    }} />
                    <div style={{ position: 'absolute', bottom: 14, right: 14 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,.5)' }}>{g.name}</div>
                    </div>
                  </div>
                  <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
                      {pickCount} תמונות מובחרות
                      {location && ` · ${location}`}
                    </span>
                    {date && <span style={{ fontSize: 11, color: 'rgba(255,255,255,.25)' }}>{date}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ═══ Active Gallery → Photo Grid ═══ */}
      {activeGallery && (() => {
        const gal = galleries.find(g => g.id === activeGallery)
        if (!gal) return null
        return (
          <section style={{
            padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)',
            maxWidth: 1400, margin: '0 auto',
            animation: 'fadeUp .4s ease both',
          }}>
            {/* Back */}
            <button onClick={() => setActiveGallery(null)} style={{
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 10, padding: '8px 18px', cursor: 'pointer',
              color: 'rgba(255,255,255,.6)', fontSize: 13, fontWeight: 500,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 32, transition: 'all .15s',
            }}>
              ← חזרה ל{EVENT_TYPE_META[activeType!]?.label || 'גלריות'}
            </button>

            {/* Gallery header */}
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <h2 style={{
                fontSize: 'clamp(22px, 3.5vw, 36px)', fontWeight: 800, margin: '0 0 8px',
                letterSpacing: '-0.02em', color: '#fff',
              }}>
                {gal.name}
              </h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.4)' }}>
                {activePhotos.length} תמונות מובחרות
                {readStr(gal.delivery_settings, 'eventLocation') && ` · ${readStr(gal.delivery_settings, 'eventLocation')}`}
              </p>
            </div>

            {/* Photo grid — masonry-style */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 8,
            }}>
              {activePhotos.map(img => (
                <div key={img.id} className="pf-photo" style={{
                  borderRadius: 10, overflow: 'hidden',
                  background: 'rgba(255,255,255,.02)',
                }}>
                  <img
                    src={imgUrl(img.thumbnail_path || img.storage_path)}
                    alt=""
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </section>
        )
      })()}

      {/* ═══ Footer ═══ */}
      <footer style={{
        padding: '40px 24px', textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,.04)',
        color: 'rgba(255,255,255,.2)', fontSize: 11,
      }}>
        {studioName && <div style={{ marginBottom: 4 }}>{studioName}</div>}
        <div>Powered by Pixflow</div>
      </footer>

      <style>{`@keyframes bounce { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(4px) } }`}</style>
    </div>
  )
}
