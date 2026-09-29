// Synchronous Remotion render inside this Vercel Function (@sparticuz/chromium,
// no AWS). Bounded by maxDuration=300s (~100s of output); the partial UNIQUE on
// story_renders(gallery_id, style) for in-flight rows blocks double-fired renders.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../../server/sentryServer.js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../server/env.js'
import { serviceClient } from '../../server/supabase.js'
import { promises as fs, existsSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveAndValidatePlan, checkRenderFeasibility, type OwnerImage } from './_scenePlanGuard.js'

// Every legacy style is accepted, but only 'Clean' exists as a composition.
const ALLOWED_STYLES = ['clean', 'cinematic', 'fast-social', 'elegant', 'vintage'] as const
type AllowedStyle = typeof ALLOWED_STYLES[number]

const COMPOSITION_BY_STYLE: Record<AllowedStyle, string> = {
  'clean': 'Clean',
  'cinematic': 'Clean',
  'fast-social': 'Clean',
  'elegant': 'Clean',
  'vintage': 'Clean',
}

const STORAGE_BUCKET = 'gallery-stories'
const GALLERY_IMAGES_BUCKET = 'gallery-images'
const DEFAULT_STORY_DURATION_SECONDS = 30
const STORY_MAX_PHOTOS = 60

// Full-size originals exhaust Chromium's image decoder in the function ("source
// image cannot be decoded" → page crash), so frames are always fetched through
// Supabase's on-the-fly transform, bounded to 1280x1920.
const RENDER_IMAGE_MAX_W = 1280
const RENDER_IMAGE_MAX_H = 1920
const RENDER_IMAGE_QUALITY = 78

function renderImageUrl(storagePath: string): string {
  const q = `width=${RENDER_IMAGE_MAX_W}&height=${RENDER_IMAGE_MAX_H}&resize=contain&quality=${RENDER_IMAGE_QUALITY}`
  return `${SUPABASE_URL}/storage/v1/render/image/public/${GALLERY_IMAGES_BUCKET}/${storagePath}?${q}`
}

// Above maxDuration (300s): an in-flight row older than this is an orphan from a
// crashed/timed-out function and must not hold the in-flight unique lock.
const STALE_RENDER_MS = 6 * 60 * 1000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isAllowedStyle(value: unknown): value is AllowedStyle {
  return typeof value === 'string' && (ALLOWED_STYLES as readonly string[]).includes(value)
}

// Mirrors the Clean composition's BrandKit prop; kept local so the wire format
// doesn't drift with the composition.
interface RenderBrandKit {
  studio_name?: string
  logo?: { url?: string }
  colors?: { primary?: string; ink?: string; paper?: string }
  voice?: { tagline?: string; signature?: string }
  social?: { instagram?: string; tiktok?: string; website?: string }
}

// Project the richer brand_kit JSONB down to what the composition consumes.
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
  // undefined → the composition skips intro/outro/watermark entirely.
  const hasAnything =
    !!studio_name || !!logo?.url ||
    !!colors.primary || !!colors.ink || !!colors.paper ||
    !!voice.tagline || !!voice.signature ||
    !!social.instagram || !!social.tiktok || !!social.website
  if (!hasAnything) return undefined
  return { studio_name, logo, colors, voice, social }
}

// Huge logos (e.g. 19913x7983) crash Chromium's decoder and are too large for
// Supabase's transform, so downscale with sharp and inline as a data URL.
// Fails open: any error renders logo-less rather than crashing.
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

  const adminClient = serviceClient()
  if (!adminClient) {
    return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  }

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

  // Studio renders use their own style key so their in-flight lock doesn't
  // collide with the legacy auto styles.
  const hasScenePlan = body.scenePlan !== undefined && body.scenePlan !== null
  let style: string
  if (hasScenePlan) {
    if (typeof body.scenePlan !== 'object') {
      return res.status(400).json({ ok: false, error: 'invalid_scene_plan' })
    }
    // Authoritative length cap, checked before any row exists so it can't orphan a job.
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

  // Optional curated shot list; otherwise the gallery's full sort_order is used.
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

  // Return a genuinely in-flight render (double-click); reap a stale orphan.
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
    await adminClient
      .from('story_renders')
      .update({ status: 'failed', error_message: 'render timed out (stale job reaped)' })
      .eq('id', inflight.id)
      .in('status', ['queued', 'rendering'])
    console.warn(`[stories/render] reaped stale ${inflight.status} row ${inflight.id} (age ${Math.round(ageMs / 1000)}s)`)
  }

  // Insert before rendering so a mid-render crash still leaves a findable row.
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
    // Usually the partial UNIQUE rejecting a racing request: return its row.
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

  // Lets a polling client show progress before the synchronous render ends.
  await adminClient
    .from('story_renders')
    .update({ status: 'rendering' })
    .eq('id', renderId)

  const startedAt = Date.now()
  let tmpDir: string | null = null
  // Remotion derives its cache dir from cwd; /var/task is read-only on Vercel,
  // so run from /tmp where the cache resolves to a writable /tmp/.remotion.
  const originalCwd = process.cwd()
  try {
    process.chdir('/tmp')
  } catch {
    // best-effort; Remotion will throw if it matters
  }
  try {
    // Lazy so requests that fail early don't pay the cold-start cost.
    const [{ renderMedia, renderStill, selectComposition }, chromiumMod] = await Promise.all([
      import('@remotion/renderer'),
      import('@sparticuz/chromium'),
    ])
    const chromium = (chromiumMod as { default?: unknown }).default ?? chromiumMod

    const serveUrl = resolveServeUrl(req)
    if (!serveUrl) {
      throw new Error('renderer_not_ready: stories-bundle missing or VERCEL_URL not set')
    }

    let inputProps: Record<string, unknown>
    let compositionId: string
    // Only a plan with audible music gets an audio track; no silent tracks.
    let renderMuted = true
    if (hasScenePlan) {
      // Security boundary: foreign image ids are rejected, client src/dims are
      // replaced from our own records, and the structural validator re-runs.
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
        const safeLogo = await safeLogoDataUrl(brandKit.logo?.url)
        inputProps.brand = safeLogo
          ? { ...brandKit, logo: { url: safeLogo } }
          : { ...brandKit, logo: undefined }
      }
      compositionId = COMPOSITION_BY_STYLE[style as AllowedStyle]
    }
    // selectComposition launches a browser too (calculateMetadata); without the
    // bundled Chromium it downloads Remotion's shell, which lacks libs on Vercel.
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

    // /tmp is the only writable path in the function sandbox.
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gf-story-'))
    const outPath = path.join(tmpDir, `${renderId}.mp4`)

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outPath,
      inputProps,
      muted: renderMuted,
      videoBitrate: '4500k',
      browserExecutable: executablePath,
      chromiumOptions,
      onProgress: ({ progress }) => {
        // Log heartbeat to spot stuck renders.
        if (progress === 0 || progress === 1 || (progress * 100) % 10 < 1) {
          console.log(`[stories/render] ${renderId} ${(progress * 100).toFixed(0)}%`)
        }
      },
    })

    const stat = await fs.stat(outPath)
    const mp4 = await fs.readFile(outPath)
    const fileSizeBytes = stat.size

    // Poster still ~1.5s in (past most opening cards). Best-effort.
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

    // upsert so re-running the same renderId overwrites instead of erroring.
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

    // Cooperative cancel: only promote if the row is still 'rendering'; if it was
    // cancelled (or completed by a racing call) drop the uploaded artifacts.
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
    // The DB terminal state is 'ready' (the response says 'completed').
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
    // The raw message can leak paths/internals: persist it for the owner's
    // status view but return only a stable code.
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
    // Free /tmp early in case the container is reused.
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
    // Other handlers on a warm container expect the original cwd.
    try { process.chdir(originalCwd) } catch { /* noop */ }
  }
}

/** Pre-built Remotion bundle location: STORIES_BUNDLE_URL override, then the
 *  local bundled copy, then VERCEL_URL, then the request host; null if none. */
function resolveServeUrl(req: VercelRequest): string | null {
  const explicit = process.env.STORIES_BUNDLE_URL
  if (explicit) return explicit.replace(/\/+$/, '') + '/stories-bundle/'

  // Prefer the local copy (vercel.json includeFiles): on protected previews,
  // fetching our own origin returns the SSO page instead of the bundle.
  try {
    const here = path.dirname(fileURLToPath(import.meta.url)) // /var/task/api/stories
    const localBundle = path.resolve(here, '..', '..', 'public', 'stories-bundle')
    if (existsSync(path.join(localBundle, 'index.html'))) return localBundle
  } catch {
    /* fall through */
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

// Prefer the web preview; the original is only a fallback when it's missing.
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

// The gallery's real image rows are the source of truth for tenant isolation.
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
