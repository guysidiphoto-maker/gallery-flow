// FeedStudio — the AI Visual OS planning + management surface.
//
// Two surfaces, one component:
//
// 1. PLANNING (when no variant chosen yet)
//    - Empty state → CTA "תכנן את הפיד שלי"
//    - Click → ~40s thinking → 3 variant grids (rhythm / symphony / continuity)
//    - Each variant: clean photos (no overlay), captions in a list below the
//      grid, "בחר את הגישה הזו" CTA
//
// 2. WORKSPACE (after variant chosen — the operational layer)
//    - Status bar: source events · top picks · scheduled · published counts
//    - Calendar of 9 cards, grouped by week. Each card:
//        - Photo (with crop applied)
//        - Date + time slot (default: Mon/Wed/Fri 19:00 starting next week)
//        - Status pill: 📝 טיוטה · ⏱ מתוזמן · ✅ פורסם
//        - Source event label
//        - Caption preview
//    - Click any card → editor modal:
//        - Caption (editable textarea)
//        - Photo (with click-to-set focal point + 1:1 / 4:5 aspect toggle)
//        - "החלף תמונה" → grid of 30 top picks
//        - Date/time picker
//        - Source event link
//        - Status flow buttons (תזמן · סמן כפורסם · החזר לטיוטה)
//        - שמור / ביטול
//    - All edits persist to feed_plans.posts JSONB (the chosen variant's
//      posts[] array gets updated in place).
//
// Why this shape: production-company clients have a weekly event cadence.
// They need to see, at any time: what is being worked on, what's scheduled,
// what published, and edit/crop/swap any post. The 3-variant generator is
// the IDEATION step; the workspace is where the photographer lives.

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type CSSProperties,
} from 'react'
import { supabase, storageUrl } from '../supabase'

type AspectRatio = '1:1' | '4:5'
type PostStatus = 'draft' | 'scheduled' | 'published'

interface Crop {
  aspect: AspectRatio
  focalX: number   // 0..1, percentage from left
  focalY: number   // 0..1, percentage from top
}

interface Post {
  position: number
  image_id: string
  caption: string
  reasoning: string
  // Operational fields — populated when a variant is chosen and copied to
  // workspace. Optional so generation output without them still parses.
  scheduled_at?: string  // ISO timestamp
  status?: PostStatus
  crop?: Crop
}

interface Variant {
  id: string
  label: string
  tagline: string
  rationale: string
  posts: Post[]
}

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

interface TopPick {
  id: string
  gallery_id: string
  thumbnail_path: string | null
  storage_path: string
}

interface Gallery {
  id: string
  name: string
}

interface FeedStudioProps {
  clientId: string
  topPicks: TopPick[]
  galleries: Gallery[]
}

const STAGES = [
  { label: 'אוסף את 30 התמונות', sub: 'Top picks · קומפוזיציה · נושא' },
  { label: 'מנתח שפה ויזואלית', sub: 'אווירה · קצב · קול המותג' },
  { label: 'בונה 3 גישות שונות', sub: 'קצב עיתונאי · סימפוניית קומפוזיציה · המשכיות מותג' },
  { label: 'כותב כותרות בקול שלך', sub: 'אינסטגרם אמיתי · עברית עיתונאית · 8-14 מילים' },
] as const

const VARIANT_ACCENT: Record<string, string> = {
  rhythm:     '#D4FF00',
  symphony:   '#7B61FF',
  continuity: '#F5A524',
}

const STATUS_LABEL: Record<PostStatus, string> = {
  draft:     'טיוטה',
  scheduled: 'מתוזמן',
  published: 'פורסם',
}

const STATUS_COLOR: Record<PostStatus, string> = {
  draft:     'rgba(255,255,255,.45)',
  scheduled: '#D4FF00',
  published: '#3DDC84',
}

const STATUS_DOT: Record<PostStatus, string> = {
  draft:     '📝',
  scheduled: '⏱',
  published: '✅',
}

// ── Default scheduling ──────────────────────────────────────────────────
// Spreads 9 posts over 3 weeks at Mon / Wed / Fri 19:00 IST, starting from
// the upcoming Monday. The photographer can edit each one.
function getDefaultSchedule(): string[] {
  const out: string[] = []
  const now = new Date()
  // Monday = 1, Sunday = 0. JS: 0=Sun, 1=Mon, ..., 6=Sat.
  const daysUntilMon = (8 - now.getDay()) % 7 || 7  // always upcoming Monday
  const start = new Date(now)
  start.setDate(now.getDate() + daysUntilMon)
  start.setHours(19, 0, 0, 0)
  // 3 posts per week × 3 weeks. Days offset per slot from Monday: 0, 2, 4 (Mon, Wed, Fri).
  const dayOffsets = [0, 2, 4]
  for (let week = 0; week < 3; week++) {
    for (const dayOff of dayOffsets) {
      const dt = new Date(start)
      dt.setDate(start.getDate() + week * 7 + dayOff)
      out.push(dt.toISOString())
    }
  }
  return out
}

function applyDefaultsToVariant(v: Variant): Variant {
  const sched = getDefaultSchedule()
  const sortedPosts = v.posts.slice().sort((a, b) => a.position - b.position)
  return {
    ...v,
    posts: sortedPosts.map((p, i) => ({
      ...p,
      scheduled_at: p.scheduled_at ?? sched[i],
      status:       p.status ?? 'draft',
      crop:         p.crop ?? { aspect: '1:1', focalX: 0.5, focalY: 0.5 },
    })),
  }
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const days = ['א','ב','ג','ד','ה','ו','ש']
  const day = days[d.getDay()]
  const date = d.getDate().toString().padStart(2, '0')
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `יום ${day} · ${date}/${month} · ${hh}:${mm}`
}

// Format ISO into <input type="datetime-local"> compatible value (no TZ, local time).
function isoToInputValue(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function inputValueToIso(v: string): string {
  if (!v) return new Date().toISOString()
  return new Date(v).toISOString()
}

// ── Component ───────────────────────────────────────────────────────────
export function FeedStudio({ clientId, topPicks, galleries }: FeedStudioProps) {
  const [plan, setPlan] = useState<FeedPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [previewPost, setPreviewPost] = useState<{ post: Post; variantId: string } | null>(null)
  const [editPost, setEditPost] = useState<{ post: Post; variantId: string } | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const imageById = useMemo(() => new Map(topPicks.map(p => [p.id, p])), [topPicks])
  const galleryById = useMemo(() => new Map(galleries.map(g => [g.id, g])), [galleries])

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

  const chosenVariant = useMemo(() => {
    if (!chosenVariantId) return null
    const v = variants.find(x => x.id === chosenVariantId)
    return v ? applyDefaultsToVariant(v) : null
  }, [chosenVariantId, variants])

  // Load latest plan on mount.
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
    }, 9000)
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
    // Apply defaults so the workspace has scheduled_at / status / crop set.
    const updatedVariants = variants.map(v =>
      v.id === variantId ? applyDefaultsToVariant(v) : v,
    )
    const newPostsField: FeedPlanRowPosts = {
      variants: updatedVariants,
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

  async function unchooseVariant() {
    if (!plan || Array.isArray(plan.posts)) return
    const newPostsField: FeedPlanRowPosts = { variants: plan.posts.variants }
    await supabase
      .from('feed_plans')
      .update({ status: 'draft', accepted_at: null, posts: newPostsField })
      .eq('id', plan.id)
    setPlan({ ...plan, status: 'draft', posts: newPostsField })
  }

  // Save an edited post back into the chosen variant's posts array.
  async function savePostEdit(updated: Post, variantId: string) {
    if (!plan || Array.isArray(plan.posts)) return
    const newVariants = (plan.posts.variants ?? []).map(v => {
      if (v.id !== variantId) return v
      const newPosts = v.posts.map(p =>
        p.position === updated.position ? { ...p, ...updated } : p,
      )
      return { ...v, posts: newPosts }
    })
    const newPostsField: FeedPlanRowPosts = {
      variants: newVariants,
      chosen_variant_id: chosenVariantId ?? undefined,
    }
    const { error: upErr } = await supabase
      .from('feed_plans')
      .update({ posts: newPostsField })
      .eq('id', plan.id)
    if (upErr) {
      setError('שמירת השינויים נכשלה. נסו שוב.')
      return
    }
    setPlan({ ...plan, posts: newPostsField })
    setEditPost(null)
  }

  // ── Render decisions ────────────────────────────────────────────────
  const showWorkspace = chosenVariant !== null

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
        .fs-card { animation: fs-fadeIn .45s both; transition: border-color .2s, transform .2s; }
        .fs-card:hover { border-color: rgba(255,255,255,.22); transform: translateY(-2px); cursor: pointer; }
        .fs-variant { animation: fs-fadeIn .6s both; }
      `}</style>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!plan && !generating && !error && (
        <EmptyState onGenerate={generate} topPicksCount={topPicks.length} galleriesCount={galleries.length} />
      )}

      {/* ── Generating ──────────────────────────────────────────────────── */}
      {generating && <Generating stage={stage} />}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && !generating && (
        <div style={{ padding: 56, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#ff6b6b', marginBottom: 20 }}>{error}</div>
          <button onClick={() => { setError(null); generate() }} style={btnPrimary}>נסה שוב</button>
        </div>
      )}

      {/* ── Workspace (after variant chosen) ────────────────────────────── */}
      {plan && showWorkspace && chosenVariant && !generating && (
        <Workspace
          clientId={clientId}
          variant={chosenVariant}
          imageById={imageById}
          galleryById={galleryById}
          galleries={galleries}
          onPreview={(p) => setPreviewPost({ post: p, variantId: chosenVariant.id })}
          onEdit={(p) => setEditPost({ post: p, variantId: chosenVariant.id })}
          onRegenerate={generate}
          onUnchoose={unchooseVariant}
        />
      )}

      {/* ── Three-variant reveal (planning) ─────────────────────────────── */}
      {plan && !showWorkspace && variants.length > 0 && !generating && (
        <VariantsReveal
          plan={plan}
          variants={variants}
          imageById={imageById}
          accepting={accepting}
          chosenVariantId={chosenVariantId}
          onPreview={(p, vid) => setPreviewPost({ post: p, variantId: vid })}
          onChoose={chooseVariant}
          onRegenerate={generate}
        />
      )}

      {/* ── Reasoning preview drawer ────────────────────────────────────── */}
      {previewPost && (
        <PreviewDrawer
          post={previewPost.post}
          variantId={previewPost.variantId}
          onClose={() => setPreviewPost(null)}
          onEdit={() => {
            setEditPost(previewPost)
            setPreviewPost(null)
          }}
          showEdit={showWorkspace}
        />
      )}

      {/* ── Editor modal ────────────────────────────────────────────────── */}
      {editPost && chosenVariant && (
        <PostEditor
          initial={editPost.post}
          variantId={editPost.variantId}
          allTopPicks={topPicks}
          galleries={galleries}
          imageById={imageById}
          galleryById={galleryById}
          usedImageIds={new Set(chosenVariant.posts.map(p => p.image_id))}
          onClose={() => setEditPost(null)}
          onSave={(updated) => savePostEdit(updated, editPost.variantId)}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ════════════════════════════════════════════════════════════════════════
function EmptyState({
  onGenerate, topPicksCount, galleriesCount,
}: { onGenerate: () => void; topPicksCount: number; galleriesCount: number }) {
  return (
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
        ה-AI מנתח את 30 התמונות הטובות ומציע שלושה תכנונים שונים. בוחרים אחד —
        ונפתח workspace רציף לעריכה, חיתוך, תזמון ופרסום.
      </p>
      <button
        onClick={onGenerate}
        disabled={topPicksCount < 9}
        style={{
          padding: '18px 36px', fontSize: 15, letterSpacing: '.04em',
          fontWeight: 700, fontFamily: 'inherit',
          background: '#D4FF00', color: '#000', border: 'none',
          borderRadius: 8, cursor: topPicksCount >= 9 ? 'pointer' : 'not-allowed',
          opacity: topPicksCount >= 9 ? 1 : 0.4,
          display: 'inline-flex', alignItems: 'center', gap: 12,
        }}
      >
        <span>✨</span><span>תכנן את הפיד שלי</span>
      </button>
      {topPicksCount < 9 && (
        <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,.45)' }}>
          צריך לפחות 9 top picks. יש כרגע {topPicksCount} ב-{galleriesCount || 'גלריות'}.
        </p>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// GENERATING
// ════════════════════════════════════════════════════════════════════════
function Generating({ stage }: { stage: number }) {
  return (
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
  )
}

// ════════════════════════════════════════════════════════════════════════
// VARIANTS REVEAL (planning surface, after generation, before pick)
// ════════════════════════════════════════════════════════════════════════
function VariantsReveal({
  plan, variants, imageById, accepting, chosenVariantId,
  onPreview, onChoose, onRegenerate,
}: {
  plan: FeedPlan
  variants: Variant[]
  imageById: Map<string, TopPick>
  accepting: string | null
  chosenVariantId: string | null
  onPreview: (post: Post, variantId: string) => void
  onChoose: (variantId: string) => void
  onRegenerate: () => void
}) {
  return (
    <div style={{ padding: '40px 40px 80px' }}>
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
        <button onClick={onRegenerate} style={btnGhost}>
          <span>↻</span><span>תכנן מחדש</span>
        </button>
      </div>

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
                  {!isOtherChosen && !isChosen && (
                    <button
                      onClick={() => onChoose(v.id)}
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
                  )}
                </div>
              </div>

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
                      onClick={() => onPreview(post, v.id)}
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
                      onClick={() => onPreview(post, v.id)}
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
  )
}

// ════════════════════════════════════════════════════════════════════════
// WORKSPACE (after variant chosen — operational layer)
// ════════════════════════════════════════════════════════════════════════
function Workspace({
  variant, imageById, galleryById, galleries,
  onPreview, onEdit, onRegenerate, onUnchoose,
}: {
  clientId: string
  variant: Variant
  imageById: Map<string, TopPick>
  galleryById: Map<string, Gallery>
  galleries: Gallery[]
  onPreview: (post: Post) => void
  onEdit: (post: Post) => void
  onRegenerate: () => void
  onUnchoose: () => void
}) {
  const accent = VARIANT_ACCENT[variant.id] || '#D4FF00'
  const sortedPosts = variant.posts.slice().sort((a, b) =>
    new Date(a.scheduled_at || 0).getTime() - new Date(b.scheduled_at || 0).getTime(),
  )
  const counts = sortedPosts.reduce(
    (acc, p) => {
      const s = (p.status ?? 'draft') as PostStatus
      acc[s] = (acc[s] ?? 0) + 1
      return acc
    },
    { draft: 0, scheduled: 0, published: 0 } as Record<PostStatus, number>,
  )
  // Group posts by week-of-year so the calendar reads cleanly.
  const byWeek = new Map<string, Post[]>()
  for (const p of sortedPosts) {
    const wk = weekKey(p.scheduled_at)
    if (!byWeek.has(wk)) byWeek.set(wk, [])
    byWeek.get(wk)!.push(p)
  }

  return (
    <div style={{ padding: '32px 40px 80px' }}>
      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,.08)',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 10, letterSpacing: '.32em', textTransform: 'uppercase',
            color: accent, marginBottom: 8, fontWeight: 700,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: accent }} />
            <span>Workspace · {variant.id}</span>
          </div>
          <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 28, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            {variant.label}
          </h2>
          <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'rgba(255,255,255,.55)', flexWrap: 'wrap' }}>
            <span>📁 {galleries.length} גלריות</span>
            <span>🖼 {imageById.size} top picks</span>
            <span style={{ color: STATUS_COLOR.draft }}>📝 {counts.draft} טיוטה</span>
            <span style={{ color: STATUS_COLOR.scheduled }}>⏱ {counts.scheduled} מתוזמן</span>
            <span style={{ color: STATUS_COLOR.published }}>✅ {counts.published} פורסם</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onUnchoose} style={btnGhost}>
            <span>↶</span><span>החלף וריאנט</span>
          </button>
          <button onClick={onRegenerate} style={btnGhost}>
            <span>↻</span><span>ג'נרציה חדשה</span>
          </button>
        </div>
      </div>

      {/* Weeks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {Array.from(byWeek.entries()).map(([wk, posts], wIdx) => (
          <div key={wk}>
            <div style={{
              fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,.5)', marginBottom: 14, fontWeight: 600,
            }}>
              שבוע {wIdx + 1} · {weekLabel(posts[0]?.scheduled_at)}
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14,
            }}>
              {posts.map(post => {
                const img = imageById.get(post.image_id)
                const gallery = img ? galleryById.get(img.gallery_id) : undefined
                const status = (post.status ?? 'draft') as PostStatus
                const crop = post.crop ?? { aspect: '1:1', focalX: 0.5, focalY: 0.5 }
                const aspect = crop.aspect === '1:1' ? '1/1' : '4/5'
                return (
                  <div
                    key={post.position}
                    className="fs-card"
                    onClick={() => onEdit(post)}
                    style={{
                      background: 'rgba(255,255,255,.03)',
                      border: '1px solid rgba(255,255,255,.08)',
                      borderRadius: 8, overflow: 'hidden',
                      display: 'flex', flexDirection: 'column',
                    }}
                  >
                    <div style={{ aspectRatio: aspect, position: 'relative', background: '#000' }}>
                      {img && (
                        <img
                          src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
                          alt=""
                          style={{
                            position: 'absolute', inset: 0, width: '100%', height: '100%',
                            objectFit: 'cover',
                            objectPosition: `${crop.focalX * 100}% ${crop.focalY * 100}%`,
                          }}
                        />
                      )}
                      <div style={{
                        position: 'absolute', top: 8, right: 8,
                        fontSize: 11, fontWeight: 700, padding: '4px 9px',
                        background: 'rgba(0,0,0,.65)', borderRadius: 4,
                        color: STATUS_COLOR[status], letterSpacing: '.04em',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                        <span>{STATUS_DOT[status]}</span>
                        <span>{STATUS_LABEL[status]}</span>
                      </div>
                    </div>
                    <div style={{ padding: '12px 14px 14px' }}>
                      <div style={{
                        fontSize: 11, color: 'rgba(255,255,255,.5)', marginBottom: 6,
                        fontWeight: 600, letterSpacing: '.04em',
                      }}>
                        {fmtDate(post.scheduled_at)}
                      </div>
                      <div style={{
                        fontSize: 13, color: 'rgba(255,255,255,.88)', lineHeight: 1.5,
                        marginBottom: 10,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {post.caption}
                      </div>
                      {gallery && (
                        <div style={{
                          fontSize: 11, color: 'rgba(255,255,255,.4)',
                          paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.05)',
                        }}>
                          מקור: {gallery.name}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p style={{
        textAlign: 'center', marginTop: 48,
        fontSize: 12, color: 'rgba(255,255,255,.35)', maxWidth: 640, marginInline: 'auto', lineHeight: 1.7,
      }}>
        לחיצה על כרטיס תפתח עריכה: כותרת, חיתוך, החלפת תמונה, שעת פרסום, סטטוס
      </p>
    </div>
  )
}

function weekKey(iso?: string): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  // Monday-based week start.
  const day = d.getDay() || 7  // Sun=0 → 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - (day - 1))
  return `${mon.getFullYear()}-${mon.getMonth() + 1}-${mon.getDate()}`
}

function weekLabel(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const day = d.getDay() || 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - (day - 1))
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const fmt = (x: Date) => `${x.getDate().toString().padStart(2,'0')}/${(x.getMonth()+1).toString().padStart(2,'0')}`
  return `${fmt(mon)}–${fmt(sun)}`
}

// ════════════════════════════════════════════════════════════════════════
// PREVIEW DRAWER (read-only — used during planning)
// ════════════════════════════════════════════════════════════════════════
function PreviewDrawer({
  post, variantId, onClose, onEdit, showEdit,
}: {
  post: Post
  variantId: string
  onClose: () => void
  onEdit: () => void
  showEdit: boolean
}) {
  const accent = VARIANT_ACCENT[variantId] || 'rgba(255,255,255,.5)'
  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={{
        ...modalStyle, maxWidth: 540, animation: 'fs-fadeIn .25s both',
      }}>
        <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: accent, marginBottom: 14, fontWeight: 600 }}>
          גישה: {variantId} · משבצת {post.position}
        </div>
        <h3 style={{
          fontFamily: 'Heebo, Inter, sans-serif',
          fontSize: 22, fontWeight: 600, margin: '0 0 20px', lineHeight: 1.4, color: '#fff',
        }}>
          {post.caption}
        </h3>
        <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', marginBottom: 10, fontWeight: 600 }}>
          למה כאן
        </div>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,.78)', lineHeight: 1.7, marginBottom: 28 }}>
          {post.reasoning}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {showEdit && (
            <button onClick={onEdit} style={btnPrimary}>
              <span>✏️</span><span>ערוך פוסט</span>
            </button>
          )}
          <button onClick={onClose} style={btnGhost}>סגור</button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// POST EDITOR (the heart of the workspace)
// ════════════════════════════════════════════════════════════════════════
function PostEditor({
  initial, variantId, allTopPicks, galleries, imageById, galleryById, usedImageIds,
  onClose, onSave,
}: {
  initial: Post
  variantId: string
  allTopPicks: TopPick[]
  galleries: Gallery[]
  imageById: Map<string, TopPick>
  galleryById: Map<string, Gallery>
  usedImageIds: Set<string>
  onClose: () => void
  onSave: (updated: Post) => void
}) {
  const [draft, setDraft] = useState<Post>(initial)
  const [showReplace, setShowReplace] = useState(false)
  const [saving, setSaving] = useState(false)
  const accent = VARIANT_ACCENT[variantId] || '#D4FF00'

  const img = imageById.get(draft.image_id)
  const gallery = img ? galleryById.get(img.gallery_id) : undefined
  const crop = draft.crop ?? { aspect: '1:1', focalX: 0.5, focalY: 0.5 }
  const status = (draft.status ?? 'draft') as PostStatus

  function setCaption(s: string) { setDraft({ ...draft, caption: s }) }
  function setAspect(a: AspectRatio) { setDraft({ ...draft, crop: { ...crop, aspect: a } }) }
  function setFocal(x: number, y: number) {
    setDraft({ ...draft, crop: { ...crop, focalX: x, focalY: y } })
  }
  function setSchedule(iso: string) { setDraft({ ...draft, scheduled_at: iso }) }
  function setStatus(s: PostStatus) { setDraft({ ...draft, status: s }) }
  function replaceImage(newId: string) {
    setDraft({ ...draft, image_id: newId })
    setShowReplace(false)
  }

  function onImageClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    setFocal(x, y)
  }

  async function handleSave() {
    setSaving(true)
    onSave(draft)
  }

  const aspect = crop.aspect === '1:1' ? '1/1' : '4/5'

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={{
        ...modalStyle, maxWidth: 880, width: '100%', maxHeight: '92vh', overflow: 'auto',
        animation: 'fs-fadeIn .25s both',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: accent, marginBottom: 6, fontWeight: 600 }}>
              עריכת פוסט · משבצת {draft.position}
            </div>
            <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 24, fontWeight: 800, margin: 0, color: '#fff' }}>
              {fmtDate(draft.scheduled_at)}
            </h3>
          </div>
          <button onClick={onClose} aria-label="סגור" style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,.15)',
            color: '#fff', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1.2fr)', gap: 24,
        }}>
          {/* LEFT: photo + crop */}
          <div>
            <div style={labelStyle}>תמונה · לחץ לקביעת נקודת מיקוד</div>
            <div
              onClick={onImageClick}
              style={{
                aspectRatio: aspect, position: 'relative', background: '#000',
                borderRadius: 8, overflow: 'hidden', cursor: 'crosshair',
                border: '1px solid rgba(255,255,255,.1)',
              }}
            >
              {img && (
                <img
                  src={storageUrl('gallery-images', img.thumbnail_path || img.storage_path)}
                  alt=""
                  style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'cover',
                    objectPosition: `${crop.focalX * 100}% ${crop.focalY * 100}%`,
                  }}
                />
              )}
              <div style={{
                position: 'absolute',
                left: `${crop.focalX * 100}%`, top: `${crop.focalY * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: 22, height: 22, borderRadius: 11,
                border: '2px solid #fff', boxShadow: '0 0 0 2px rgba(0,0,0,.6)',
                pointerEvents: 'none',
              }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => setAspect('1:1')}
                style={crop.aspect === '1:1' ? btnPillActive(accent) : btnPill}
              >1:1 ריבוע</button>
              <button
                onClick={() => setAspect('4:5')}
                style={crop.aspect === '4:5' ? btnPillActive(accent) : btnPill}
              >4:5 פיד</button>
              <button
                onClick={() => setShowReplace(true)}
                style={{ ...btnPill, marginInlineStart: 'auto' }}
              >🖼 החלף תמונה</button>
            </div>
            {gallery && (
              <div style={{
                marginTop: 16, padding: '10px 12px',
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.07)',
                borderRadius: 6, fontSize: 12, color: 'rgba(255,255,255,.7)',
              }}>
                <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', marginBottom: 4, fontWeight: 600 }}>
                  מקור
                </div>
                <div>גלריה: <strong>{gallery.name}</strong></div>
                <div style={{ marginTop: 2, fontSize: 11, color: 'rgba(255,255,255,.45)' }}>
                  קובץ: {img?.storage_path?.split('/').pop()?.slice(0, 40) || '—'}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: caption + schedule + status */}
          <div>
            <div style={labelStyle}>כותרת — מה יופיע מתחת לפוסט</div>
            <textarea
              value={draft.caption}
              onChange={e => setCaption(e.target.value)}
              rows={4}
              style={{
                width: '100%', padding: '12px 14px',
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 8, color: '#fff',
                fontSize: 15, lineHeight: 1.6, fontFamily: 'inherit',
                direction: 'rtl', resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>
              {draft.caption.length} תווים · {draft.caption.split(/\s+/).filter(Boolean).length} מילים
            </div>

            <div style={{ height: 18 }} />

            <div style={labelStyle}>תאריך ושעה לפרסום</div>
            <input
              type="datetime-local"
              value={isoToInputValue(draft.scheduled_at)}
              onChange={e => setSchedule(inputValueToIso(e.target.value))}
              style={{
                width: '100%', padding: '12px 14px',
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 8, color: '#fff',
                fontSize: 14, fontFamily: 'inherit',
                colorScheme: 'dark',
              }}
            />

            <div style={{ height: 18 }} />

            <div style={labelStyle}>סטטוס</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['draft','scheduled','published'] as PostStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  style={status === s ? {
                    ...btnPill,
                    background: STATUS_COLOR[s],
                    color: s === 'draft' ? '#fff' : '#000',
                    border: `1px solid ${STATUS_COLOR[s]}`,
                  } : btnPill}
                >
                  <span>{STATUS_DOT[s]}</span>
                  <span style={{ marginInlineStart: 6 }}>{STATUS_LABEL[s]}</span>
                </button>
              ))}
            </div>

            <div style={{ height: 24 }} />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={btnGhost}>ביטול</button>
              <button onClick={handleSave} disabled={saving} style={{
                ...btnPrimary, background: accent, opacity: saving ? 0.6 : 1,
              }}>
                <span>✓</span><span>{saving ? 'שומר…' : 'שמור'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Replace photo picker */}
        {showReplace && (
          <ReplacePicker
            allTopPicks={allTopPicks}
            galleryById={galleryById}
            usedImageIds={usedImageIds}
            currentId={draft.image_id}
            onPick={replaceImage}
            onClose={() => setShowReplace(false)}
          />
        )}
      </div>
    </div>
  )
}

function ReplacePicker({
  allTopPicks, galleryById, usedImageIds, currentId, onPick, onClose,
}: {
  allTopPicks: TopPick[]
  galleryById: Map<string, Gallery>
  usedImageIds: Set<string>
  currentId: string
  onPick: (id: string) => void
  onClose: () => void
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)',
        backdropFilter: 'blur(8px)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        ...modalStyle, maxWidth: 980, width: '100%', maxHeight: '90vh', overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 22, fontWeight: 800, margin: 0, color: '#fff' }}>
            בחר תמונה
          </h3>
          <button onClick={onClose} style={btnGhost}>סגור</button>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '0 0 16px' }}>
          תמונות מסומנות ב-✓ כבר בשימוש בוריאנט הזה. ניתן להחליף לתמונה לא בשימוש.
        </p>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6,
        }}>
          {allTopPicks.map(p => {
            const gallery = galleryById.get(p.gallery_id)
            const isUsed = usedImageIds.has(p.id) && p.id !== currentId
            const isCurrent = p.id === currentId
            return (
              <div
                key={p.id}
                onClick={() => !isUsed && onPick(p.id)}
                style={{
                  aspectRatio: '1/1', position: 'relative', overflow: 'hidden',
                  background: '#111', borderRadius: 4,
                  cursor: isUsed ? 'not-allowed' : 'pointer',
                  opacity: isUsed ? 0.35 : 1,
                  border: isCurrent ? '2px solid #D4FF00' : '2px solid transparent',
                }}
              >
                <img
                  src={storageUrl('gallery-images', p.thumbnail_path || p.storage_path)}
                  alt=""
                  style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'cover',
                  }}
                />
                {isUsed && (
                  <div style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(0,0,0,.7)', borderRadius: 3,
                    padding: '2px 6px', fontSize: 11, color: '#fff',
                  }}>✓ בשימוש</div>
                )}
                {isCurrent && (
                  <div style={{
                    position: 'absolute', bottom: 4, left: 4,
                    background: '#D4FF00', borderRadius: 3,
                    padding: '2px 6px', fontSize: 10, color: '#000', fontWeight: 700,
                  }}>נוכחי</div>
                )}
                {gallery && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '20px 6px 4px',
                    background: 'linear-gradient(transparent, rgba(0,0,0,.85))',
                    fontSize: 10, color: 'rgba(255,255,255,.85)', fontWeight: 600,
                  }}>{gallery.name}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Hebrew error mapper + shared styles
// ════════════════════════════════════════════════════════════════════════
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

const overlayStyle: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
  backdropFilter: 'blur(8px)', zIndex: 100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
}

const modalStyle: CSSProperties = {
  background: '#14141b',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 12,
  padding: '28px 28px 24px',
  direction: 'rtl',
  color: 'rgba(255,255,255,.92)',
}

const labelStyle: CSSProperties = {
  fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,.55)', marginBottom: 8, fontWeight: 600,
}

const btnPrimary: CSSProperties = {
  padding: '14px 22px', fontSize: 13, fontWeight: 700, letterSpacing: '.04em',
  fontFamily: 'inherit', background: '#D4FF00', color: '#000',
  border: 'none', borderRadius: 6, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8,
}
const btnGhost: CSSProperties = {
  padding: '14px 22px', fontSize: 13, fontWeight: 600, letterSpacing: '.04em',
  fontFamily: 'inherit', background: 'transparent', color: '#fafafa',
  border: '1px solid rgba(255,255,255,.2)', borderRadius: 6, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8,
}
const btnPill: CSSProperties = {
  padding: '8px 14px', fontSize: 12, fontWeight: 600, letterSpacing: '.04em',
  fontFamily: 'inherit', background: 'rgba(255,255,255,.05)',
  color: 'rgba(255,255,255,.85)',
  border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center',
}
function btnPillActive(accent: string): CSSProperties {
  return {
    ...btnPill,
    background: accent,
    color: '#000',
    borderColor: accent,
  }
}
