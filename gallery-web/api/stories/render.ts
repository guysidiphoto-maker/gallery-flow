// stories/render.ts — Stories Phase 2: synchronous Remotion render on
// Vercel Functions (NOT AWS Lambda).
//
// ─── Architecture ──────────────────────────────────────────────────────────
// This endpoint:
//   1. Auth-checks the caller and verifies they own the gallery.
//   2. Idempotently INSERTs a `story_renders` row (partial UNIQUE protects
//      against double-clicks racing two concurrent renders).
//   3. Flips status to 'rendering', then runs Remotion headlessly INSIDE the
//      same Vercel Function — using @sparticuz/chromium for a Lambda-compatible
//      Chromium binary and @remotion/renderer for the headless render driver.
//   4. Uploads the resulting mp4 to the `gallery-stories` Supabase Storage
//      bucket at `{gallery_id}/{render_id}.mp4` using the service-role client.
//   5. Updates the row to status='completed' with output_url + duration +
//      file size; on failure flips to status='failed' with a truncated message.
//
// The companion `/api/stories/status` endpoint bridges the `'ready'` row to
// the public `stories` table for the viewer (idempotent — keyed on the
// storage path).
//
// ─── Cost / timing reality check ──────────────────────────────────────────
//   Cold-start cost:
//     ~3-5s for Chromium init (@sparticuz/chromium unpacks the brotli'd Chrome
//     binary into /tmp and spawns it). Subsequent renders on the same warm
//     container reuse the binary; the bundler is also already on disk so the
//     marginal cost drops to ~1-2s.
//
//   Render time per second of output:
//     ~2-3x video length at 1080x1920 @ 30fps on this 3008MB / 2 vCPU profile.
//     A 30s story takes ~60-90s of wall time. The 'cinematic' / 'vintage'
//     styles trend toward the slow end (heavier filters per frame).
//
//   Memory footprint:
//     Peak ~1.5-2GB during the final mp4 mux + the headless render's
//     ImageBitmap raster. We allocate the full 3008MB (Vercel max) so a
//     borderline 60s render doesn't OOM mid-mux.
//
//   Hard ceiling:
//     maxDuration=300s in vercel.json. That gives us roughly 100s of output
//     video before a render exceeds the function timeout — well past every
//     style's default duration (20-35s). Anything longer should move to
//     Workflow DevKit (DurableAgent) instead of this synchronous path.
//
// ─── Idempotency model ─────────────────────────────────────────────────────
//   - Partial UNIQUE on story_renders (gallery_id, style) WHERE status IN
//     ('queued','rendering') means concurrent clicks cannot double-fire.
//   - This endpoint first SELECTs any in-flight row for (gallery, style)
//     and returns it instead of trying to INSERT (cheaper than waiting
//     for the UNIQUE to reject).
//
// ─── Fail-closed env contract ──────────────────────────────────────────────
//   If SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY is missing
//   we return server_misconfigured BEFORE doing any work. There are NO
//   renderer-specific env vars — the Chromium binary ships in the function
//   bundle (@sparticuz/chromium) and the Remotion site is pre-bundled at
//   build time into /public/stories-bundle (see scripts/bundle-stories.mjs).
//
// Request:  POST { galleryId: uuid, style: 'clean', photoIds?: uuid[] }
// Response: 200 { ok: true, status: 'completed' | 'rendering' | 'queued',
//                 renderId, outputUrl?, durationSeconds?, fileSizeBytes? }
//           400 { ok: false, error: 'invalid_…' }
//           401 { ok: false, error: 'unauthenticated' }
//           403 { ok: false, error: 'not_owner' }
//           404 { ok: false, error: 'gallery_not_found' }
//           405 { ok: false, error: 'method_not_allowed' }
//           500 { ok: false, error: 'server_misconfigured'
//                              | 'renderer_not_ready'
//                              | 'render_failed'
//                              | 'gallery_lookup_failed'
//                              | 'render_insert_failed' }

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../../server/sentryServer.js'
import { promises as fs, existsSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveAndValidatePlan, checkRenderFeasibility, type OwnerImage } from './_scenePlanGuard.js'

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// All 5 styles accepted at the API boundary (matches STORY_STYLES in
// gallery-web/src/lib/storyRender.ts). Only 'clean' currently has a wired
// Remotion composition (id: 'Clean'); the others 202-accept but the renderer
// rejects with 'composition_not_found' until each style ships a composition.
const ALLOWED_STYLES = ['clean', 'cinematic', 'fast-social', 'elegant', 'vintage'] as const
type AllowedStyle = typeof ALLOWED_STYLES[number]

// Style → Remotion composition id. Add new compositions to
// stories-remotion/src/Root.tsx and map them here.
const COMPOSITION_BY_STYLE: Record<AllowedStyle, string> = {
  'clean': 'Clean',
  'cinematic': 'Clean',     // TODO: ship dedicated composition
  'fast-social': 'Clean',   // TODO: ship dedicated composition
  'elegant': 'Clean',       // TODO: ship dedicated composition
  'vintage': 'Clean',       // TODO: ship dedicated composition
}

const STORAGE_BUCKET = 'gallery-stories'
const GALLERY_IMAGES_BUCKET = 'gallery-images'
const DEFAULT_STORY_DURATION_SECONDS = 30
const STORY_MAX_PHOTOS = 60

// The render runs Remotion inside a memory-constrained Vercel Function. Feeding
// Chromium the raw 2048px / 4-5MB gallery originals makes its image decoder run
// out of memory: the first frame throws "EncodingError: The source image cannot
// be decoded." and then the tab dies with "Page crashed!" — the render never
// leaves 0%. (Observed in prod on gallery originals; NOT reproduced by the local
// QA harness precisely because that harness downscales every photo to <=1280px
// long-edge before serving it.)
//
// Fix: never hand the renderer an original. Pull a downscaled variant through
// Supabase Storage's on-the-fly image-transformation endpoint
// (/render/image/public/...), bounded to <=1280x1920 (contain, no crop). Each
// frame drops from ~4.6MB to ~150-250KB, so the decoder stays well within the
// function's memory. Matches the QA downscale that renders cleanly end-to-end.
const RENDER_IMAGE_MAX_W = 1280
const RENDER_IMAGE_MAX_H = 1920
const RENDER_IMAGE_QUALITY = 78

/** Build a render-safe (downscaled) URL for a gallery-images storage path. */
function renderImageUrl(storagePath: string): string {
  const q = `width=${RENDER_IMAGE_MAX_W}&height=${RENDER_IMAGE_MAX_H}&resize=contain&quality=${RENDER_IMAGE_QUALITY}`
  return `${SUPABASE_URL}/storage/v1/render/image/public/${GALLERY_IMAGES_BUCKET}/${storagePath}?${q}`
}

// A synchronous render is bounded by vercel.json maxDuration (300s). Any row
// still 'queued'/'rendering' beyond this window is an orphan from a function
// that timed out or crashed mid-render — it must NOT block future renders via
// the in-flight unique index. We treat such rows as stale, flip them to
// 'failed', and let a fresh render proceed. Set comfortably above 300s.
const STALE_RENDER_MS = 6 * 60 * 1000

// Loose UUID v4-ish regex. We only need to reject obviously-malformed input
// at the edge; Supabase's typed `eq('id', …)` will hard-reject anything that
// slips through.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isAllowedStyle(value: unknown): value is AllowedStyle {
  return typeof value === 'string' && (ALLOWED_STYLES as readonly string[]).includes(value)
}

// ── Brand kit shape (mirrors stories-remotion/src/Clean.tsx::BrandKit) ─────
// Kept local to the route so a refactor of the composition's prop shape
// doesn't accidentally break the wire format the frontend has been seeing.
interface RenderBrandKit {
  studio_name?: string
  logo?: { url?: string }
  colors?: { primary?: string; ink?: string; paper?: string }
  voice?: { tagline?: string; signature?: string }
  social?: { instagram?: string; tiktok?: string; website?: string }
}

// The brand_kit JSONB column (migration 072) has a richer shape than the
// composition consumes. We project just the fields the renderer needs so the
// composition isn't coupled to the storage schema.
function projectBrandKit(raw: unknown): RenderBrandKit | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const b = raw as Record<string, unknown>
  const studio_name =
    typeof b.studio_name === 'string' ? b.studio_name : undefined
  const logo = (b.logo && typeof b.logo === 'object')
    ? { url: (b.logo as Record<string, unknown>).url as string | undefined }
    : undefined
  const colorsRaw = (b.colors && typeof b.colors === 'object')
    ? (b.colors as Record<string, unknown>)
    : {}
  const colors = {
    primary: colorsRaw.primary as string | undefined,
    ink: colorsRaw.ink as string | undefined,
    paper: colorsRaw.paper as string | undefined,
  }
  const voiceRaw = (b.voice && typeof b.voice === 'object')
    ? (b.voice as Record<string, unknown>)
    : {}
  const voice = {
    tagline: voiceRaw.tagline as string | undefined,
    signature: voiceRaw.signature as string | undefined,
  }
  const socialRaw = (b.social && typeof b.social === 'object')
    ? (b.social as Record<string, unknown>)
    : {}
  const social = {
    instagram: socialRaw.instagram as string | undefined,
    tiktok: socialRaw.tiktok as string | undefined,
    website: socialRaw.website as string | undefined,
  }
  // If nothing usable, return undefined so the composition skips the brand
  // surfaces entirely (no intro/outro/watermark).
  const hasAnything =
    !!studio_name || !!logo?.url ||
    !!colors.primary || !!colors.ink || !!colors.paper ||
    !!voice.tagline || !!voice.signature ||
    !!social.instagram || !!social.tiktok || !!social.website
  if (!hasAnything) return undefined
  return { studio_name, logo, colors, voice, social }
}

// Story compositions load the brand logo as an <Img> inside headless Chromium.
// A logo whose pixel dimensions exceed the decoder's limit (Skia's max bitmap /
// ~2^14 px per side) throws "The source image cannot be decoded" and crashes
// the entire render page — one real brand kit shipped a 19913×7983 PNG. Neither
// Chromium NOR Supabase's on-the-fly transform can process a source that large
// (the transform returns "resolution too large to process"), so we downscale it
// here, server-side, with sharp — which streams via libvips and handles it — and
// inline the result as a small data URL that Chromium decodes trivially. On ANY
// failure we return undefined so the render proceeds logo-less (typography /
// other brand surfaces still show) rather than crashing. Fail-open, mirroring
// the non-http logo drop in _scenePlanGuard.
const LOGO_MAX_EDGE = 1080
const LOGO_FETCH_TIMEOUT_MS = 15_000
async function safeLogoDataUrl(rawUrl: unknown): Promise<string | undefined> {
  if (typeof rawUrl !== 'string' || !/^https?:\/\//i.test(rawUrl)) return undefined
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), LOGO_FETCH_TIMEOUT_MS)
    let bytes: Buffer
    try {
      const resp = await fetch(rawUrl, { signal: ctrl.signal })
      if (!resp.ok) return undefined
      bytes = Buffer.from(await resp.arrayBuffer())
    } finally {
      clearTimeout(timer)
    }
    const sharp = (await import('sharp')).default
    const out = await sharp(bytes, { limitInputPixels: false })
      .resize({ width: LOGO_MAX_EDGE, height: LOGO_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer()
    return `data:image/png;base64,${out.toString('base64')}`
  } catch (err) {
    console.warn(
      '[stories/render] logo downscale failed; rendering without logo:',
      err instanceof Error ? err.message : String(err),
    )
    return undefined
  }
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    // Hard-fail loudly — without env we cannot auth-check, and silently
    // returning success would let any caller "queue" a render.
    return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  }

  // ── Input validation ───────────────────────────────────────────────────
  const body = (req.body || {}) as {
    galleryId?: unknown
    style?: unknown
    photoIds?: unknown
    scenePlan?: unknown
  }
  const galleryId = typeof body.galleryId === 'string' ? body.galleryId.trim() : ''
  const styleRaw = body.style

  if (!galleryId || !UUID_RE.test(galleryId)) {
    return res.status(400).json({ ok: false, error: 'invalid_gallery_id' })
  }

  // Story Studio path: an edited ScenePlan is supplied. It is fully validated +
  // hardened server-side (below) before any render. The in-flight row uses a
  // dedicated style key so studio renders idempotency-lock per gallery without
  // colliding with the legacy auto styles.
  const hasScenePlan = body.scenePlan !== undefined && body.scenePlan !== null
  let style: string
  if (hasScenePlan) {
    if (typeof body.scenePlan !== 'object') {
      return res.status(400).json({ ok: false, error: 'invalid_scene_plan' })
    }
    // FIRST-RELEASE render cap. Reject over-long stories BEFORE creating any row
    // so an unsupported render can never start (and never orphans a job). The
    // client shows the same limit; this is the authoritative gate.
    const feasible = checkRenderFeasibility(body.scenePlan)
    if (!feasible.ok) {
      return res.status(400).json({ ok: false, error: 'story_too_long', message: feasible.reason })
    }
    style = 'studio'
  } else {
    if (!isAllowedStyle(styleRaw)) {
      return res.status(400).json({ ok: false, error: 'invalid_style', allowed: ALLOWED_STYLES })
    }
    style = styleRaw
  }

  // photoIds is optional. When the dashboard curates a specific shot list +
  // order we honor it; otherwise the renderer picks the gallery's full
  // sort_order. Validate shape + per-id UUID + cap size to STORY_MAX_PHOTOS so
  // a runaway client can't fan out.
  let photoIds: string[] | undefined
  if (body.photoIds !== undefined && body.photoIds !== null) {
    if (!Array.isArray(body.photoIds)) {
      return res.status(400).json({ ok: false, error: 'invalid_photo_ids' })
    }
    if (body.photoIds.length > STORY_MAX_PHOTOS) {
      return res.status(400).json({ ok: false, error: 'too_many_photos', max: STORY_MAX_PHOTOS })
    }
    photoIds = []
    for (const raw of body.photoIds) {
      if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
        return res.status(400).json({ ok: false, error: 'invalid_photo_ids' })
      }
      photoIds.push(raw)
    }
  }

  // ── Auth check: only the gallery owner may trigger a render ───────────
  const authHeader = req.headers.authorization || ''
  const accessToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : ''
  if (!accessToken) {
    return res.status(401).json({ ok: false, error: 'unauthenticated' })
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken)
  if (userErr || !userData?.user) {
    return res.status(401).json({ ok: false, error: 'unauthenticated' })
  }
  const userId = userData.user.id

  // Service-role read of gallery + owner + brand kit.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: gallery, error: galleryErr } = await adminClient
    .from('galleries')
    .select('id, business_id, businesses!inner(user_id, brand_kit)')
    .eq('id', galleryId)
    .maybeSingle()
  if (galleryErr) {
    console.error('[stories/render] gallery fetch failed', galleryErr.message)
    return res.status(500).json({ ok: false, error: 'gallery_lookup_failed' })
  }
  if (!gallery) {
    return res.status(404).json({ ok: false, error: 'gallery_not_found' })
  }
  const biz = (gallery as { businesses?:
    | { user_id?: string; brand_kit?: unknown }
    | Array<{ user_id?: string; brand_kit?: unknown }>
  }).businesses
  const bizRow = Array.isArray(biz) ? biz[0] : biz
  const ownerUserId = bizRow?.user_id
  if (!ownerUserId || ownerUserId !== userId) {
    return res.status(403).json({ ok: false, error: 'not_owner' })
  }
  const brandKit = projectBrandKit(bizRow?.brand_kit)

  // ── Idempotency + stale-render sweep ───────────────────────────────────
  // Short-circuit if a render is genuinely in flight (duplicate-click / double
  // submit protection). But a row left 'rendering' past STALE_RENDER_MS is an
  // orphan from a timed-out function — flip it to 'failed' so it releases the
  // in-flight unique lock and this fresh render can proceed.
  const { data: inflight } = await adminClient
    .from('story_renders')
    .select('id, status, created_at')
    .eq('gallery_id', galleryId)
    .eq('style', style)
    .in('status', ['queued', 'rendering'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (inflight) {
    const ageMs = Date.now() - new Date(inflight.created_at as string).getTime()
    if (ageMs < STALE_RENDER_MS) {
      return res.status(200).json({
        ok: true,
        status: inflight.status,
        renderId: inflight.id,
        message: 'render_in_progress',
      })
    }
    // Stale orphan: reap it, then fall through to start a fresh render.
    await adminClient
      .from('story_renders')
      .update({ status: 'failed', error_message: 'render timed out (stale job reaped)' })
      .eq('id', inflight.id)
      .in('status', ['queued', 'rendering'])
    console.warn(`[stories/render] reaped stale ${inflight.status} row ${inflight.id} (age ${Math.round(ageMs / 1000)}s)`)
  }

  // ── Persist a story_renders row in 'queued' state ─────────────────────
  // We insert BEFORE the render so the row exists even if the function
  // crashes mid-render (operator can still find the orphan).
  const { data: rowInserted, error: insertErr } = await adminClient
    .from('story_renders')
    .insert({
      gallery_id: galleryId,
      style,
      photo_ids: photoIds ?? [],
      status: 'queued',
      requested_by: userId,
    })
    .select('id')
    .single()
  if (insertErr || !rowInserted) {
    // Most likely cause: the partial UNIQUE rejected because another
    // request raced past our SELECT above. Re-query and return that row
    // instead of bubbling a 500 to the UI.
    const { data: raced } = await adminClient
      .from('story_renders')
      .select('id, status')
      .eq('gallery_id', galleryId)
      .eq('style', style)
      .in('status', ['queued', 'rendering'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (raced) {
      return res.status(200).json({
        ok: true,
        status: raced.status,
        renderId: raced.id,
        message: 'render_in_progress',
      })
    }
    console.error('[stories/render] insert failed', insertErr?.message)
    return res.status(500).json({ ok: false, error: 'render_insert_failed' })
  }
  const renderId = rowInserted.id as string

  // ── Render! ────────────────────────────────────────────────────────────
  // Flip to 'rendering' so a polling client sees progress before the long
  // synchronous render finishes. The composition runs INSIDE this Vercel
  // Function on @sparticuz/chromium — no second cloud, no AWS account.
  await adminClient
    .from('story_renders')
    .update({ status: 'rendering' })
    .eq('id', renderId)

  const startedAt = Date.now()
  let tmpDir: string | null = null
  // Switch CWD to /tmp BEFORE loading Remotion. Remotion's
  // getDownloadsCacheDir() walks up from cwd looking for a package.json and
  // returns `<dir>/node_modules/.remotion` (or `<cwd>/.remotion` if it never
  // finds one). On Vercel cwd is /var/task which is read-only, so any mkdir
  // there throws ENOENT and the render crashes before it starts. /tmp has
  // no package.json above it, so the cache dir resolves to /tmp/.remotion,
  // which IS writable.
  const originalCwd = process.cwd()
  try {
    process.chdir('/tmp')
  } catch {
    // best-effort — if chdir fails we proceed and let Remotion throw.
  }
  try {
    // Lazy-import the heavy renderer modules so requests that fail early
    // (env / auth / validation) don't pay the cold-start cost.
    const [{ renderMedia, renderStill, selectComposition }, chromiumMod] = await Promise.all([
      import('@remotion/renderer'),
      import('@sparticuz/chromium'),
    ])
    const chromium = (chromiumMod as { default?: unknown }).default ?? chromiumMod

    // Resolve a serveUrl for the pre-bundled Remotion site. At build time the
    // `prebuild` script emits the bundle to public/stories-bundle, which Vite
    // copies into dist/stories-bundle. Vercel serves it from the same
    // deployment, so we point Chromium at the function's own public origin.
    const serveUrl = resolveServeUrl(req)
    if (!serveUrl) {
      throw new Error('renderer_not_ready: stories-bundle missing or VERCEL_URL not set')
    }

    // Build render input. Two paths share this function:
    //   • Story Studio (edited ScenePlan) — validated + hardened server-side.
    //   • Legacy auto (style + photoIds) — unchanged.
    let inputProps: Record<string, unknown>
    let compositionId: string
    // Whether the final mp4 should carry an audio track. Only a plan with an
    // audible, allow-listed music track gets one; everything else exports with
    // NO audio track (muted:true) instead of an unnecessary silent one.
    let renderMuted = true
    if (hasScenePlan) {
      // SECURITY BOUNDARY: load the gallery's own image records and run the
      // client plan through resolveAndValidatePlan — rejects foreign image ids,
      // discards client src (re-resolved here), overrides dims from our records,
      // and re-runs the shared structural/injection validator.
      const owner = await loadOwnerImageRecords(adminClient, galleryId)
      if (owner.records.length === 0) throw new Error('no_images_in_gallery')
      const result = resolveAndValidatePlan(
        body.scenePlan,
        galleryId,
        owner.records,
        (id) => owner.srcById.get(id) ?? '',
      )
      if (!result.ok) {
        await adminClient
          .from('story_renders')
          .update({ status: 'failed', error_message: result.errors.slice(0, 3).join('; ').slice(0, 500) })
          .eq('id', renderId)
        return res.status(400).json({ ok: false, error: 'invalid_scene_plan', details: result.errors })
      }
      // Downscale the resolved brand logo so an oversized source can't crash
      // Chromium mid-render (see safeLogoDataUrl). null on failure — the
      // composition already renders logo-less when logoUrl is absent.
      let scenePlan = result.plan as { brand?: { logoUrl?: unknown } } & Record<string, unknown>
      if (scenePlan.brand && typeof scenePlan.brand === 'object') {
        const safeLogo = await safeLogoDataUrl(scenePlan.brand.logoUrl)
        scenePlan = { ...scenePlan, brand: { ...scenePlan.brand, logoUrl: safeLogo ?? null } }
      }
      inputProps = { plan: scenePlan }
      compositionId = 'StoryStudio'
      const mus = (result.plan as { music?: { muted?: boolean; trackId?: string | null; volume?: number } }).music
      renderMuted = !(mus && !mus.muted && !!mus.trackId && (mus.volume ?? 0) > 0)
    } else {
      const images = await loadImageUrlsForRender(adminClient, galleryId, photoIds ?? [])
      if (images.length === 0) throw new Error('no_images_in_gallery')
      inputProps = { images, durationSeconds: DEFAULT_STORY_DURATION_SECONDS }
      if (brandKit) {
        // Downscale the logo to a decode-safe data URL (or drop it) so an
        // oversized brand PNG can't crash the render (see safeLogoDataUrl).
        const safeLogo = await safeLogoDataUrl(brandKit.logo?.url)
        inputProps.brand = safeLogo
          ? { ...brandKit, logo: { url: safeLogo } }
          : { ...brandKit, logo: undefined }
      }
      compositionId = COMPOSITION_BY_STYLE[style as AllowedStyle]
    }
    // Resolve the @sparticuz/chromium executable BEFORE selectComposition.
    // Story Studio's composition uses calculateMetadata, so selectComposition
    // must launch a browser too — without this it downloads Remotion's own
    // headless shell, which lacks system libs (libnspr4.so) on the Vercel
    // sandbox and dies with exit 127. Passing the bundled Chromium to BOTH
    // selectComposition and renderMedia avoids the download entirely.
    const executablePath =
      typeof (chromium as { executablePath?: unknown }).executablePath === 'function'
        ? await (chromium as { executablePath: () => Promise<string> }).executablePath()
        : (chromium as { executablePath?: string }).executablePath
    if (!executablePath) {
      throw new Error('renderer_not_ready: chromium binary unavailable')
    }
    const chromiumArgs = ((chromium as { args?: string[] }).args ?? []) as string[]
    const chromiumOptions = {
      gl: 'angle',
      enableMultiProcessOnLinux: true,
      ...(chromiumArgs.length > 0 ? { args: chromiumArgs } : {}),
    } as Parameters<typeof renderMedia>[0]['chromiumOptions']

    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps,
      browserExecutable: executablePath,
      chromiumOptions,
    })

    // Write the mp4 to /tmp — the only writable path on the Vercel function
    // sandbox. The Supabase upload below reads it back as a Buffer.
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gf-story-'))
    const outPath = path.join(tmpDir, `${renderId}.mp4`)

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outPath,
      inputProps,
      // No audio track unless the plan carries music (avoids a misleading silent track).
      muted: renderMuted,
      // Match desktop bitrate band (~4.5 Mbit/s final for vertical 1080x1920).
      videoBitrate: '4500k',
      // Tell Remotion to drive the bundled Chromium instead of trying to
      // launch a system-installed one (which doesn't exist in the sandbox).
      browserExecutable: executablePath,
      chromiumOptions,
      onProgress: ({ progress }) => {
        // Light heartbeat in the logs so we can spot stuck renders.
        if (progress === 0 || progress === 1 || (progress * 100) % 10 < 1) {
          console.log(`[stories/render] ${renderId} ${(progress * 100).toFixed(0)}%`)
        }
      },
    })

    // Read the mp4 back. Stat first so we can record the file size.
    const stat = await fs.stat(outPath)
    const mp4 = await fs.readFile(outPath)
    const fileSizeBytes = stat.size

    // Poster frame: render a single representative still (~1.5s in, past most
    // opening cards) so the viewer/library can show a thumbnail before the mp4
    // loads. Best-effort — a poster failure never fails the render.
    let posterUrl: string | null = null
    try {
      const posterPath = path.join(tmpDir, `${renderId}.jpg`)
      const posterFrame = Math.min(Math.max(0, composition.durationInFrames - 1), 45)
      await renderStill({
        composition,
        serveUrl,
        output: posterPath,
        frame: posterFrame,
        inputProps,
        imageFormat: 'jpeg',
        jpegQuality: 80,
        browserExecutable: executablePath,
        chromiumOptions,
      })
      const posterBuf = await fs.readFile(posterPath)
      const posterStoragePath = `${galleryId}/${renderId}.jpg`
      const { error: posterErr } = await adminClient.storage
        .from(STORAGE_BUCKET)
        .upload(posterStoragePath, posterBuf, {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000, immutable',
          upsert: true,
        })
      if (!posterErr) {
        posterUrl = adminClient.storage.from(STORAGE_BUCKET).getPublicUrl(posterStoragePath).data?.publicUrl ?? null
      }
    } catch (posterErr) {
      console.warn('[stories/render] poster generation skipped', posterErr instanceof Error ? posterErr.message : posterErr)
    }

    // Upload to Supabase Storage. Path scheme: {gallery_id}/{render_id}.mp4.
    // upsert:true so a retried render with the same renderId (e.g. operator
    // re-running by id) overwrites cleanly instead of erroring.
    const storagePath = `${galleryId}/${renderId}.mp4`
    const { error: uploadErr } = await adminClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, mp4, {
        contentType: 'video/mp4',
        cacheControl: 'public, max-age=31536000, immutable',
        upsert: true,
      })
    if (uploadErr) {
      throw new Error(`storage_upload_failed: ${uploadErr.message}`)
    }

    // ── Cooperative cancel + idempotent completion ─────────────────────────
    // This synchronous function cannot be killed mid-render, but a cancel
    // request may have flipped the row out of 'rendering' while we worked. Only
    // promote to 'ready' if the row is STILL 'rendering' (i.e. not cancelled and
    // not already completed by a racing invocation). If it was cancelled, drop
    // the artifacts we just uploaded so storage doesn't accumulate orphans.
    const { data: current } = await adminClient
      .from('story_renders')
      .select('status')
      .eq('id', renderId)
      .maybeSingle()
    if (current && current.status !== 'rendering') {
      await adminClient.storage.from(STORAGE_BUCKET).remove([storagePath, `${galleryId}/${renderId}.jpg`]).catch(() => {})
      return res.status(200).json({
        ok: true,
        status: current.status,
        renderId,
        message: current.status === 'ready' ? 'already_completed' : 'render_cancelled',
      })
    }

    const { data: publicUrlData } = adminClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath)
    const outputUrl = publicUrlData?.publicUrl ?? null

    const wallSeconds = Math.round((Date.now() - startedAt) / 1000)
    // Mirror the legacy "ready" status alongside a "completed" flag in the
    // output_path/output_url columns so /api/stories/status keeps working
    // with no schema migration. The status enum (migration 066) accepts
    // 'ready' as the terminal-success state.
    await adminClient
      .from('story_renders')
      .update({
        status: 'ready',
        output_path: storagePath,
      })
      .eq('id', renderId)
      .eq('status', 'rendering') // idempotent: don't clobber a cancel/complete race

    return res.status(200).json({
      ok: true,
      status: 'completed',
      renderId,
      outputUrl,
      posterUrl,
      outputPath: storagePath,
      durationSeconds: DEFAULT_STORY_DURATION_SECONDS,
      fileSizeBytes,
      wallSeconds,
    })
  } catch (err) {
    // The raw message can embed filesystem paths (/var/task, /tmp), missing-lib
    // names, or storage/DB internals. Log it + persist a truncated copy for the
    // owner's status view, but NEVER return it to the HTTP client — the client
    // gets a stable code only. (Security review finding.)
    const message = err instanceof Error ? err.message : 'unknown_render_error'
    console.error('[stories/render] failed', message)
    await adminClient
      .from('story_renders')
      .update({
        status: 'failed',
        error_message: message.slice(0, 500),
      })
      .eq('id', renderId)
    return res.status(500).json({
      ok: false,
      error: 'render_failed',
      renderId,
    })
  } finally {
    // Best-effort cleanup; the container's /tmp gets nuked between invocations
    // anyway, but freeing it early helps if the runtime decides to reuse us.
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
    // Restore the original cwd so other handlers on the same warm container
    // see the expected /var/task. (We only chdir'd to /tmp so Remotion's
    // cache dir lookup would land in a writable place.)
    try { process.chdir(originalCwd) } catch { /* noop */ }
  }
}

/**
 * Resolve the Remotion bundle URL for the running deployment. The bundle is
 * emitted at build time into `public/stories-bundle/`, which Vite copies
 * into `dist/stories-bundle/` — Vercel serves it from the same origin as
 * the function, so we just need the origin.
 *
 * Preference order:
 *   1. STORIES_BUNDLE_URL (explicit override — useful for local dev pointing
 *      at a previously deployed bundle).
 *   2. VERCEL_URL (auto-set by Vercel on every deploy, no protocol prefix).
 *   3. The incoming request's host header (covers preview + custom domains).
 *
 * Returns null when none of the three are usable — the caller surfaces this
 * as 'renderer_not_ready'.
 */
function resolveServeUrl(req: VercelRequest): string | null {
  const explicit = process.env.STORIES_BUNDLE_URL
  if (explicit) return explicit.replace(/\/+$/, '') + '/stories-bundle/'

  // Prefer the LOCAL bundled site (included via vercel.json includeFiles).
  // Remotion serves a local directory over localhost, so Chromium never has to
  // fetch the deployment's own origin — which matters on protected Preview
  // deployments (Deployment Protection would return the SSO page to the
  // server-side browser instead of the bundle).
  try {
    const here = path.dirname(fileURLToPath(import.meta.url)) // /var/task/api/stories
    const localBundle = path.resolve(here, '..', '..', 'public', 'stories-bundle')
    if (existsSync(path.join(localBundle, 'index.html'))) return localBundle
  } catch {
    /* fall through to URL-based resolution */
  }

  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}/stories-bundle/`

  const host = req.headers.host
  if (host) {
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) || 'https'
    return `${proto}://${host}/stories-bundle/`
  }

  return null
}

// Resolve image storage paths → public URLs the Remotion composition can
// fetch. If the caller passed an explicit `photoIds` subset (curated story),
// we honour it; otherwise we fall back to the gallery's full image list.
//
// The `images` table stores `original_path` (the original upload) and
// `web_preview_path` (the smaller variant used in the viewer). Stories
// prefer `web_preview_path` because the renderer is rendering at 1080×1920
// and pulling the full original is wasted bandwidth — fall back to
// `original_path` if a preview is missing.
async function loadImageUrlsForRender(
  admin: SupabaseClient,
  galleryId: string,
  photoIds: string[],
): Promise<string[]> {
  let query = admin
    .from('images')
    .select('id, original_path, web_preview_path, sort_order')
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: true })
  if (photoIds.length > 0) {
    query = query.in('id', photoIds)
  }
  const { data, error } = await query
  if (error) {
    throw new Error(`image_lookup_failed: ${error.message}`)
  }
  const rows = (data || []) as Array<{
    original_path?: string | null
    web_preview_path?: string | null
  }>
  return rows
    .map(r => r.web_preview_path || r.original_path || '')
    .filter(p => !!p)
    .map(p => renderImageUrl(p))
}

// Story Studio: load the gallery's real image rows (source of truth for
// tenant-isolation) + a server-resolved public URL per image id.
async function loadOwnerImageRecords(
  admin: SupabaseClient,
  galleryId: string,
): Promise<{ records: OwnerImage[]; srcById: Map<string, string> }> {
  const { data, error } = await admin
    .from('images')
    .select('id, width, height, original_path, web_preview_path')
    .eq('gallery_id', galleryId)
  if (error) throw new Error(`image_lookup_failed: ${error.message}`)
  const rows = (data || []) as Array<{
    id: string
    width?: number | null
    height?: number | null
    original_path?: string | null
    web_preview_path?: string | null
  }>
  const records: OwnerImage[] = rows.map((r) => ({ id: r.id, width: r.width, height: r.height }))
  const srcById = new Map<string, string>()
  for (const r of rows) {
    const p = r.web_preview_path || r.original_path || ''
    if (p) srcById.set(r.id, renderImageUrl(p))
  }
  return { records, srcById }
}

export default withSentry('stories/render', handler)
