// FeedStudio — the AI Visual OS planning surface inside the client dashboard.
//
// What it does:
//   1. Empty state with a hero CTA: "תכנן את הפיד שלי"
//   2. Click → ~40-second thinking sequence
//   3. Reveal: THREE variants (rhythm / symphony / continuity), each a 3×3
//      grid of CLEAN photos (no overlay, no burned-in text) + caption strip
//      below + variant rationale + "בחר את האופציה הזו" CTA
//   4. Photographer picks one → that variant becomes 'accepted'; the other
//      two stay as audit history.
//
// Why this shape: the brand decision (founder, 2026-05-06): photos stay
// clean; captions live below the post; AI replaces a paid social-media
// manager — strategy + curation + voice, not graphic-design overlays.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase, storageUrl } from '../supabase'

interface Post {
  position: number
  image_id: string
  caption: string
  reasoning: string
}

interface Variant {
  id: string          // 'rhythm' | 'symphony' | 'continuity'
  label: string
  tagline: string
  rationale: string
  posts: Post[]
}

// `posts` JSONB on the row holds either the new shape ({variants:[…]}) or,
// on legacy rows, just the array form. The component tolerates both.
interface FeedPlanRowPosts {
  variants?: Variant[]
  chosen_variant_id?: string
}

interface FeedPlan {
  id: string
  posts: FeedPlanRowPosts | Post[]
  status: 'draft' | 'accepted' | 'rejected' | 'published'
  created_at: string
}

interface FeedStudioProps {
  clientId: string
  topPicks: Array<{ id: string; gallery_id: string; thumbnail_path: string | null; storage_path: string }>
  galleries: Array<{ id: string; name: string }>
}

const STAGES = [
  { label: 'אוסף את 30 התמונות', sub: 'Top picks · קומפוזיציה · נושא' },
  { label: 'מנתח שפה ויזואלית', sub: 'אווירה · קצב · קול המותג' },
  { label: 'בונה 3 גישות שונות', sub: 'קצב עיתונאי · סימפוניית קומפוזיציה · המשכיות מותג' },
  { label: 'כותב כותרות בקול שלך', sub: 'אינסטגרם אמיתי · עברית עיתונאית · 8-14 מילים' },
] as const

const VARIANT_ACCENT: Record<string, string> = {
  rhythm:     '#D4FF00',  // electric — narrative arc
  symphony:   '#7B61FF',  // violet — composition harmony
  continuity: '#F5A524',  // amber — brand continuity
}

export function FeedStudio({ clientId, topPicks, galleries }: FeedStudioProps) {
  const [plan, setPlan] = useState<FeedPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selectedPost, setSelectedPost] = useState<{ post: Post; variantId: string } | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const imageById = useMemo(() => new Map(topPicks.map(p => [p.id, p])), [topPicks])

  // Normalize legacy single-variant rows so the component doesn't crash on them.
  const variants: Variant[] = useMemo(() => {
    if (!plan) return []
    if (Array.isArray(plan.posts)) {
      return [{
        id: 'legacy', label: 'הפיד הקודם', tagline: '',
        rationale: 'תוכנית קודמת — מומלץ לתכנן מחדש כדי לקבל 3 וריאנטים.',
        posts: plan.posts,
      }]
    }
    return plan.posts?.variants ?? []
  }, [plan])

  const chosenVariantId = useMemo(() => {
    if (!plan || Array.isArray(plan.posts)) return null
    return plan.posts?.chosen_variant_id ?? null
  }, [plan])

  // Load latest plan on mount so refreshes don't lose work.
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
    }, 9000) // 4 stages × 9s = 36s — matches typical 30-45s API call
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
        setStage(STAGES.length - 1)
        await new Promise(r => setTimeout(r, 700))
        // Server returns { id, variants, status, created_at }; normalize to row shape.
        const newPlan: FeedPlan = {
          id: json.plan.id,
          posts: { variants: json.plan.variants },
          status: json.plan.status,
          created_at: json.plan.created_at,
        }
        setPlan(newPlan)
      }
    } catch {
      setError('שגיאה בלתי צפויה. נסו שוב בעוד רגע.')
    } finally {
      stopStageTimer()
      setGenerating(false)
    }
  }

  async function chooseVariant(variantId: string) {
    if (!plan) return
    setAccepting(variantId)
    const newPostsField: FeedPlanRowPosts = {
      variants: variants,
      chosen_variant_id: variantId,
    }
    const { error: upErr } = await supabase
      .from('feed_plans')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        posts: newPostsField,
      })
      .eq('id', plan.id)
    setAccepting(null)
    if (upErr) {
      setError('שמירת הבחירה נכשלה. נסו שוב.')
      return
    }
    setPlan({ ...plan, status: 'accepted', posts: newPostsField })
  }

  return (
    <div style={{
      direction: 'rtl', minHeight: 'calc(100vh - 200px)',
      background: '#0a0a0f', color: 'rgba(255,255,255,.92)',
      borderRadius: 14, padding: 0, overflow: 'hidden', position: 'relative',
    }}>
      <style>{`
        @keyframes fs-fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fs-tileIn { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: scale(1); } }
        @keyframes fs-pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
        @keyframes fs-progress { from { width: 0%; } to { width: 100%; } }
        .fs-tile { animation: fs-tileIn .55s cubic-bezier(.16,1,.3,1) both; transition: transform .25s; }
        .fs-tile:hover { transform: scale(1.02); cursor: pointer; }
        .fs-variant { animation: fs-fadeIn .6s both; }
      `}</style>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!plan && !generating && !error && (
        <div style={{
          padding: '96px 56px', textAlign: 'center', minHeight: 'calc(100vh - 220px)',
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
            margin: 0, letterSpacing: '-0.03em', lineHeight: 1.05, maxWidth: 900,
          }}>
            שלוש גישות לפיד.<br/>בחר אחת.
          </h1>
          <p style={{
            fontSize: 17, color: 'rgba(255,255,255,.65)', maxWidth: 600,
            lineHeight: 1.7, margin: '24px auto 40px', fontWeight: 400,
          }}>
            ה-AI מנתח את 30 התמונות הטובות ומציע שלושה תכנונים שונים — קצב עיתונאי,
            סימפוניית קומפוזיציה, או המשכיות מותג. אותן תמונות, שלוש סיפורים. אתה בוחר.
          </p>
          <button
            onClick={generate}
            disabled={topPicks.length < 9}
            style={{
              padding: '18px 36px', fontSize: 15, letterSpacing: '.04em',
              fontWeight: 700, fontFamily: 'inherit',
              background: '#D4FF00', color: '#000', border: 'none',
              borderRadius: 8, cursor: topPicks.length >= 9 ? 'pointer' : 'not-allowed',
              opacity: topPicks.length >= 9 ? 1 : 0.4,
              display: 'inline-flex', alignItems: 'center', gap: 12,
            }}
          >
            <span>✨</span><span>תכנן את הפיד שלי</span>
          </button>
          {topPicks.length < 9 && (
            <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,.45)' }}>
              צריך לפחות 9 top picks. יש כרגע {topPicks.length} ב-{galleries.length || 'גלריות'}.
            </p>
          )}
        </div>
      )}

      {/* ── Generating ──────────────────────────────────────────────────── */}
      {generating && (
        <div style={{
          padding: '120px 56px', textAlign: 'center', minHeight: 'calc(100vh - 220px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: '#D4FF00', marginBottom: 28, fontWeight: 700 }}>
            Generating · ~40s
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
              animation: `fs-progress ${(STAGES.length - stage) * 9}s linear forwards`,
            }} />
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,.45)', maxWidth: 480, lineHeight: 1.6 }}>
            {STAGES[stage].sub}
          </div>
          <div style={{ marginTop: 56, display: 'flex', flexDirection: 'column', gap: 10, width: 360 }}>
            {STAGES.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, fontSize: 12,
                color: i === stage ? '#fff' : i < stage ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.2)',
                opacity: i === stage ? 1 : i < stage ? 0.7 : 0.4,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: 3,
                  background: i <= stage ? '#D4FF00' : 'rgba(255,255,255,.2)',
                  animation: i === stage ? 'fs-pulse 1.4s ease-in-out infinite' : 'none',
                }} />
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && !generating && (
        <div style={{ padding: 56, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#ff6b6b', marginBottom: 20 }}>{error}</div>
          <button onClick={() => { setError(null); generate() }} style={btnPrimary}>נסה שוב</button>
        </div>
      )}

      {/* ── Plan reveal — 3 variants ────────────────────────────────────── */}
      {plan && variants.length > 0 && !generating && (
        <div style={{ padding: '40px 40px 80px' }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 40, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,.08)',
            flexWrap: 'wrap', gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 8, fontWeight: 600 }}>
                Feed Studio · 3 וריאנטים
              </div>
              <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                {plan.status === 'accepted' ? 'הפיד אושר.' : 'בחר את הגישה שמתאימה לחודש הזה.'}
              </h2>
            </div>
            <button onClick={generate} style={btnGhost}>
              <span>↻</span><span>תכנן מחדש</span>
            </button>
          </div>

          {/* The three variants, stacked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 56 }}>
            {variants.map((v, idx) => {
              const accent = VARIANT_ACCENT[v.id] || '#D4FF00'
              const isChosen = chosenVariantId === v.id
              const isOtherChosen = chosenVariantId !== null && !isChosen
              return (
                <div
                  key={v.id}
                  className="fs-variant"
                  style={{
                    animationDelay: `${idx * 120}ms`,
                    opacity: isOtherChosen ? 0.45 : 1,
                    transition: 'opacity .3s',
                  }}
                >
                  {/* Variant header */}
                  <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 480px', minWidth: 280 }}>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        fontSize: 10, letterSpacing: '.32em', textTransform: 'uppercase',
                        color: accent, marginBottom: 12, fontWeight: 700,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: accent }} />
                        <span>גישה {String.fromCharCode(0x41 + idx)} · {v.id}</span>
                      </div>
                      <h3 style={{
                        fontFamily: 'Playfair Display, Georgia, serif', fontSize: 30, fontWeight: 800,
                        margin: '0 0 8px', letterSpacing: '-0.02em', color: '#fff',
                      }}>{v.label}</h3>
                      {v.tagline && (
                        <div style={{ fontSize: 16, fontStyle: 'italic', color: 'rgba(255,255,255,.6)', marginBottom: 12, fontFamily: 'Playfair Display, Georgia, serif' }}>
                          "{v.tagline}"
                        </div>
                      )}
                      <p style={{ fontSize: 14, color: 'rgba(255,255,255,.7)', lineHeight: 1.7, margin: 0, maxWidth: 720 }}>
                        {v.rationale}
                      </p>
                    </div>
                    <div>
                      {isChosen ? (
                        <span style={{
                          padding: '14px 22px', fontSize: 13, fontWeight: 700, letterSpacing: '.04em',
                          border: `1px solid ${accent}`, background: `${accent}14`,
                          color: accent, borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 8,
                        }}>
                          <span>✓</span><span>הגישה שנבחרה</span>
                        </span>
                      ) : !isOtherChosen ? (
                        <button
                          onClick={() => chooseVariant(v.id)}
                          disabled={accepting !== null}
                          style={{
                            padding: '14px 22px', fontSize: 13, fontWeight: 700, letterSpacing: '.04em',
                            fontFamily: 'inherit', background: accent, color: '#000',
                            border: 'none', borderRadius: 6, cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            opacity: accepting === v.id ? 0.6 : 1,
                          }}
                        >
                          <span>✓</span><span>{accepting === v.id ? 'שומר…' : 'בחר את הגישה הזו'}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* The 3×3 grid — clean photos, no overlay */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
                    maxWidth: 720, margin: 0,
                  }}>
                    {[1,2,3,4,5,6,7,8,9].map(pos => {
                      const post = v.posts.find(p => p.position === pos)
                      if (!post) {
                        return <div key={pos} style={{ aspectRatio: '1/1', background: 'rgba(255,255,255,.04)' }} />
                      }
                      const img = imageById.get(post.image_id)
                      return (
                        <div
                          key={pos}
                          className="fs-tile"
                          onClick={() => setSelectedPost({ post, variantId: v.id })}
                          style={{
                            aspectRatio: '1/1', position: 'relative', overflow: 'hidden',
                            background: 'rgba(255,255,255,.04)',
                            animationDelay: `${(idx * 9 + pos) * 35}ms`,
                          }}
                        >
                          {img && (
                            <img
                              src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
                              alt=""
                              style={{
                                position: 'absolute', inset: 0, width: '100%', height: '100%',
                                objectFit: 'cover',
                              }}
                            />
                          )}
                          {/* Position number — barely visible, top-right corner */}
                          <div style={{
                            position: 'absolute', top: 6, right: 6,
                            fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.85)',
                            background: 'rgba(0,0,0,.55)', borderRadius: 3,
                            padding: '2px 6px', letterSpacing: '.05em',
                          }}>{pos}</div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Caption strip — rendered BELOW the grid, like real Instagram */}
                  <div style={{
                    maxWidth: 720, marginTop: 18,
                    display: 'grid', gridTemplateColumns: '1fr', gap: 8,
                  }}>
                    {v.posts
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map(post => (
                        <div
                          key={post.position}
                          onClick={() => setSelectedPost({ post, variantId: v.id })}
                          style={{
                            display: 'flex', alignItems: 'baseline', gap: 12,
                            padding: '10px 12px', borderRadius: 6,
                            background: 'rgba(255,255,255,.03)',
                            border: '1px solid rgba(255,255,255,.05)',
                            cursor: 'pointer', transition: 'background .2s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.06)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
                        >
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: accent, letterSpacing: '.04em',
                            minWidth: 22, textAlign: 'center',
                          }}>{post.position}</span>
                          <span style={{
                            fontSize: 14, color: 'rgba(255,255,255,.85)', lineHeight: 1.5,
                          }}>{post.caption}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>

          <p style={{
            textAlign: 'center', marginTop: 56,
            fontSize: 12, color: 'rgba(255,255,255,.4)', maxWidth: 600, marginInline: 'auto', lineHeight: 1.7,
          }}>
            לחיצה על משבצת או על שורת כותרת תפתח את ה-reasoning של ה-AI · אותן 30 תמונות, שלוש גישות שונות
          </p>
        </div>
      )}

      {/* ── Reasoning drawer ─────────────────────────────────────────────── */}
      {selectedPost && (
        <div onClick={() => setSelectedPost(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)',
          zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            maxWidth: 540, width: '100%', background: '#14141b',
            border: '1px solid rgba(255,255,255,.1)', borderRadius: 12,
            padding: '32px 32px 24px', direction: 'rtl', animation: 'fs-fadeIn .25s both',
          }}>
            <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: VARIANT_ACCENT[selectedPost.variantId] || 'rgba(255,255,255,.5)', marginBottom: 14, fontWeight: 600 }}>
              גישה: {selectedPost.variantId} · משבצת {selectedPost.post.position}
            </div>
            <h3 style={{
              fontFamily: 'Heebo, Inter, sans-serif',
              fontSize: 22, fontWeight: 600, margin: '0 0 20px', lineHeight: 1.4, color: '#fff',
            }}>
              {selectedPost.post.caption}
            </h3>
            <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', marginBottom: 10, fontWeight: 600 }}>
              למה כאן
            </div>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,.78)', lineHeight: 1.7, marginBottom: 28 }}>
              {selectedPost.post.reasoning}
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
      return 'מפתח Anthropic לא מוגדר ב-Vercel.'
    case 'no_galleries':
      return 'אין גלריות פעילות ללקוח הזה.'
    case 'need_at_least_9_top_picks':
      return `צריך 9 top picks לפחות. יש כרגע ${have}.`
    case 'anthropic_call_failed':
      return `קריאה ל-AI נכשלה. ${detail.slice(0, 80)}`
    case 'llm_returned_no_json':
    case 'llm_returned_bad_json':
    case 'llm_returned_wrong_variant_count':
    case 'llm_variant_wrong_post_count':
      return 'ה-AI החזיר פלט לא תקין. נסו שוב — בדרך כלל עובד בנסיון השני.'
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
