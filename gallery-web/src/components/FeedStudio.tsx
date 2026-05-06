// FeedStudio — the AI Visual OS demo surface inside the client dashboard.
//
// The flow:
//   1. Empty state with a hero CTA: "Plan this month's feed"
//   2. Click → 25-second thinking sequence (4 staged stages, real progress
//      tied to the network call)
//   3. Reveal: 3×3 Color-Block Editorial grid, each tile with its photo,
//      brand-color background, headline, theme tag
//   4. Click any tile → drawer with "why" reasoning + caption + theme
//   5. "Approve" → flips status to accepted; "Regenerate" → new plan
//
// This component is the v1 of what the architecture doc calls Event-to-Feed.
// It deliberately uses CSS mix-blend-mode for the color-block visual rather
// than running real subject segmentation — the AI-thinking part is real
// (Claude writes captions, picks colors, plans positions); the visual
// transform is a CSS overlay so the photographer sees it live without a
// 30-second SAM 3 round trip per photo. SAM 3 is a v2 upgrade.

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, storageUrl } from '../supabase'

// Five-color palette for Color-Block Editorial. Stays in lock-step with the
// API's COLOR_KEYS enum and the architecture doc §3.5.4. If you change one
// you change the other; the API persists 'red'|'cream'|... as keys, the
// renderer maps to hex.
const COLOR_HEX: Record<string, string> = {
  red:    '#E63946',
  cream:  '#F1FAEE',
  teal:   '#A8DADC',
  blue:   '#457B9D',
  indigo: '#1D3557',
}

// The AI also picks a text color — but for MVP we derive it from the bg
// (cream/teal → dark text, red/blue/indigo → light). Keeps the prompt
// shorter and is good-enough.
function textOnColor(color: string): string {
  return color === 'cream' || color === 'teal' ? '#141413' : '#fafafa'
}

interface Post {
  position: number
  image_id: string
  caption: string
  theme: string
  color: keyof typeof COLOR_HEX
  reasoning: string
}

interface FeedPlan {
  id: string
  posts: Post[]
  status: 'draft' | 'accepted' | 'rejected' | 'published'
  created_at: string
}

interface FeedStudioProps {
  clientId: string
  topPicks: Array<{ id: string; gallery_id: string; thumbnail_path: string | null; storage_path: string }>
  galleries: Array<{ id: string; name: string }>
}

const STAGES = [
  { label: 'Analyzing 30 top picks', sub: 'Composition · density · subject classification' },
  { label: 'Detecting brand language', sub: 'Palette · rhythm · visual voice from past events' },
  { label: 'Composing color-block layout', sub: 'Cross-tile balance · color rotation · row variation' },
  { label: 'Writing captions in your voice', sub: 'Magazine headlines · 3-5 words · Hebrew editorial' },
] as const

export function FeedStudio({ clientId, topPicks, galleries }: FeedStudioProps) {
  const [plan, setPlan] = useState<FeedPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Image lookup by id — the AI returns image_ids; we need full image rows
  // to render the thumbnail. Build the index once.
  const imageById = new Map(topPicks.map(p => [p.id, p]))

  // Load the latest accepted/draft plan on mount so the photographer doesn't
  // re-generate every refresh.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('feed_plans')
        .select('id, posts, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!cancelled && data) setPlan(data as FeedPlan)
    })()
    return () => { cancelled = true }
  }, [clientId])

  const startStageTimer = useCallback(() => {
    setStage(0)
    if (stageTimer.current) clearInterval(stageTimer.current)
    stageTimer.current = setInterval(() => {
      setStage(prev => (prev < STAGES.length - 1 ? prev + 1 : prev))
    }, 6000) // 4 stages × 6s = 24s, the network call usually finishes inside this window
  }, [])

  const stopStageTimer = useCallback(() => {
    if (stageTimer.current) {
      clearInterval(stageTimer.current)
      stageTimer.current = null
    }
  }, [])

  async function generate() {
    setError(null)
    setGenerating(true)
    startStageTimer()
    try {
      const res = await fetch('/api/generate-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        const code = json?.error || `http_${res.status}`
        setError(humanError(code, json))
      } else {
        // Pin to final stage briefly so the user feels the work landing.
        setStage(STAGES.length - 1)
        await new Promise(r => setTimeout(r, 800))
        setPlan(json.plan)
      }
    } catch {
      setError('שגיאה בלתי צפויה. נסו שוב בעוד רגע.')
    } finally {
      stopStageTimer()
      setGenerating(false)
    }
  }

  async function accept() {
    if (!plan) return
    await supabase
      .from('feed_plans')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', plan.id)
    setPlan({ ...plan, status: 'accepted' })
  }

  return (
    <div style={{
      direction: 'rtl', minHeight: 'calc(100vh - 200px)',
      background: '#0a0a0f', color: 'rgba(255,255,255,.92)',
      borderRadius: 14, padding: 0, overflow: 'hidden',
      position: 'relative',
    }}>
      <style>{`
        @keyframes fs-fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fs-tileIn { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: scale(1); } }
        @keyframes fs-pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
        @keyframes fs-progress { from { width: 0%; } to { width: 100%; } }
        .fs-tile { animation: fs-tileIn .6s cubic-bezier(.16,1,.3,1) both; }
        .fs-tile:hover { transform: scale(1.02); transition: transform .25s; cursor: pointer; }
      `}</style>

      {/* ── Empty state — no plan yet ─────────────────────────────────── */}
      {!plan && !generating && !error && (
        <div style={{
          padding: '96px 56px', textAlign: 'center',
          minHeight: 'calc(100vh - 220px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'fs-fadeIn .5s both',
        }}>
          <div style={{
            fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,.5)', marginBottom: 24, fontWeight: 600,
          }}>Feed Studio</div>
          <h1 style={{
            fontFamily: 'Playfair Display, Georgia, serif',
            fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 800,
            margin: 0, letterSpacing: '-0.03em', lineHeight: 1.05,
            maxWidth: 900,
          }}>
            Plan this month's<br/>feed in 25 seconds.
          </h1>
          <p style={{
            fontSize: 17, color: 'rgba(255,255,255,.65)', maxWidth: 580,
            lineHeight: 1.7, margin: '24px auto 40px', fontWeight: 400,
          }}>
            Drop one event. The AI returns nine on-brand posts arranged as a Color-Block Editorial grid,
            captions in your voice, ready for approval.
          </p>
          <button onClick={generate} disabled={topPicks.length < 9} style={{
            padding: '18px 36px', fontSize: 15, letterSpacing: '.04em',
            fontWeight: 700, fontFamily: 'inherit',
            background: '#D4FF00', color: '#000', border: 'none',
            borderRadius: 8, cursor: topPicks.length >= 9 ? 'pointer' : 'not-allowed',
            opacity: topPicks.length >= 9 ? 1 : 0.4,
            display: 'inline-flex', alignItems: 'center', gap: 12,
          }}>
            <span>✨</span>
            <span>תכנן את החודש שלי</span>
          </button>
          {topPicks.length < 9 && (
            <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,.45)' }}>
              צריך לפחות 9 top picks ב-{galleries.length || 'הגלריות'} כדי לתכנן פיד. יש כרגע {topPicks.length}.
            </p>
          )}
        </div>
      )}

      {/* ── Generating — staged thinking sequence ─────────────────────── */}
      {generating && (
        <div style={{
          padding: '120px 56px', textAlign: 'center',
          minHeight: 'calc(100vh - 220px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: '#D4FF00', marginBottom: 28, fontWeight: 700 }}>
            Generating · ~25s
          </div>
          <h2 style={{
            fontFamily: 'Playfair Display, Georgia, serif', fontSize: 36, fontWeight: 800,
            margin: '0 0 56px', letterSpacing: '-0.02em',
          }}>
            {STAGES[stage].label}
          </h2>
          <div style={{ width: 360, marginBottom: 24, height: 1, background: 'rgba(255,255,255,.1)', overflow: 'hidden', position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: 0, background: '#D4FF00',
              animation: `fs-progress ${(STAGES.length - stage) * 6}s linear forwards`,
            }} />
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,.45)', maxWidth: 480, lineHeight: 1.6 }}>
            {STAGES[stage].sub}
          </div>
          {/* Stage list — earlier stages mute, current pulses, future faded */}
          <div style={{ marginTop: 56, display: 'flex', flexDirection: 'column', gap: 10, width: 360 }}>
            {STAGES.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, fontSize: 12,
                color: i === stage ? '#fff' : i < stage ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.2)',
                opacity: i === stage ? 1 : i < stage ? 0.7 : 0.4,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: 3,
                  background: i < stage ? '#D4FF00' : i === stage ? '#D4FF00' : 'rgba(255,255,255,.2)',
                  animation: i === stage ? 'fs-pulse 1.4s ease-in-out infinite' : 'none',
                }} />
                <span style={{ direction: 'ltr' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────────────── */}
      {error && !generating && (
        <div style={{ padding: 56, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#ff6b6b', marginBottom: 20 }}>{error}</div>
          <button onClick={() => { setError(null); generate() }} style={btnPrimary}>נסה שוב</button>
        </div>
      )}

      {/* ── Plan reveal — 3×3 grid ────────────────────────────────────── */}
      {plan && !generating && (
        <div style={{ padding: '40px 40px 80px' }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 32, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,.08)',
            flexWrap: 'wrap', gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 8, fontWeight: 600 }}>
                Feed Studio · Color-Block Editorial
              </div>
              <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                {plan.status === 'accepted' ? 'הפיד אושר.' : 'הפיד מוכן לבדיקה.'}
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={generate} style={btnGhost}>
                <span>↻</span><span>תכנן מחדש</span>
              </button>
              {plan.status === 'draft' && (
                <button onClick={accept} style={btnPrimary}>
                  <span>✓</span><span>אישור הפיד</span>
                </button>
              )}
              {plan.status === 'accepted' && (
                <span style={{
                  padding: '14px 22px', fontSize: 13, fontWeight: 700, letterSpacing: '.04em',
                  border: '1px solid rgba(212,255,0,.4)', background: 'rgba(212,255,0,.08)',
                  color: '#D4FF00', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  <span>✓</span><span>אושר</span>
                </span>
              )}
            </div>
          </div>

          {/* The grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
            maxWidth: 720, margin: '0 auto',
          }}>
            {[1,2,3,4,5,6,7,8,9].map(pos => {
              const post = plan.posts.find(p => p.position === pos)
              if (!post) {
                return <div key={pos} style={{ aspectRatio: '4/5', background: 'rgba(255,255,255,.04)' }} />
              }
              const img = imageById.get(post.image_id)
              const bg = COLOR_HEX[post.color] || '#444'
              const txt = textOnColor(post.color)
              return (
                <div
                  key={pos}
                  className="fs-tile"
                  onClick={() => setSelectedPost(post)}
                  style={{
                    aspectRatio: '4/5', position: 'relative', overflow: 'hidden',
                    background: bg, animationDelay: `${pos * 60}ms`,
                  }}
                >
                  {img && (
                    <img
                      src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
                      alt=""
                      style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%',
                        objectFit: 'cover', mixBlendMode: 'multiply',
                      }}
                    />
                  )}
                  {/* Theme chip */}
                  <div style={{
                    position: 'absolute', top: 12, right: 12,
                    fontSize: 9, letterSpacing: '.18em', padding: '4px 10px',
                    background: 'rgba(0,0,0,.55)', color: '#fff', textTransform: 'uppercase',
                    fontWeight: 600, zIndex: 2,
                  }}>{post.theme}</div>
                  {/* Caption */}
                  <div style={{
                    position: 'absolute', bottom: 14, right: 14, left: 14,
                    fontFamily: 'Inter, Heebo, sans-serif',
                    fontWeight: 800, fontSize: 18, lineHeight: 1.05,
                    color: txt, zIndex: 3, textAlign: 'right',
                    letterSpacing: '-.01em',
                  }}>
                    {post.caption}
                  </div>
                </div>
              )
            })}
          </div>

          <p style={{
            textAlign: 'center', marginTop: 32,
            fontSize: 12, color: 'rgba(255,255,255,.4)', maxWidth: 600, marginInline: 'auto',
          }}>
            לחיצה על משבצת תפתח את ה-reasoning של ה-AI · "למה בחרתי את התמונה הזו, את הצבע הזה, ואת הכותרת הזו"
          </p>
        </div>
      )}

      {/* ── Reasoning drawer ──────────────────────────────────────────── */}
      {selectedPost && (
        <div onClick={() => setSelectedPost(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
          backdropFilter: 'blur(8px)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            maxWidth: 540, width: '100%', background: '#14141b',
            border: '1px solid rgba(255,255,255,.1)', borderRadius: 12,
            padding: '32px 32px 24px', direction: 'rtl',
            animation: 'fs-fadeIn .25s both',
          }}>
            <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 14, fontWeight: 600 }}>
              Position {selectedPost.position} · {selectedPost.color}
            </div>
            <h3 style={{
              fontFamily: 'Playfair Display, Georgia, serif',
              fontSize: 28, fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.02em',
            }}>
              {selectedPost.caption}
            </h3>
            <div style={{
              display: 'inline-block', padding: '4px 12px',
              background: 'rgba(212,255,0,.08)', border: '1px solid rgba(212,255,0,.3)',
              color: '#D4FF00', fontSize: 11, fontWeight: 600, letterSpacing: '.18em',
              textTransform: 'uppercase', marginBottom: 24,
            }}>{selectedPost.theme}</div>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,.78)', lineHeight: 1.7, marginBottom: 28 }}>
              {selectedPost.reasoning}
            </p>
            <button onClick={() => setSelectedPost(null)} style={btnGhost}>סגור</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hebrew error mapper ─────────────────────────────────────────────────
function humanError(code: string, json?: unknown): string {
  const detail = (json as { detail?: string; have?: number })?.detail || ''
  const have = (json as { have?: number })?.have
  switch (code) {
    case 'anthropic_not_configured':
      return 'מפתח Anthropic לא מוגדר ב-Vercel. צריך להוסיף ANTHROPIC_API_KEY ב-environment variables.'
    case 'no_galleries':
      return 'אין גלריות פעילות ללקוח הזה.'
    case 'need_at_least_9_top_picks':
      return `צריך 9 top picks לפחות. יש כרגע ${have}. סמנו עוד תמונות עם כוכב.`
    case 'anthropic_call_failed':
      return `קריאה ל-AI נכשלה. ${detail.slice(0, 80)}`
    case 'llm_returned_no_json':
    case 'llm_returned_bad_json':
    case 'llm_returned_wrong_count':
      return 'ה-AI החזיר פלט לא תקין. נסו שוב — לרוב עובד בנסיון השני.'
    case 'persist_failed':
      return 'שמירה נכשלה. נסו שוב.'
    default:
      return 'שגיאה. ' + (detail || code)
  }
}

const btnPrimary: React.CSSProperties = {
  padding: '14px 22px', fontSize: 13, fontWeight: 700, letterSpacing: '.04em',
  fontFamily: 'inherit', background: '#D4FF00', color: '#000',
  border: 'none', borderRadius: 6, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8,
}
const btnGhost: React.CSSProperties = {
  padding: '14px 22px', fontSize: 13, fontWeight: 600, letterSpacing: '.04em',
  fontFamily: 'inherit', background: 'transparent', color: '#fafafa',
  border: '1px solid rgba(255,255,255,.2)', borderRadius: 6, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8,
}
