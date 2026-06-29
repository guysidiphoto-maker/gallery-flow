// FeedStudio — the deep AI Visual OS planning + management surface.
//
// Flow:
//   1. Empty state → "תכנן את הפיד שלי"
//   2. Creative Brief Wizard (10 questions)
//   3. AI scoring (idempotent — only scores new top picks)
//   4. AI plan generation (3 multi-format variants)
//   5. Variants reveal — pick one
//   6. Workspace — calendar of multi-format post cards (single / carousel /
//      story / reel_cover / text_slide), per-card edit, gallery deep dive
//   7. Status flips (draft → scheduled → published) — manual until IG Graph
//
// All composable surfaces live in their own files:
//   - CreativeBriefWizard      — 10-question brief
//   - FeedStudioPreviews       — PostPreview + per-format cards
//   - GalleryDeepDive          — per-image AI scores, suggested usage
//   - FeedStudioControls       — AIDirectionBar + AdvancedSettingsPanel
//
// The single-post Editor lives in this file (replace photo + crop + schedule
// + status). Editing other formats opens a "soon" notice — Phase 2 work.

import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { supabase, storageUrl } from '../supabase'
import { authedFetch } from '../lib/authedFetch'
import { SignedImg } from './SignedImg'
import { CreativeBriefWizard, type Brief } from './CreativeBriefWizard'
import { PostPreview } from './FeedStudioPreviews'
import { GalleryDeepDive, type ImageScore } from './GalleryDeepDive'
import { EventPlanDialog } from './EventPlanDialog'
import { useToast } from './Toast'

// ── Types ──────────────────────────────────────────────────────────────
type PostFormat = 'single' | 'carousel' | 'story' | 'reel_cover' | 'text_slide'
type PostStatus = 'draft' | 'scheduled' | 'published'

interface Crop { aspect: '1:1' | '4:5' | '9:16'; focalX: number; focalY: number }

interface BasePost {
  id: string
  position: number | null
  format: PostFormat
  source_gallery_id: string | null
  reasoning: string
  scheduled_at?: string
  status?: PostStatus
}
interface SinglePost   extends BasePost { format: 'single';     image_id: string; caption: string; crop?: Crop }
interface CarouselPost extends BasePost { format: 'carousel';   image_ids: string[]; opening_caption: string; slide_captions: Array<{ image_id: string; caption: string }>; crops?: Record<string, Crop> }
interface StoryPost    extends BasePost { format: 'story';      image_ids: string[]; slide_meta: Array<{ image_id: string; overlay_text?: string; sticker?: string }>; crops?: Record<string, Crop> }
interface ReelCoverPost extends BasePost{ format: 'reel_cover'; image_id: string; hook_text: string; caption: string; crop?: Crop }
interface TextSlidePost extends BasePost{ format: 'text_slide'; image_id: null; headline: string; sub: string; background_color: string; text_color: string }

type Post = SinglePost | CarouselPost | StoryPost | ReelCoverPost | TextSlidePost

interface Variant {
  id: string
  label: string
  tagline: string
  rationale: string
  posts: Post[]
}

interface FeedPlanRowPosts {
  brief?: Brief
  variants?: Variant[]
  chosen_variant_id?: string
}

interface FeedPlan {
  id: string
  posts: FeedPlanRowPosts | unknown   // legacy rows may use a different shape
  status: 'draft' | 'accepted' | 'rejected' | 'published'
  created_at: string
}

interface TopPick { id: string; gallery_id: string; thumbnail_path: string | null; storage_path: string }
interface Gallery { id: string; name: string }

interface FeedStudioProps {
  clientId: string
  topPicks: TopPick[]
  galleries: Gallery[]
}

const STAGES = [
  { label: 'מנקד את כל ה-top picks',     sub: 'Claude Vision · ניתוח לפי תמונה · התאמת מותג' },
  { label: 'בונה אסטרטגיית פיד',          sub: 'אוסף ה-brief שלך + ניקוד התמונות' },
  { label: 'מציע 3 גישות שונות',          sub: 'קצב עיתונאי · סימפוניית קומפוזיציה · המשכיות מותג' },
  { label: 'כותב כותרות וקרוסלות',        sub: 'עברית עיתונאית · 8-14 מילים · ללא קלישאות' },
] as const

const VARIANT_ACCENT: Record<string, string> = {
  rhythm: '#D4FF00', symphony: '#7B61FF', continuity: '#F5A524',
}

const STATUS_LABEL: Record<PostStatus, string> = { draft: 'טיוטה', scheduled: 'מתוזמן', published: 'פורסם' }
const STATUS_COLOR: Record<PostStatus, string> = { draft: 'rgba(255,255,255,.45)', scheduled: '#D4FF00', published: '#3DDC84' }
const STATUS_DOT:   Record<PostStatus, string> = { draft: '📝', scheduled: '⏱', published: '✅' }

// ── Default scheduling (Mon/Wed/Fri 19:00, starting next Monday) ───────
function getDefaultSchedule(count: number): string[] {
  const out: string[] = []
  const now = new Date()
  const daysUntilMon = (8 - now.getDay()) % 7 || 7
  const start = new Date(now)
  start.setDate(now.getDate() + daysUntilMon)
  start.setHours(19, 0, 0, 0)
  const dayOffsets = [0, 2, 4]
  for (let i = 0; i < count; i++) {
    const week = Math.floor(i / 3)
    const dayOff = dayOffsets[i % 3]
    const dt = new Date(start)
    dt.setDate(start.getDate() + week * 7 + dayOff)
    out.push(dt.toISOString())
  }
  return out
}

function applyDefaultsToVariant(v: Variant): Variant {
  // Order posts by their existing `position` (nulls last) for stable scheduling.
  const sorted = v.posts.slice().sort((a, b) => {
    const pa = a.position ?? 999
    const pb = b.position ?? 999
    return pa - pb
  })
  const sched = getDefaultSchedule(sorted.length)
  return {
    ...v,
    posts: sorted.map((p, i) => ({
      ...p,
      scheduled_at: p.scheduled_at ?? sched[i],
      status: p.status ?? 'draft',
    })),
  }
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const days = ['א','ב','ג','ד','ה','ו','ש']
  return `יום ${days[d.getDay()]} · ${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} · ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

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

function weekKey(iso?: string): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  const day = d.getDay() || 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - (day - 1))
  return `${mon.getFullYear()}-${mon.getMonth() + 1}-${mon.getDate()}`
}

function weekLabel(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const day = d.getDay() || 7
  const mon = new Date(d); mon.setDate(d.getDate() - (day - 1))
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = (x: Date) => `${x.getDate().toString().padStart(2,'0')}/${(x.getMonth()+1).toString().padStart(2,'0')}`
  return `${fmt(mon)}–${fmt(sun)}`
}

// ── Component ───────────────────────────────────────────────────────────
export function FeedStudio({ clientId, topPicks, galleries }: FeedStudioProps) {
  const [plan, setPlan] = useState<FeedPlan | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [editPost, setEditPost] = useState<{ post: Post; variantId: string } | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [imageScores, setImageScores] = useState<Map<string, ImageScore>>(new Map())
  const [deepDiveGallery, setDeepDiveGallery] = useState<Gallery | null>(null)
  const [rescoring, setRescoring] = useState(false)
  const [eventPlanGallery, setEventPlanGallery] = useState<Gallery | null>(null)
  const [planRefreshKey, setPlanRefreshKey] = useState(0)
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const { showToast, ToastContainer } = useToast()

  const imageById   = useMemo(() => new Map(topPicks.map(p => [p.id, p])), [topPicks])
  const galleryById = useMemo(() => new Map(galleries.map(g => [g.id, g])), [galleries])

  // Plan-derived state.
  const variants: Variant[] = useMemo(() => {
    if (!plan) return []
    const posts = plan.posts as FeedPlanRowPosts | undefined
    return posts?.variants ?? []
  }, [plan])

  const chosenVariantId = useMemo(() => {
    if (!plan) return null
    return (plan.posts as FeedPlanRowPosts | undefined)?.chosen_variant_id ?? null
  }, [plan])

  const chosenVariant = useMemo(() => {
    if (!chosenVariantId) return null
    const v = variants.find(x => x.id === chosenVariantId)
    return v ? applyDefaultsToVariant(v) : null
  }, [chosenVariantId, variants])

  // Per-event mode: derive the queue of galleries that have top picks but
  // are NOT yet referenced by any planned post. Sorted by id (latest first
  // happens via the parent props order — galleries are passed in chronological
  // order from the dashboard fetch).
  const unplannedGalleries = useMemo(() => {
    const usedGalleryIds = new Set<string>()
    for (const v of variants) {
      for (const p of v.posts) {
        if (p.source_gallery_id) usedGalleryIds.add(p.source_gallery_id)
      }
    }
    // Count top_picks per gallery so we can show "N top picks" on each card.
    const picksByGallery = new Map<string, number>()
    for (const tp of topPicks) {
      picksByGallery.set(tp.gallery_id, (picksByGallery.get(tp.gallery_id) ?? 0) + 1)
    }
    return galleries
      .filter(g => (picksByGallery.get(g.id) ?? 0) >= 1 && !usedGalleryIds.has(g.id))
      .map(g => ({ id: g.id, name: g.name, topPicksCount: picksByGallery.get(g.id) ?? 0 }))
  }, [galleries, topPicks, variants])

  // Load latest plan + image scores on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data: planData }, { data: scoreRows }] = await Promise.all([
        supabase
          .from('feed_plans')
          .select('id, posts, status, created_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('image_ai_scores')
          .select('image_id, hero_score, carousel_score, story_score, atmosphere_score, people_density, brand_fit, social_potential, suggested_usage, suggested_crop_focal_x, suggested_crop_focal_y, rationale_he, scored_at')
          .in('image_id', topPicks.map(p => p.id)),
      ])
      if (cancelled) return
      if (planData) setPlan(planData as FeedPlan)
      const m = new Map<string, ImageScore>()
      for (const r of scoreRows ?? []) {
        m.set(r.image_id as string, {
          image_id: r.image_id as string,
          hero_score: Number(r.hero_score),
          carousel_score: Number(r.carousel_score),
          story_score: Number(r.story_score),
          atmosphere_score: Number(r.atmosphere_score),
          people_density: Number(r.people_density),
          brand_fit: Number(r.brand_fit),
          social_potential: Number(r.social_potential),
          suggested_usage: r.suggested_usage as ImageScore['suggested_usage'],
          suggested_crop_focal_x: Number(r.suggested_crop_focal_x),
          suggested_crop_focal_y: Number(r.suggested_crop_focal_y),
          rationale_he: r.rationale_he as string,
          scored_at: r.scored_at as string,
        })
      }
      setImageScores(m)
    })()
    return () => { cancelled = true }
  }, [clientId, topPicks, planRefreshKey])

  const startStageTimer = useCallback((seedStage = 0) => {
    setStage(seedStage)
    if (stageTimer.current) clearInterval(stageTimer.current)
    stageTimer.current = setInterval(() => {
      setStage(prev => (prev < STAGES.length - 1 ? prev + 1 : prev))
    }, 12000)
  }, [])

  const stopStageTimer = useCallback(() => {
    if (stageTimer.current) { clearInterval(stageTimer.current); stageTimer.current = null }
  }, [])

  // ── Generation pipeline ─────────────────────────────────────────────
  async function runScoring(): Promise<boolean> {
    setRescoring(true)
    try {
      const res = await authedFetch('/api/score-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setError(humanError(json?.error ?? `http_${res.status}`, json))
        return false
      }
      // Reload scores into state.
      const { data: scoreRows } = await supabase
        .from('image_ai_scores')
        .select('image_id, hero_score, carousel_score, story_score, atmosphere_score, people_density, brand_fit, social_potential, suggested_usage, suggested_crop_focal_x, suggested_crop_focal_y, rationale_he, scored_at')
        .in('image_id', topPicks.map(p => p.id))
      const m = new Map<string, ImageScore>()
      for (const r of scoreRows ?? []) {
        m.set(r.image_id as string, {
          image_id: r.image_id as string,
          hero_score: Number(r.hero_score),
          carousel_score: Number(r.carousel_score),
          story_score: Number(r.story_score),
          atmosphere_score: Number(r.atmosphere_score),
          people_density: Number(r.people_density),
          brand_fit: Number(r.brand_fit),
          social_potential: Number(r.social_potential),
          suggested_usage: r.suggested_usage as ImageScore['suggested_usage'],
          suggested_crop_focal_x: Number(r.suggested_crop_focal_x),
          suggested_crop_focal_y: Number(r.suggested_crop_focal_y),
          rationale_he: r.rationale_he as string,
          scored_at: r.scored_at as string,
        })
      }
      setImageScores(m)
      return true
    } finally {
      setRescoring(false)
    }
  }

  async function handleWizardSubmit(brief: Brief) {
    setShowWizard(false)
    setError(null)
    setGenerating(true)
    startStageTimer(0)

    // Step 1: ensure scoring is done (idempotent — fast if already cached).
    const ok = await runScoring()
    if (!ok) {
      stopStageTimer(); setGenerating(false); return
    }

    // Step 2: call generate-feed with brief.
    setStage(1)
    try {
      const res = await authedFetch('/api/generate-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, brief }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setError(humanError(json?.error ?? `http_${res.status}`, json))
      } else {
        setStage(STAGES.length - 1)
        await new Promise(r => setTimeout(r, 700))
        setPlan({
          id: json.plan.id,
          posts: { brief, variants: json.plan.variants },
          status: json.plan.status,
          created_at: json.plan.created_at,
        })
      }
    } catch {
      setError('שגיאה בלתי צפויה. נסו שוב בעוד רגע.')
    } finally {
      stopStageTimer(); setGenerating(false)
    }
  }

  // Read the Phase 3 server-issued session token. Empty string for legacy
  // (un-migrated) clients — in that case the header is omitted and the
  // backend's advisory mode allows the request through.
  function readSessionToken(): string {
    try { return sessionStorage.getItem(`client-token-${clientId}`) ?? '' } catch { return '' }
  }

  async function chooseVariant(variantId: string) {
    if (!plan) return
    setAccepting(variantId)
    try {
      const sessionToken = readSessionToken()
      const res = await fetch('/api/append-event-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'X-Client-Session': sessionToken } : {}),
        },
        body: JSON.stringify({ clientId, planId: plan.id, action: 'choose_variant', variantId }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json?.ok && json?.plan) {
        setPlan(json.plan as FeedPlan)
      } else {
        console.error('[FeedStudio] choose_variant failed', { status: res.status, json })
        showToast({ kind: 'error', text: 'שמירת הבחירה נכשלה. נסה שוב.' })
      }
    } catch (err) {
      console.error('[FeedStudio] choose_variant exception', err)
      showToast({ kind: 'error', text: 'שמירת הבחירה נכשלה. נסה שוב.' })
    } finally {
      setAccepting(null)
    }
  }

  async function unchooseVariant() {
    if (!plan) return
    try {
      const sessionToken = readSessionToken()
      const res = await fetch('/api/append-event-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'X-Client-Session': sessionToken } : {}),
        },
        body: JSON.stringify({ clientId, planId: plan.id, action: 'unchoose_variant' }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json?.ok && json?.plan) {
        setPlan(json.plan as FeedPlan)
      } else {
        console.error('[FeedStudio] unchoose_variant failed', { status: res.status, json })
        showToast({ kind: 'error', text: 'ההחלפה נכשלה. נסה שוב.' })
      }
    } catch (err) {
      console.error('[FeedStudio] unchoose_variant exception', err)
      showToast({ kind: 'error', text: 'ההחלפה נכשלה. נסה שוב.' })
    }
  }

  async function savePostEdit(updated: SinglePost, variantId: string) {
    if (!plan) return
    try {
      const sessionToken = readSessionToken()
      const res = await fetch('/api/append-event-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'X-Client-Session': sessionToken } : {}),
        },
        body: JSON.stringify({
          clientId, planId: plan.id, action: 'save_post_edit',
          variantId, post: updated,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json?.ok && json?.plan) {
        setPlan(json.plan as FeedPlan)
        setEditPost(null)
        showToast({ kind: 'success', text: 'נשמר בהצלחה.' })
      } else {
        console.error('[FeedStudio] save_post_edit failed', { status: res.status, json })
        showToast({ kind: 'error', text: 'שמירה נכשלה. נסה שוב.' })
      }
    } catch (err) {
      console.error('[FeedStudio] save_post_edit exception', err)
      showToast({ kind: 'error', text: 'שמירה נכשלה. נסה שוב.' })
    }
  }

  function startGenerate() {
    setError(null)
    setShowWizard(true)
  }

  // ── Render ─────────────────────────────────────────────────────────
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

      <ToastContainer />

      {/* Empty state — primary path is per-event planning */}
      {!plan && !generating && !error && !showWizard && (
        <EmptyState
          onStart={startGenerate}
          topPicksCount={topPicks.length}
          galleriesCount={galleries.length}
          unplannedGalleries={unplannedGalleries}
          onPlanEvent={(g) => setEventPlanGallery({ id: g.id, name: g.name })}
        />
      )}

      {/* Wizard */}
      {showWizard && (
        <CreativeBriefWizard
          onSubmit={handleWizardSubmit}
          onCancel={() => setShowWizard(false)}
        />
      )}

      {/* Generating */}
      {generating && <Generating stage={stage} />}

      {/* Error */}
      {error && !generating && (
        <div style={{ padding: 56, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#ff6b6b', marginBottom: 20, lineHeight: 1.6, maxWidth: 580, marginInline: 'auto' }}>
            {error}
          </div>
          <button onClick={() => { setError(null); startGenerate() }} style={btnPrimary}>נסה שוב</button>
        </div>
      )}

      {/* Workspace */}
      {plan && showWorkspace && chosenVariant && !generating && (
        <Workspace
          variant={chosenVariant}
          imageById={imageById}
          galleryById={galleryById}
          galleries={galleries}
          imageScores={imageScores}
          unplannedGalleries={unplannedGalleries}
          onEdit={(p) => setEditPost({ post: p, variantId: chosenVariant.id })}
          onRegenerate={startGenerate}
          onUnchoose={unchooseVariant}
          onDeepDive={(g) => setDeepDiveGallery(g)}
          onPlanEvent={(g) => setEventPlanGallery({ id: g.id, name: g.name })}
        />
      )}

      {/* Variants reveal */}
      {plan && !showWorkspace && variants.length > 0 && !generating && (
        <VariantsReveal
          plan={plan}
          variants={variants}
          imageById={imageById}
          galleryById={galleryById}
          accepting={accepting}
          onChoose={chooseVariant}
          onRegenerate={startGenerate}
        />
      )}

      {/* Single post editor */}
      {editPost && editPost.post.format === 'single' && (
        <SingleEditor
          initial={editPost.post}
          variantId={editPost.variantId}
          allTopPicks={topPicks}
          galleryById={galleryById}
          imageById={imageById}
          usedImageIds={chosenVariant ? new Set(chosenVariant.posts.flatMap(p => extractImageIds(p))) : new Set()}
          onClose={() => setEditPost(null)}
          onSave={(u) => savePostEdit(u, editPost.variantId)}
        />
      )}

      {/* Editor for non-single formats — phase-2 placeholder */}
      {editPost && editPost.post.format !== 'single' && (
        <div onClick={() => setEditPost(null)} style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, maxWidth: 480, animation: 'fs-fadeIn .25s both' }}>
            <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: '#D4FF00', marginBottom: 10, fontWeight: 600 }}>
              {editPost.post.format} · בקרוב
            </div>
            <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 24, fontWeight: 800, margin: '0 0 16px', color: '#fff' }}>
              עריכה מלאה לפורמט הזה תזמין בעדכון הקרוב
            </h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,.7)', lineHeight: 1.7, marginBottom: 16 }}>
              {editPost.post.format === 'carousel' && 'עריכת קרוסלה: סידור מחדש של שקופיות, עריכת כותרות, חיתוך פר-שקופית.'}
              {editPost.post.format === 'story' && 'עריכת סטוריז: סידור, טקסט אוברליי, סטיקרים, משך לכל שקופית.'}
              {editPost.post.format === 'reel_cover' && 'עריכת כריכת ריל: hook text, חיתוך, צבע ה-overlay.'}
              {editPost.post.format === 'text_slide' && 'עריכת שקופית טקסט: כותרת, משנה, צבע רקע, גופן.'}
            </p>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', marginBottom: 28, lineHeight: 1.7, padding: 12, background: 'rgba(255,255,255,.03)', borderRadius: 6 }}>
              <strong style={{ color: '#D4FF00' }}>הסבר ה-AI:</strong> {editPost.post.reasoning}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditPost(null)} style={btnGhost}>סגור</button>
            </div>
          </div>
        </div>
      )}

      {/* Gallery deep dive */}
      {deepDiveGallery && (
        <GalleryDeepDive
          galleryId={deepDiveGallery.id}
          galleryName={deepDiveGallery.name}
          topPicks={topPicks.filter(t => t.gallery_id === deepDiveGallery.id)}
          scores={imageScores}
          onClose={() => setDeepDiveGallery(null)}
          onRescore={runScoring}
          rescoring={rescoring}
        />
      )}

      {/* Per-event plan dialog */}
      {eventPlanGallery && (
        <EventPlanDialog
          clientId={clientId}
          galleryId={eventPlanGallery.id}
          galleryName={eventPlanGallery.name}
          topPicksCount={topPicks.filter(t => t.gallery_id === eventPlanGallery.id).length}
          imageById={imageById}
          onClose={() => setEventPlanGallery(null)}
          onAppended={() => {
            setEventPlanGallery(null)
            setPlanRefreshKey(k => k + 1)
          }}
        />
      )}
    </div>
  )
}

// Helper: extract every image_id touched by a post (for "used" detection).
function extractImageIds(p: Post): string[] {
  switch (p.format) {
    case 'single': return [p.image_id]
    case 'carousel': return p.image_ids
    case 'story': return p.image_ids
    case 'reel_cover': return [p.image_id]
    case 'text_slide': return []
  }
}

// ── EmptyState ──────────────────────────────────────────────────────────
// Per-event mode is the PRIMARY workflow: list every gallery that has top
// picks but no planned posts yet, with a "תכנן פוסטים" CTA on each. The
// big-bang wizard ("תכנן את כל הפיד") stays as a secondary CTA for first-time
// brand-voice setup or full campaign refreshes.
function EmptyState({
  onStart, topPicksCount, galleriesCount, unplannedGalleries, onPlanEvent,
}: {
  onStart: () => void
  topPicksCount: number
  galleriesCount: number
  unplannedGalleries: Array<{ id: string; name: string; topPicksCount: number }>
  onPlanEvent: (g: { id: string; name: string }) => void
}) {
  const hasEvents = unplannedGalleries.length > 0
  return (
    <div style={{
      padding: '56px 40px 80px', minHeight: 'calc(100vh - 220px)',
      animation: 'fs-fadeIn .5s both',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 18, fontWeight: 600 }}>
          Feed Studio
        </div>
        <h1 style={{
          fontFamily: 'Playfair Display, Georgia, serif',
          fontSize: 'clamp(34px, 5vw, 60px)', fontWeight: 800,
          margin: 0, letterSpacing: '-0.03em', lineHeight: 1.05, maxWidth: 900,
          marginInline: 'auto',
        }}>
          תכנון שבועי. אירוע אחר אירוע.
        </h1>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,.65)', maxWidth: 620, lineHeight: 1.7, margin: '20px auto 0', fontWeight: 400 }}>
          לכל אירוע שעולה למערכת — ה-AI מציע 1–3 פוסטים שמשתלבים בלוח השנה הקיים.
          לא צריך לתכנן הכל בבת אחת.
        </p>
      </div>

      {hasEvents && (
        <div style={{ maxWidth: 900, marginInline: 'auto', marginBottom: 56 }}>
          <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: '#D4FF00', marginBottom: 16, fontWeight: 700 }}>
            אירועים שמחכים לתכנון · {unplannedGalleries.length}
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12,
          }}>
            {unplannedGalleries.map(g => (
              <button
                key={g.id}
                onClick={() => onPlanEvent(g)}
                disabled={g.topPicksCount < 1}
                style={{
                  textAlign: 'right', padding: '16px 18px',
                  background: 'rgba(255,255,255,.04)',
                  border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: 10, cursor: g.topPicksCount > 0 ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', color: '#fff',
                  display: 'flex', flexDirection: 'column', gap: 8,
                  transition: 'border-color .2s, background .2s',
                  opacity: g.topPicksCount > 0 ? 1 : 0.45,
                }}
                onMouseEnter={e => {
                  if (g.topPicksCount > 0) {
                    e.currentTarget.style.borderColor = '#D4FF00'
                    e.currentTarget.style.background = 'rgba(212,255,0,.04)'
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'
                  e.currentTarget.style.background = 'rgba(255,255,255,.04)'
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{g.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
                    🖼 {g.topPicksCount} top picks
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#D4FF00', letterSpacing: '.04em' }}>
                    תכנן פוסטים →
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Secondary CTA — big-bang wizard */}
      <div style={{ textAlign: 'center', maxWidth: 720, marginInline: 'auto', paddingTop: hasEvents ? 24 : 16 }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginBottom: 14 }}>
          {hasEvents
            ? 'או — תכנן את כל הפיד מחדש (חד-פעמי)'
            : `${galleriesCount} גלריות · ${topPicksCount} top picks`}
        </div>
        <button
          onClick={onStart}
          disabled={topPicksCount < 9}
          style={{
            padding: '14px 28px', fontSize: 13, letterSpacing: '.04em',
            fontWeight: 700, fontFamily: 'inherit',
            background: hasEvents ? 'transparent' : '#D4FF00',
            color: hasEvents ? '#fafafa' : '#000',
            border: hasEvents ? '1px solid rgba(255,255,255,.2)' : 'none',
            borderRadius: 6, cursor: topPicksCount >= 9 ? 'pointer' : 'not-allowed',
            opacity: topPicksCount >= 9 ? 1 : 0.4,
            display: 'inline-flex', alignItems: 'center', gap: 10,
          }}
        >
          <span>✨</span>
          <span>{hasEvents ? 'תכנן את כל הפיד מאפס' : 'תכנן את הפיד שלי'}</span>
        </button>
        {topPicksCount < 9 && (
          <p style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
            צריך לפחות 9 top picks. יש כרגע {topPicksCount}.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Generating ──────────────────────────────────────────────────────────
function Generating({ stage }: { stage: number }) {
  return (
    <div style={{
      padding: '120px 56px', textAlign: 'center', minHeight: 'calc(100vh - 220px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: '#D4FF00', marginBottom: 28, fontWeight: 700 }}>
        Generating · ~1–2 דקות
      </div>
      <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 36, fontWeight: 800, margin: '0 0 56px', letterSpacing: '-0.02em' }}>
        {STAGES[stage].label}
      </h2>
      <div style={{ width: 360, marginBottom: 24, height: 1, background: 'rgba(255,255,255,.1)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: '#D4FF00', animation: `fs-progress ${(STAGES.length - stage) * 12}s linear forwards` }} />
      </div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,.45)', maxWidth: 480, lineHeight: 1.6 }}>{STAGES[stage].sub}</div>
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

// ── VariantsReveal ──────────────────────────────────────────────────────
function VariantsReveal({
  plan, variants, imageById, galleryById, accepting, onChoose, onRegenerate,
}: {
  plan: FeedPlan
  variants: Variant[]
  imageById: Map<string, TopPick>
  galleryById: Map<string, Gallery>
  accepting: string | null
  onChoose: (id: string) => void
  onRegenerate: () => void
}) {
  return (
    <div style={{ padding: '40px 40px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,.08)', flexWrap: 'wrap', gap: 16 }}>
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
          const formatCounts = v.posts.reduce((m, p) => {
            m[p.format] = (m[p.format] || 0) + 1
            return m
          }, {} as Record<string, number>)
          const formatSummary = Object.entries(formatCounts)
            .map(([f, n]) => `${n} ${formatLabel(f)}`).join(' · ')
          return (
            <div key={v.id} className="fs-variant" style={{ animationDelay: `${idx * 120}ms` }}>
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
                  <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 30, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em', color: '#fff' }}>
                    {v.label}
                  </h3>
                  {v.tagline && (
                    <div style={{ fontSize: 16, fontStyle: 'italic', color: 'rgba(255,255,255,.6)', marginBottom: 12, fontFamily: 'Playfair Display, Georgia, serif' }}>
                      "{v.tagline}"
                    </div>
                  )}
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,.7)', lineHeight: 1.7, margin: '0 0 8px', maxWidth: 720 }}>
                    {v.rationale}
                  </p>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 10 }}>
                    {v.posts.length} פוסטים · {formatSummary}
                  </div>
                </div>
                <div>
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
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {v.posts.map(post => (
                  <PostPreview
                    key={post.id}
                    post={post}
                    imageById={imageById}
                    galleryById={galleryById}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatLabel(f: string): string {
  switch (f) {
    case 'single': return 'בודד'
    case 'carousel': return 'קרוסלה'
    case 'story': return 'סטורי'
    case 'reel_cover': return 'ריל'
    case 'text_slide': return 'טקסט'
    default: return f
  }
}

// ── Workspace ───────────────────────────────────────────────────────────
function Workspace({
  variant, imageById, galleryById, galleries, imageScores,
  unplannedGalleries,
  onEdit, onRegenerate, onUnchoose, onDeepDive, onPlanEvent,
}: {
  variant: Variant
  imageById: Map<string, TopPick>
  galleryById: Map<string, Gallery>
  galleries: Gallery[]
  imageScores: Map<string, ImageScore>
  unplannedGalleries: Array<{ id: string; name: string; topPicksCount: number }>
  onEdit: (post: Post) => void
  onRegenerate: () => void
  onUnchoose: () => void
  onDeepDive: (g: Gallery) => void
  onPlanEvent: (g: { id: string; name: string }) => void
}) {
  const accent = VARIANT_ACCENT[variant.id] || '#D4FF00'
  const sortedPosts = variant.posts.slice().sort((a, b) =>
    new Date(a.scheduled_at || 0).getTime() - new Date(b.scheduled_at || 0).getTime(),
  )
  const counts = sortedPosts.reduce((acc, p) => {
    const s = (p.status ?? 'draft') as PostStatus
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, { draft: 0, scheduled: 0, published: 0 } as Record<PostStatus, number>)

  const byWeek = new Map<string, Post[]>()
  for (const p of sortedPosts) {
    const wk = weekKey(p.scheduled_at)
    if (!byWeek.has(wk)) byWeek.set(wk, [])
    byWeek.get(wk)!.push(p)
  }

  // Galleries with at least one post in this variant (for the deep-dive row).
  const galleriesWithPosts = useMemo(() => {
    const ids = new Set(variant.posts.map(p => p.source_gallery_id).filter((x): x is string => !!x))
    return galleries.filter(g => ids.has(g.id))
  }, [variant.posts, galleries])

  return (
    <div style={{ padding: '32px 40px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,.08)', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10, letterSpacing: '.32em', textTransform: 'uppercase', color: accent, marginBottom: 8, fontWeight: 700 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: accent }} />
            <span>Workspace · {variant.id}</span>
          </div>
          <h2 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 28, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            {variant.label}
          </h2>
          <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'rgba(255,255,255,.55)', flexWrap: 'wrap' }}>
            <span>📁 {galleries.length} גלריות</span>
            <span>🖼 {imageById.size} top picks</span>
            <span>🧠 {imageScores.size} עם ניקוד AI</span>
            <span style={{ color: STATUS_COLOR.draft }}>📝 {counts.draft}</span>
            <span style={{ color: STATUS_COLOR.scheduled }}>⏱ {counts.scheduled}</span>
            <span style={{ color: STATUS_COLOR.published }}>✅ {counts.published}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onUnchoose} style={btnGhost}><span>↶</span><span>החלף וריאנט</span></button>
          <button onClick={onRegenerate} style={btnGhost}><span>↻</span><span>ג'נרציה חדשה</span></button>
        </div>
      </div>

      {/* Events queue — galleries waiting to be planned */}
      {unplannedGalleries.length > 0 && (
        <div style={{
          marginBottom: 28, padding: '18px 20px', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(212,255,0,.06), rgba(212,255,0,.02))',
          border: '1px solid rgba(212,255,0,.2)',
        }}>
          <div style={{
            fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase',
            color: '#D4FF00', marginBottom: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>✨</span><span>אירועים מחכים לתכנון · {unplannedGalleries.length}</span>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', marginBottom: 12 }}>
            ה-AI יציע 1–3 פוסטים לאירוע — מותאמים לסגנון הפיד הקיים.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {unplannedGalleries.slice(0, 6).map(g => (
              <button
                key={g.id}
                onClick={() => onPlanEvent({ id: g.id, name: g.name })}
                style={{
                  padding: '10px 16px', fontSize: 12, fontWeight: 700,
                  background: 'rgba(212,255,0,.1)', color: '#D4FF00',
                  border: '1px solid rgba(212,255,0,.4)', borderRadius: 16,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                <span>{g.name}</span>
                <span style={{ color: 'rgba(212,255,0,.6)', fontWeight: 600 }}>· {g.topPicksCount}</span>
                <span>→</span>
              </button>
            ))}
            {unplannedGalleries.length > 6 && (
              <span style={{ padding: '10px 14px', fontSize: 11, color: 'rgba(255,255,255,.45)' }}>
                +{unplannedGalleries.length - 6} נוספים
              </span>
            )}
          </div>
        </div>
      )}

      {/* Source galleries — quick-access for Gallery Deep Dive */}
      {galleriesWithPosts.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 10, fontWeight: 600 }}>
            גלריות בשימוש בפיד · לחץ ל-Deep Dive
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {galleriesWithPosts.map(g => (
              <button
                key={g.id}
                onClick={() => onDeepDive(g)}
                style={{
                  padding: '8px 14px', fontSize: 12, fontWeight: 600,
                  background: 'rgba(255,255,255,.04)', color: '#fafafa',
                  border: '1px solid rgba(255,255,255,.12)', borderRadius: 16,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <span>🔍</span><span>{g.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {Array.from(byWeek.entries()).map(([wk, posts], wIdx) => (
          <div key={wk}>
            <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 14, fontWeight: 600 }}>
              שבוע {wIdx + 1} · {weekLabel(posts[0]?.scheduled_at)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {posts.map(post => (
                <PostPreview
                  key={post.id}
                  post={post}
                  imageById={imageById}
                  galleryById={galleryById}
                  onClick={() => onEdit(post)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <p style={{ textAlign: 'center', marginTop: 48, fontSize: 12, color: 'rgba(255,255,255,.35)', maxWidth: 640, marginInline: 'auto', lineHeight: 1.7 }}>
        לחיצה על כרטיס תפתח עריכה · קרוסלה / סטורי / ריל / טקסט = phase 2
      </p>
    </div>
  )
}

// ── SingleEditor (the heart of editing for single-format posts) ────────
function SingleEditor({
  initial, variantId, allTopPicks, galleryById, imageById, usedImageIds,
  onClose, onSave,
}: {
  initial: SinglePost
  variantId: string
  allTopPicks: TopPick[]
  galleryById: Map<string, Gallery>
  imageById: Map<string, TopPick>
  usedImageIds: Set<string>
  onClose: () => void
  onSave: (u: SinglePost) => void
}) {
  const [draft, setDraft] = useState<SinglePost>(initial)
  const [showReplace, setShowReplace] = useState(false)
  const accent = VARIANT_ACCENT[variantId] || '#D4FF00'

  const img = imageById.get(draft.image_id)
  const gallery = img ? galleryById.get(img.gallery_id) : undefined
  const crop = draft.crop ?? { aspect: '1:1', focalX: 0.5, focalY: 0.5 }
  const status = (draft.status ?? 'draft') as PostStatus

  function setCaption(s: string) { setDraft({ ...draft, caption: s }) }
  function setAspect(a: '1:1' | '4:5' | '9:16') { setDraft({ ...draft, crop: { ...crop, aspect: a } }) }
  function setFocal(x: number, y: number) { setDraft({ ...draft, crop: { ...crop, focalX: x, focalY: y } }) }
  function setSchedule(iso: string) { setDraft({ ...draft, scheduled_at: iso }) }
  function setStatusVal(s: PostStatus) { setDraft({ ...draft, status: s }) }
  function replaceImage(newId: string) { setDraft({ ...draft, image_id: newId }); setShowReplace(false) }

  function onImageClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    setFocal(x, y)
  }

  const aspect = crop.aspect === '1:1' ? '1/1' : crop.aspect === '4:5' ? '4/5' : '9/16'

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, maxWidth: 880, width: '100%', maxHeight: '92vh', overflow: 'auto', animation: 'fs-fadeIn .25s both' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: accent, marginBottom: 6, fontWeight: 600 }}>
              עריכת פוסט בודד
            </div>
            <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 22, fontWeight: 800, margin: 0, color: '#fff' }}>
              {fmtDate(draft.scheduled_at)}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: '#fff', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1.2fr)', gap: 24 }}>
          <div>
            <div style={labelStyle}>תמונה · לחץ לקביעת נקודת מיקוד</div>
            <div onClick={onImageClick} style={{ aspectRatio: aspect, position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', cursor: 'crosshair', border: '1px solid rgba(255,255,255,.1)' }}>
              {img && (
                <SignedImg
                  bucket="gallery-images"
                  path={img.thumbnail_path || img.storage_path}
                  alt=""
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${crop.focalX * 100}% ${crop.focalY * 100}%` }}
                />
              )}
              <div style={{ position: 'absolute', left: `${crop.focalX * 100}%`, top: `${crop.focalY * 100}%`, transform: 'translate(-50%, -50%)', width: 22, height: 22, borderRadius: 11, border: '2px solid #fff', boxShadow: '0 0 0 2px rgba(0,0,0,.6)', pointerEvents: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setAspect('1:1')} style={crop.aspect === '1:1' ? btnPillActive(accent) : btnPill}>1:1 ריבוע</button>
              <button onClick={() => setAspect('4:5')} style={crop.aspect === '4:5' ? btnPillActive(accent) : btnPill}>4:5 פיד</button>
              <button onClick={() => setAspect('9:16')} style={crop.aspect === '9:16' ? btnPillActive(accent) : btnPill}>9:16 סטורי</button>
              <button onClick={() => setShowReplace(true)} style={{ ...btnPill, marginInlineStart: 'auto' }}>🖼 החלף תמונה</button>
            </div>
            {gallery && (
              <div style={{ marginTop: 16, padding: '10px 12px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 6, fontSize: 12, color: 'rgba(255,255,255,.7)' }}>
                <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', marginBottom: 4, fontWeight: 600 }}>מקור</div>
                <div>גלריה: <strong>{gallery.name}</strong></div>
              </div>
            )}
          </div>

          <div>
            <div style={labelStyle}>כותרת — מה יופיע מתחת לפוסט</div>
            <textarea
              value={draft.caption}
              onChange={e => setCaption(e.target.value)}
              rows={4}
              style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, color: '#fff', fontSize: 15, lineHeight: 1.6, fontFamily: 'inherit', direction: 'rtl', resize: 'vertical' }}
            />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>
              {draft.caption.length} תווים · {draft.caption.split(/\s+/).filter(Boolean).length} מילים
            </div>

            <div style={{ height: 18 }} />
            <div style={labelStyle}>תאריך ושעה</div>
            <input
              type="datetime-local"
              value={isoToInputValue(draft.scheduled_at)}
              onChange={e => setSchedule(inputValueToIso(e.target.value))}
              style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, color: '#fff', fontSize: 14, fontFamily: 'inherit', colorScheme: 'dark' }}
            />

            <div style={{ height: 18 }} />
            <div style={labelStyle}>סטטוס</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['draft','scheduled','published'] as PostStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusVal(s)}
                  style={status === s
                    ? { ...btnPill, background: STATUS_COLOR[s], color: s === 'draft' ? '#fff' : '#000', border: `1px solid ${STATUS_COLOR[s]}` }
                    : btnPill
                  }
                >
                  <span>{STATUS_DOT[s]}</span>
                  <span style={{ marginInlineStart: 6 }}>{STATUS_LABEL[s]}</span>
                </button>
              ))}
            </div>

            <div style={{ height: 24 }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={btnGhost}>ביטול</button>
              <button onClick={() => onSave(draft)} style={{ ...btnPrimary, background: accent }}>
                <span>✓</span><span>שמור</span>
              </button>
            </div>
          </div>
        </div>

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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalStyle, maxWidth: 980, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontSize: 22, fontWeight: 800, margin: 0, color: '#fff' }}>
            בחר תמונה
          </h3>
          <button onClick={onClose} style={btnGhost}>סגור</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
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
                <SignedImg bucket="gallery-images" path={p.thumbnail_path || p.storage_path} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                {isUsed && <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.7)', borderRadius: 3, padding: '2px 6px', fontSize: 11, color: '#fff' }}>✓ בשימוש</div>}
                {isCurrent && <div style={{ position: 'absolute', bottom: 4, left: 4, background: '#D4FF00', borderRadius: 3, padding: '2px 6px', fontSize: 10, color: '#000', fontWeight: 700 }}>נוכחי</div>}
                {gallery && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 6px 4px', background: 'linear-gradient(transparent, rgba(0,0,0,.85))', fontSize: 10, color: 'rgba(255,255,255,.85)', fontWeight: 600 }}>{gallery.name}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function humanError(code: string, json?: unknown): string {
  const detail = (json as { detail?: string; have?: number })?.detail || ''
  const have = (json as { have?: number })?.have
  switch (code) {
    case 'anthropic_not_configured':       return 'מפתח Anthropic לא מוגדר ב-Vercel.'
    case 'supabase_not_configured':        return 'Supabase לא מוגדר ב-Vercel.'
    case 'no_galleries':                   return 'אין גלריות פעילות ללקוח הזה.'
    case 'need_at_least_9_top_picks':      return `צריך 9 top picks לפחות. יש כרגע ${have}.`
    case 'brief_required':                 return 'חסר ה-brief. נסו שוב מההתחלה.'
    case 'anthropic_call_failed':          return `קריאה ל-AI נכשלה. ${detail.slice(0, 80)}`
    case 'llm_returned_no_json':
    case 'llm_returned_bad_json':
    case 'llm_returned_wrong_variant_count':
    case 'llm_variant_no_posts':
    case 'llm_invalid_format':
    case 'llm_post_validation_failed':     return 'ה-AI החזיר פלט לא תקין. נסו שוב — בדרך כלל עובד בנסיון השני.'
    case 'persist_failed':                 return 'שמירה נכשלה. נסו שוב.'
    default:                                return 'שגיאה. ' + (detail || code)
  }
}

// ── Shared styles ────────────────────────────────────────────────────────
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
  return { ...btnPill, background: accent, color: '#000', borderColor: accent }
}
