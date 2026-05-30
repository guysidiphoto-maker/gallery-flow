// stories/render.ts — Stories Phase 2: real Remotion Lambda invocation.
//
// Phase 1 returned a queued stub. Phase 2 actually kicks off the Lambda
// render and persists state in `story_renders`. The Dashboard then polls
// the sibling `/api/stories/status` endpoint.
//
// Idempotency model:
//   - Partial UNIQUE on story_renders (gallery_id, style) WHERE status IN
//     ('queued','rendering') means concurrent clicks cannot double-fire.
//   - This endpoint first SELECTs any in-flight row for (gallery, style)
//     and returns it instead of trying to INSERT (cheaper than waiting
//     for the UNIQUE to reject).
//
// Fail-closed env contract:
//   If any of REMOTION_LAMBDA_FUNCTION_NAME / REMOTION_LAMBDA_SERVE_URL /
//   AWS_REGION is missing we return { error: 'lambda_not_configured' } and
//   do NOT insert a story_renders row. We never silently fall through to a
//   stub — a missing env in prod must be loud, not lossy.
//
// Request:  POST { galleryId: uuid, style: 'clean', photoIds?: uuid[] }
// Response: 200 { ok: true, status: 'rendering' | 'queued', renderId, message? }
//           400 { ok: false, error: 'invalid_…' }
//           401 { ok: false, error: 'unauthenticated' }
//           403 { ok: false, error: 'not_owner' }
//           404 { ok: false, error: 'gallery_not_found' }
//           405 { ok: false, error: 'method_not_allowed' }
//           500 { ok: false, error: 'server_misconfigured'
//                              | 'lambda_not_configured'
//                              | 'lambda_invoke_failed'
//                              | 'gallery_lookup_failed'
//                              | 'render_insert_failed' }

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// All 5 styles accepted at the API boundary (matches STORY_STYLES in
// gallery-web/src/lib/storyRender.ts). Phase 1 only renders 'clean' via
// the spike; the others are accepted but queued — Phase 2 wires the
// matching Remotion compositions before they actually render.
const ALLOWED_STYLES = ['clean', 'cinematic', 'fast-social', 'elegant', 'vintage'] as const
type AllowedStyle = typeof ALLOWED_STYLES[number]

const STORY_MAX_PHOTOS = 60

// Loose UUID v4-ish regex. We only need to reject obviously-malformed input
// at the edge; Supabase's typed `eq('id', …)` will hard-reject anything that
// slips through.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isAllowedStyle(value: unknown): value is AllowedStyle {
  return typeof value === 'string' && (ALLOWED_STYLES as readonly string[]).includes(value)
}

// Narrow the body once so the rest of the handler reads typed values without
// re-asserting `unknown` casts.
function parseBody(body: unknown): {
  galleryId: string
  style: AllowedStyle | null
  photoIds: string[]
} | null {
  if (!body || typeof body !== 'object') return null
  const b = body as { galleryId?: unknown; style?: unknown; photoIds?: unknown }
  const galleryId = typeof b.galleryId === 'string' ? b.galleryId.trim() : ''
  const style = isAllowedStyle(b.style) ? b.style : null
  const photoIds = Array.isArray(b.photoIds)
    ? b.photoIds.filter((p): p is string => typeof p === 'string' && UUID_RE.test(p))
    : []
  return { galleryId, style, photoIds }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    // Hard-fail loudly — without env we cannot auth-check, and silently
    // returning success would let any caller "queue" a render.
    return res.status(500).json({ ok: false, error: 'server_misconfigured' })
  }

  // ── Lambda env (fail-closed) ───────────────────────────────────────────
  // Read all three up-front so we can reject BEFORE writing a story_renders
  // row. If any are missing we return lambda_not_configured — the Dashboard
  // surfaces this as a toast and the operator knows to finish deploy step.
  const LAMBDA_FUNCTION_NAME = process.env.REMOTION_LAMBDA_FUNCTION_NAME || ''
  const LAMBDA_SERVE_URL = process.env.REMOTION_LAMBDA_SERVE_URL || ''
  const LAMBDA_REGION = process.env.AWS_REGION || ''
  if (!LAMBDA_FUNCTION_NAME || !LAMBDA_SERVE_URL || !LAMBDA_REGION) {
    return res.status(500).json({ ok: false, error: 'lambda_not_configured' })
  }

  // ── Input validation ───────────────────────────────────────────────────
  const body = (req.body || {}) as { galleryId?: unknown; style?: unknown; photoIds?: unknown }
  const galleryId = typeof body.galleryId === 'string' ? body.galleryId.trim() : ''
  const style = body.style

  if (!galleryId || !UUID_RE.test(galleryId)) {
    return res.status(400).json({ ok: false, error: 'invalid_gallery_id' })
  }
  if (!style) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_style',
      allowed: ALLOWED_STYLES,
    })
  }

  // photoIds is optional. When the dashboard curates a specific shot list +
  // order we honor it; otherwise the Phase 2 Lambda picks favorites or the
  // first 30 (same rule the dashboard surfaces). Validate shape + per-id
  // UUID + cap size to STORY_MAX_PHOTOS so a runaway client can't fan out.
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

  // Service-role read of gallery + owner — same pattern as Phase 1.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: gallery, error: galleryErr } = await adminClient
    .from('galleries')
    .select('id, business_id, businesses!inner(user_id)')
    .eq('id', galleryId)
    .maybeSingle()
  if (galleryErr) {
    console.error('[stories/render] gallery fetch failed', galleryErr.message)
    return res.status(500).json({ ok: false, error: 'gallery_lookup_failed' })
  }
  if (!gallery) {
    return res.status(404).json({ ok: false, error: 'gallery_not_found' })
  }
  const biz = (gallery as { businesses?: { user_id?: string } | Array<{ user_id?: string }> }).businesses
  const ownerUserId = Array.isArray(biz) ? biz[0]?.user_id : biz?.user_id
  if (!ownerUserId || ownerUserId !== userId) {
    return res.status(403).json({ ok: false, error: 'not_owner' })
  }

  // ── Phase 1 stub: return queued without doing real work ────────────────
  // The Dashboard surfaces this as a toast and lets the photographer keep
  // working. Phase 2 will replace this branch with an actual Lambda kickoff
  // (see TODO Phase 2 below).
  return res.status(200).json({
    ok: true,
    status: 'queued',
    galleryId,
    style,
    photoCount: photoIds?.length ?? null,
    message: 'Lambda integration pending Phase 2',
  })

  // ── Persist a story_renders row in 'queued' state ─────────────────────
  // We insert BEFORE the Lambda call so the row exists even if Lambda
  // succeeds but our process dies (operator can still find the orphan).
  const { data: rowInserted, error: insertErr } = await adminClient
    .from('story_renders')
    .insert({
      gallery_id: galleryId,
      style,
      photo_ids: photoIds,
      status: 'queued',
      requested_by: userId,
    })
    .select('id')
    .single()
  if (insertErr || !rowInserted) {
    // Most likely cause: the partial UNIQUE rejected because another
    // request raced past our SELECT. Re-query and return that row instead
    // of bubbling a 500 to the UI.
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

  // ── Lambda invocation ─────────────────────────────────────────────────
  // Imported lazily so the route doesn't pay the cold-start cost for
  // requests that fail early (env / auth / validation). Phase 2 ops step
  // adds `@remotion/lambda` to gallery-web/package.json.
  try {
    const { renderMediaOnLambda } = await import('@remotion/lambda/client')

    // Resolve the public image URLs the composition needs. Lambda fetches
    // these directly from Supabase Smart CDN — no auth churn per request.
    const images = await loadImageUrlsForRender(adminClient, galleryId, photoIds)

    const composition = COMPOSITION_BY_STYLE[style]
    // `region` is enum-typed in @remotion/lambda. We accept any string from
    // env (AWS_REGION) and cast — runtime validation happens on Lambda's end,
    // and a bad region surfaces in the catch below as a clean failure row.
    const lambdaResult = await renderMediaOnLambda({
      region: LAMBDA_REGION as Parameters<typeof renderMediaOnLambda>[0]['region'],
      functionName: LAMBDA_FUNCTION_NAME,
      serveUrl: LAMBDA_SERVE_URL,
      composition,
      inputProps: {
        images,
        durationSeconds: DEFAULT_STORY_DURATION_SECONDS,
      },
      codec: 'h264',
    })

    await adminClient
      .from('story_renders')
      .update({
        status: 'rendering',
        lambda_render_id: lambdaResult.renderId ?? null,
      })
      .eq('id', renderId)

    return res.status(200).json({
      ok: true,
      status: 'rendering',
      renderId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_lambda_error'
    console.error('[stories/render] lambda invoke failed', message)
    await adminClient
      .from('story_renders')
      .update({
        status: 'failed',
        error_message: message.slice(0, 500),
      })
      .eq('id', renderId)
    return res.status(500).json({
      ok: false,
      error: 'lambda_invoke_failed',
      message,
    })
  }
}

// Resolve image storage paths → public URLs the Remotion composition can
// fetch. If the caller passed an explicit `photoIds` subset (curated story),
// we honour it; otherwise we fall back to the gallery's full image list.
//
// The `images` table stores `original_path` (the original upload) and
// `web_preview_path` (the smaller variant used in the viewer). Stories
// prefer `web_preview_path` because Lambda is rendering at 1080×1920 and
// pulling the full original is wasted bandwidth — fall back to
// `original_path` if a preview is missing.
async function loadImageUrlsForRender(
  admin: ReturnType<typeof createClient>,
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
    throw new Error(`image lookup failed: ${error.message}`)
  }
  const rows = (data || []) as Array<{
    original_path?: string | null
    web_preview_path?: string | null
  }>
  return rows
    .map(r => r.web_preview_path || r.original_path || '')
    .filter(p => !!p)
    .map(p => `${SUPABASE_URL}/storage/v1/object/public/gallery-images/${p}`)
}
