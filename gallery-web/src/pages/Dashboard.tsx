import React, { useState, useEffect, useRef } from 'react'
import { useAuth, signInWithGoogle, signOut } from '../lib/auth'
import { supabase } from '../supabase'

interface Gallery {
  id: string
  name: string
  image_count: number
  published_at: string | null
  status: string
}

const accent = '#6366f1'
const accentLight = '#818cf8'
const accentGlow = 'rgba(99,102,241,.25)'
const bg = '#07070d'
const bgSubtle = '#0a0a14'
const card = 'rgba(17,17,28,.65)'
const cardSolid = '#111118'
const border = '#1e1e2a'
const borderHover = '#2d2d44'
const textPrimary = '#f1f1f4'
const textSecondary = '#8b8fa3'
const textMuted = '#5c5f73'
const glass = 'rgba(255,255,255,.03)'

/* ---- reusable keyframes injected once ---- */
const styleId = 'dashboard-keyframes'
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    @keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes modalIn  { from { opacity:0; transform:scale(.96) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes shimmer  { from { background-position: -400px 0; } to { background-position: 400px 0; } }
    @keyframes pulse    { 0%,100% { opacity:.4; } 50% { opacity:1; } }
    @keyframes overlayIn { from { opacity:0; } to { opacity:1; } }
  `
  document.head.appendChild(style)
}

export function Dashboard() {
  const { user, loading } = useAuth()
  const [galleries, setGalleries] = useState<Gallery[]>([])
  const [loadingGalleries, setLoadingGalleries] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [creating, setCreating] = useState(false)
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)

  // New delivery settings state
  const [welcomeStyle, setWelcomeStyle] = useState<'mosaic' | 'cinematic' | 'minimal'>('mosaic')
  const [clientHidePhotosEnabled, setClientHidePhotosEnabled] = useState(false)
  const [requireGalleryCode, setRequireGalleryCode] = useState(false)
  const [galleryCode, setGalleryCode] = useState('')
  const [trackDownloads, setTrackDownloads] = useState(false)
  const [feedLayout, setFeedLayout] = useState<'grid' | 'masonry' | 'carousel'>('grid')

  useEffect(() => {
    if (!user) return
    fetchGalleries()
  }, [user])

  async function fetchGalleries() {
    setLoadingGalleries(true)
    const { data } = await supabase
      .from('galleries')
      .select('id, name, image_count, published_at, status')
      .eq('business_id', user!.id)
      .order('created_at', { ascending: false })
    setGalleries(data ?? [])
    setLoadingGalleries(false)
  }

  async function createGallery() {
    if (!newName.trim()) return
    setCreating(true)
    const { error } = await supabase.from('galleries').insert({
      name: newName.trim(),
      event_date: newDate || null,
      business_id: user!.id,
      status: 'draft',
      image_count: 0,
      delivery_settings: {
        welcomeStyle,
        clientHidePhotosEnabled,
        requireGalleryCode,
        galleryCode: requireGalleryCode ? galleryCode : null,
        trackDownloads,
        feedLayout,
      },
    })
    setCreating(false)
    if (error) {
      console.error('Gallery creation failed:', error)
      alert(`שגיאה ביצירת גלריה: ${error.message}`)
      return
    }
    setShowModal(false)
    setNewName('')
    setNewDate('')
    setWelcomeStyle('mosaic')
    setClientHidePhotosEnabled(false)
    setRequireGalleryCode(false)
    setGalleryCode('')
    setTrackDownloads(false)
    setFeedLayout('grid')
    fetchGalleries()
  }

  /* ---------- Loading state ---------- */
  if (loading) {
    return (
      <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: `3px solid ${border}`, borderTopColor: accent,
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ color: textSecondary, fontSize: 14, fontFamily: 'Inter, sans-serif', letterSpacing: '0.02em' }}>Loading...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  /* ---------- Sign-in screen ---------- */
  if (!user) {
    return (
      <div style={{
        background: `radial-gradient(ellipse at 50% 0%, rgba(99,102,241,.08) 0%, ${bg} 60%)`,
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, sans-serif', direction: 'rtl',
      }}>
        <div style={{
          textAlign: 'center', maxWidth: 440, padding: 48,
          animation: 'fadeInUp .5s ease both',
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: 24, margin: '0 auto 24px',
            background: `linear-gradient(135deg, ${accent}, #a78bfa)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, boxShadow: `0 8px 32px ${accentGlow}`,
          }}>
            📸
          </div>
          <h1 style={{ color: textPrimary, fontSize: 32, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.02em' }}>
            ברוכים הבאים ל-Pixflow
          </h1>
          <p style={{ color: textSecondary, fontSize: 16, marginBottom: 40, lineHeight: 1.7 }}>
            התחברו כדי לנהל את הגלריות שלכם
          </p>
          <button
            onClick={signInWithGoogle}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 12,
              background: '#fff', color: '#1a1a2e', border: 'none', borderRadius: 14,
              padding: '16px 36px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', transition: 'transform .15s, box-shadow .15s',
              boxShadow: '0 4px 16px rgba(0,0,0,.3)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.3)'; }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 010-9.18l-7.98-6.19a24.08 24.08 0 000 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            התחברות עם Google
          </button>
        </div>
      </div>
    )
  }

  /* ---------- Dashboard (authenticated) ---------- */
  const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email

  const totalPhotos = galleries.reduce((sum, g) => sum + (g.image_count ?? 0), 0)
  const publishedCount = galleries.filter((g) => g.status === 'published').length
  const draftCount = galleries.filter((g) => g.status !== 'published').length

  const statCards: { label: string; value: number | string; icon: string; color: string }[] = [
    { label: 'סה"כ גלריות', value: galleries.length, icon: '🖼', color: accent },
    { label: 'סה"כ תמונות', value: totalPhotos, icon: '📷', color: '#a78bfa' },
    { label: 'פורסמו', value: publishedCount, icon: '✅', color: '#22c55e' },
    { label: 'טיוטות', value: draftCount, icon: '📝', color: '#facc15' },
  ]

  return (
    <div style={{
      background: bg, minHeight: '100vh', fontFamily: 'Inter, sans-serif',
      direction: 'rtl', color: textPrimary,
    }}>
      {/* ======= Top bar ======= */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 32px',
        background: 'rgba(10,10,18,.85)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${border}`,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {avatar && (
            <img src={avatar} alt="" style={{
              width: 38, height: 38, borderRadius: '50%',
              border: `2px solid ${border}`,
              transition: 'border-color .2s',
            }} />
          )}
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.01em' }}>{displayName}</div>
            <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>צלם</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{
            color: textSecondary, textDecoration: 'none', fontSize: 14,
            fontWeight: 600, letterSpacing: '-0.01em',
            transition: 'color .2s',
          }}
            onMouseEnter={(e) => (e.currentTarget.style.color = textPrimary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = textSecondary)}
          >
            Pixflow
          </a>
          <button
            onClick={signOut}
            style={{
              background: 'transparent', border: `1px solid ${border}`, borderRadius: 10,
              color: textSecondary, padding: '8px 18px', fontSize: 13, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', transition: 'all .2s',
              letterSpacing: '0.01em',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = borderHover; e.currentTarget.style.color = textPrimary; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = border; e.currentTarget.style.color = textSecondary; }}
          >
            התנתקות
          </button>
        </div>
      </header>

      {/* ======= Main content ======= */}
      <main style={{ maxWidth: 1060, margin: '0 auto', padding: '48px 28px 80px' }}>

        {/* Page heading + CTA */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          marginBottom: 36, animation: 'fadeInUp .4s ease both',
        }}>
          <div>
            <h1 style={{
              fontSize: 32, fontWeight: 800, margin: 0,
              letterSpacing: '-0.03em', lineHeight: 1.2,
            }}>
              הגלריות שלי
            </h1>
            <p style={{ color: textSecondary, fontSize: 15, margin: '8px 0 0', letterSpacing: '0.01em' }}>
              נהלו ושתפו את הגלריות שלכם
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accentLight})`,
              color: '#fff', border: 'none', borderRadius: 12,
              padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', transition: 'transform .15s, box-shadow .15s',
              boxShadow: `0 4px 20px ${accentGlow}`,
              letterSpacing: '0.01em',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 8px 28px ${accentGlow}`; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 20px ${accentGlow}`; }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            גלריה חדשה
          </button>
        </div>

        {/* ======= Stats row ======= */}
        {!loadingGalleries && galleries.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16, marginBottom: 40,
            animation: 'fadeInUp .45s ease both',
          }}>
            {statCards.map((s, i) => (
              <div key={i} style={{
                background: card,
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                borderRadius: 16, padding: '22px 24px',
                border: `1px solid ${border}`,
                transition: 'border-color .25s, transform .2s',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = borderHover; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = border; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 20 }}>{s.icon}</span>
                  <span style={{ fontSize: 12, color: textMuted, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {s.label}
                  </span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: s.color }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ======= Content ======= */}
        {loadingGalleries ? (
          /* skeleton loader */
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20,
          }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                background: cardSolid, borderRadius: 18, padding: 28,
                border: `1px solid ${border}`, height: 160,
              }}>
                <div style={{
                  width: '60%', height: 16, borderRadius: 8,
                  background: `linear-gradient(90deg, ${border} 25%, ${borderHover} 50%, ${border} 75%)`,
                  backgroundSize: '400px 100%', animation: 'shimmer 1.5s ease infinite',
                  marginBottom: 16,
                }} />
                <div style={{
                  width: '40%', height: 12, borderRadius: 6,
                  background: `linear-gradient(90deg, ${border} 25%, ${borderHover} 50%, ${border} 75%)`,
                  backgroundSize: '400px 100%', animation: 'shimmer 1.5s ease infinite',
                }} />
              </div>
            ))}
          </div>
        ) : galleries.length === 0 ? (
          /* ======= Empty state ======= */
          <div style={{
            textAlign: 'center', padding: '100px 24px',
            animation: 'fadeInUp .5s ease both',
          }}>
            <div style={{
              width: 120, height: 120, borderRadius: 32, margin: '0 auto 28px',
              background: `linear-gradient(135deg, rgba(99,102,241,.12), rgba(167,139,250,.08))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid rgba(99,102,241,.15)`,
            }}>
              <span style={{ fontSize: 52, filter: 'grayscale(0.2)' }}>🖼️</span>
            </div>
            <h2 style={{
              fontSize: 26, fontWeight: 700, marginBottom: 12, color: textPrimary,
              letterSpacing: '-0.02em',
            }}>
              אין גלריות עדיין
            </h2>
            <p style={{
              color: textSecondary, fontSize: 16, marginBottom: 36, lineHeight: 1.7,
              maxWidth: 380, marginInline: 'auto',
            }}>
              צרו את הגלריה הראשונה שלכם ושתפו תמונות עם הלקוחות
            </p>
            <button
              onClick={() => setShowModal(true)}
              style={{
                background: `linear-gradient(135deg, ${accent}, ${accentLight})`, color: '#fff',
                border: 'none', borderRadius: 16, padding: '18px 48px', fontSize: 17,
                fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                transition: 'transform .15s, box-shadow .15s',
                boxShadow: `0 6px 28px ${accentGlow}`,
                letterSpacing: '0.01em',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 10px 36px rgba(99,102,241,.35)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 6px 28px ${accentGlow}`; }}
            >
              צור גלריה חדשה
            </button>
          </div>
        ) : (
          /* ======= Gallery grid ======= */
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20,
          }}>
            {galleries.map((g, idx) => {
              const isHovered = hoveredCard === g.id
              return (
                <div
                  key={g.id}
                  style={{
                    background: isHovered
                      ? `linear-gradient(135deg, rgba(99,102,241,.06), rgba(17,17,28,.7))`
                      : card,
                    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                    borderRadius: 18, padding: 28,
                    border: `1px solid ${isHovered ? 'rgba(99,102,241,.35)' : border}`,
                    transition: 'all .3s cubic-bezier(.4,0,.2,1)',
                    transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                    boxShadow: isHovered ? `0 12px 40px rgba(99,102,241,.12)` : '0 2px 8px rgba(0,0,0,.1)',
                    cursor: 'pointer',
                    animation: `fadeInUp .4s ease both`,
                    animationDelay: `${idx * 0.05}s`,
                    position: 'relative' as const,
                    overflow: 'hidden',
                  }}
                  onMouseEnter={() => setHoveredCard(g.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  {/* Top glow line on hover */}
                  <div style={{
                    position: 'absolute', top: 0, right: 0, left: 0, height: 2,
                    background: isHovered ? `linear-gradient(90deg, transparent, ${accent}, transparent)` : 'transparent',
                    transition: 'background .3s',
                  }} />

                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
                    <h3 style={{
                      fontSize: 18, fontWeight: 700, margin: 0,
                      letterSpacing: '-0.01em', lineHeight: 1.3,
                    }}>
                      {g.name}
                    </h3>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 20,
                      background: g.status === 'published' ? 'rgba(34,197,94,.12)' : 'rgba(250,204,21,.10)',
                      color: g.status === 'published' ? '#4ade80' : '#fde047',
                      letterSpacing: '0.02em', whiteSpace: 'nowrap' as const,
                      border: `1px solid ${g.status === 'published' ? 'rgba(34,197,94,.2)' : 'rgba(250,204,21,.15)'}`,
                    }}>
                      {g.status === 'published' ? 'פורסם' : 'טיוטה'}
                    </span>
                  </div>

                  <div style={{
                    display: 'flex', gap: 24, fontSize: 13, color: textSecondary,
                    borderTop: `1px solid ${isHovered ? 'rgba(99,102,241,.15)' : border}`,
                    paddingTop: 16, transition: 'border-color .3s',
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ opacity: 0.6 }}>📷</span>
                      {g.image_count ?? 0} תמונות
                    </span>
                    {g.published_at && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ opacity: 0.6 }}>📅</span>
                        {new Date(g.published_at).toLocaleDateString('he-IL')}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ======= Download Tracking Section ======= */}
        {galleries.length > 0 && (
          <div style={{
            marginTop: 48, padding: 28, borderRadius: 18,
            background: card, border: `1px solid ${border}`,
            backdropFilter: 'blur(8px)',
            animation: 'fadeInUp .5s ease both .2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
                  📊 מעקב הורדות
                </h3>
                <p style={{ fontSize: 12, color: textMuted, margin: 0 }}>
                  צפו מי הוריד תמונות מהגלריות שלכם
                </p>
              </div>
              <span style={{
                padding: '6px 14px', borderRadius: 20,
                background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.15)',
                fontSize: 11, color: accentLight, fontWeight: 600,
              }}>בקרוב</span>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12,
            }}>
              {[
                { email: 'demo@example.com', count: 24, date: '21.04.2026' },
                { email: 'guest@gmail.com', count: 12, date: '20.04.2026' },
                { email: 'couple@mail.com', count: 48, date: '19.04.2026' },
              ].map((d, i) => (
                <div key={i} style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,.02)', border: `1px solid rgba(255,255,255,.04)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary, marginBottom: 2 }}>{d.email}</div>
                    <div style={{ fontSize: 10, color: textMuted }}>{d.date}</div>
                  </div>
                  <div style={{
                    fontSize: 16, fontWeight: 800, color: accentLight,
                    background: 'rgba(99,102,241,.1)', padding: '4px 10px', borderRadius: 8,
                  }}>{d.count}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ======= Create gallery modal ======= */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,.75)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, animation: 'overlayIn .2s ease both',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: `linear-gradient(180deg, #141420 0%, ${cardSolid} 100%)`,
              borderRadius: 22, padding: '40px 36px 36px', width: '90%', maxWidth: 520,
              maxHeight: '90vh', overflowY: 'auto' as const,
              border: `1px solid ${border}`, direction: 'rtl',
              animation: 'modalIn .3s ease both',
              boxShadow: `0 24px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.03) inset`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal icon */}
            <div style={{
              width: 52, height: 52, borderRadius: 16, marginBottom: 20,
              background: `linear-gradient(135deg, rgba(99,102,241,.15), rgba(167,139,250,.1))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid rgba(99,102,241,.2)`,
            }}>
              <span style={{ fontSize: 24 }}>🖼️</span>
            </div>

            <h2 style={{
              fontSize: 22, fontWeight: 800, marginTop: 0, marginBottom: 8,
              color: textPrimary, letterSpacing: '-0.02em',
            }}>
              יצירת גלריה חדשה
            </h2>
            <p style={{ color: textMuted, fontSize: 14, margin: '0 0 28px', lineHeight: 1.5 }}>
              מלאו את הפרטים כדי להתחיל
            </p>

            <label style={{ display: 'block', marginBottom: 20 }}>
              <span style={{
                fontSize: 13, color: textSecondary, display: 'block', marginBottom: 8,
                fontWeight: 500, letterSpacing: '0.02em',
              }}>
                שם הגלריה
              </span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="לדוגמה: החתונה של יוסי ומיכל"
                autoFocus
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12,
                  border: `1px solid ${border}`,
                  background: bg, color: textPrimary, fontSize: 15,
                  fontFamily: 'Inter, sans-serif',
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color .2s, box-shadow .2s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${accentGlow}`; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = border; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 28 }}>
              <span style={{
                fontSize: 13, color: textSecondary, display: 'block', marginBottom: 8,
                fontWeight: 500, letterSpacing: '0.02em',
              }}>
                תאריך אירוע
              </span>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12,
                  border: `1px solid ${border}`,
                  background: bg, color: textPrimary, fontSize: 15,
                  fontFamily: 'Inter, sans-serif',
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color .2s, box-shadow .2s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${accentGlow}`; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = border; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </label>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: border, margin: '4px 0 24px' }} />

            {/* ── Welcome Screen Style ── */}
            <div style={{ marginBottom: 24 }}>
              <span style={{
                fontSize: 13, color: textSecondary, display: 'block', marginBottom: 10,
                fontWeight: 500, letterSpacing: '0.02em',
              }}>
                סגנון מסך פתיחה
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {([
                  { value: 'mosaic' as const, label: 'פסיפס', icon: '◫' },
                  { value: 'cinematic' as const, label: 'קולנועי', icon: '▮' },
                  { value: 'minimal' as const, label: 'מינימלי', icon: '◻' },
                ] as const).map((opt) => {
                  const selected = welcomeStyle === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setWelcomeStyle(opt.value)}
                      style={{
                        background: selected ? `rgba(99,102,241,.12)` : glass,
                        border: `1.5px solid ${selected ? accent : border}`,
                        borderRadius: 14, padding: '16px 8px', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        transition: 'all .2s',
                        boxShadow: selected ? `0 0 0 3px ${accentGlow}` : 'none',
                      }}
                    >
                      <span style={{ fontSize: 24, color: selected ? accentLight : textMuted, lineHeight: 1 }}>
                        {opt.icon}
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 600, color: selected ? textPrimary : textSecondary,
                        letterSpacing: '0.01em', fontFamily: 'Inter, sans-serif',
                      }}>
                        {opt.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Feed Layout ── */}
            <div style={{ marginBottom: 24 }}>
              <span style={{
                fontSize: 13, color: textSecondary, display: 'block', marginBottom: 10,
                fontWeight: 500, letterSpacing: '0.02em',
              }}>
                תצוגת פיד
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {([
                  { value: 'grid' as const, label: 'רשת', icon: '▦' },
                  { value: 'masonry' as const, label: 'אבן', icon: '▥' },
                  { value: 'carousel' as const, label: 'קרוסלה', icon: '▷' },
                ] as const).map((opt) => {
                  const selected = feedLayout === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFeedLayout(opt.value)}
                      style={{
                        background: selected ? `rgba(99,102,241,.12)` : glass,
                        border: `1.5px solid ${selected ? accent : border}`,
                        borderRadius: 14, padding: '16px 8px', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        transition: 'all .2s',
                        boxShadow: selected ? `0 0 0 3px ${accentGlow}` : 'none',
                      }}
                    >
                      <span style={{ fontSize: 24, color: selected ? accentLight : textMuted, lineHeight: 1 }}>
                        {opt.icon}
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 600, color: selected ? textPrimary : textSecondary,
                        letterSpacing: '0.01em', fontFamily: 'Inter, sans-serif',
                      }}>
                        {opt.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Divider ── */}
            <div style={{ height: 1, background: border, margin: '4px 0 24px' }} />

            {/* ── Client Privacy: Hide Photos Toggle ── */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', userSelect: 'none',
                }}
                onClick={() => setClientHidePhotosEnabled(!clientHidePhotosEnabled)}
              >
                <div>
                  <span style={{
                    fontSize: 14, color: textPrimary, fontWeight: 600, display: 'block',
                    marginBottom: 4, letterSpacing: '0.01em',
                  }}>
                    הסתרת תמונות
                  </span>
                  <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                    אפשרו לאורחים להסתיר תמונות מאורחים אחרים
                  </span>
                </div>
                <div style={{
                  width: 44, height: 24, borderRadius: 12, padding: 2,
                  background: clientHidePhotosEnabled ? accent : border,
                  transition: 'background .2s', flexShrink: 0, marginRight: 12,
                  cursor: 'pointer', position: 'relative',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 10,
                    background: '#fff',
                    transition: 'transform .2s',
                    transform: clientHidePhotosEnabled ? 'translateX(-20px)' : 'translateX(0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                  }} />
                </div>
              </div>
            </div>

            {/* ── Gallery Code Toggle + Input ── */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', userSelect: 'none',
                }}
                onClick={() => setRequireGalleryCode(!requireGalleryCode)}
              >
                <div>
                  <span style={{
                    fontSize: 14, color: textPrimary, fontWeight: 600, display: 'block',
                    marginBottom: 4, letterSpacing: '0.01em',
                  }}>
                    קוד גישה לגלריה
                  </span>
                  <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                    דרשו קוד כניסה לצפייה בגלריה
                  </span>
                </div>
                <div style={{
                  width: 44, height: 24, borderRadius: 12, padding: 2,
                  background: requireGalleryCode ? accent : border,
                  transition: 'background .2s', flexShrink: 0, marginRight: 12,
                  cursor: 'pointer', position: 'relative',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 10,
                    background: '#fff',
                    transition: 'transform .2s',
                    transform: requireGalleryCode ? 'translateX(-20px)' : 'translateX(0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                  }} />
                </div>
              </div>
              {requireGalleryCode && (
                <input
                  type="text"
                  value={galleryCode}
                  onChange={(e) => setGalleryCode(e.target.value)}
                  placeholder="הזינו קוד גישה"
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 12, marginTop: 12,
                    border: `1px solid ${border}`,
                    background: bg, color: textPrimary, fontSize: 14,
                    fontFamily: 'Inter, sans-serif',
                    outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color .2s, box-shadow .2s',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${accentGlow}`; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = border; e.currentTarget.style.boxShadow = 'none'; }}
                />
              )}
            </div>

            {/* ── Download Tracking Toggle ── */}
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', userSelect: 'none',
                }}
                onClick={() => setTrackDownloads(!trackDownloads)}
              >
                <div>
                  <span style={{
                    fontSize: 14, color: textPrimary, fontWeight: 600, display: 'block',
                    marginBottom: 4, letterSpacing: '0.01em',
                  }}>
                    מעקב הורדות
                  </span>
                  <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.5 }}>
                    עקבו אחרי הורדות לפי אימייל
                  </span>
                </div>
                <div style={{
                  width: 44, height: 24, borderRadius: 12, padding: 2,
                  background: trackDownloads ? accent : border,
                  transition: 'background .2s', flexShrink: 0, marginRight: 12,
                  cursor: 'pointer', position: 'relative',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 10,
                    background: '#fff',
                    transition: 'transform .2s',
                    transform: trackDownloads ? 'translateX(-20px)' : 'translateX(0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                  }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={createGallery}
                disabled={creating || !newName.trim()}
                style={{
                  flex: 1,
                  background: creating || !newName.trim()
                    ? `rgba(99,102,241,.3)`
                    : `linear-gradient(135deg, ${accent}, ${accentLight})`,
                  color: '#fff', border: 'none', borderRadius: 12,
                  padding: '14px 0', fontSize: 15, fontWeight: 700, cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  opacity: creating || !newName.trim() ? 0.6 : 1,
                  transition: 'all .2s',
                  boxShadow: creating || !newName.trim() ? 'none' : `0 4px 16px ${accentGlow}`,
                  letterSpacing: '0.01em',
                }}
              >
                {creating ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'spin .6s linear infinite' }} />
                    יוצר...
                  </span>
                ) : 'צור גלריה'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1, background: 'transparent', color: textSecondary,
                  border: `1px solid ${border}`,
                  borderRadius: 12, padding: '14px 0', fontSize: 15, cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', transition: 'all .2s',
                  letterSpacing: '0.01em', fontWeight: 500,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = borderHover; e.currentTarget.style.color = textPrimary; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = border; e.currentTarget.style.color = textSecondary; }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
