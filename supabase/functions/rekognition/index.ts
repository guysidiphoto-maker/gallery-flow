import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  RekognitionClient,
  ListCollectionsCommand,
  CreateCollectionCommand,
  DeleteCollectionCommand,
  IndexFacesCommand,
  DeleteFacesCommand,
  SearchFacesByImageCommand,
} from 'npm:@aws-sdk/client-rekognition@3'

// ─── Environment ────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const AWS_REGION = Deno.env.get('AWS_REGION') ?? 'eu-central-1'
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID')!
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY')!
const IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? 'pixflow-default-salt'

const rekognition = new RekognitionClient({
  region: AWS_REGION,
  credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── Tuning ─────────────────────────────────────────────────────────────────

// Rate limit is scoped per (gallery, ip): one IP-share-on-event-WiFi can
// search at full quota in each gallery they visit, instead of having a
// global 10/hour budget split across the whole product.
const SEARCH_RATE_LIMIT_PER_HOUR = 500
const SEARCH_RATE_WINDOW_MS = 60 * 60 * 1000
const SEARCH_MAX_SELFIE_BYTES = 5 * 1024 * 1024
// How long a cached selfie→matches result is reusable. Long enough to
// cover a guest reloading and re-searching during the event, short enough
// that newly-indexed photos surface within the hour.
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000
/** Minimum similarity % to count as a match. AWS recommends 80 for general
 *  use; lower = more matches + more false positives. Event galleries skew
 *  toward recall (better to over-include than miss someone), so we run a bit
 *  below the AWS default. */
const SEARCH_FACE_MATCH_THRESHOLD = 70
/** Max matches returned from the collection per selfie search.
 *  Passed to Rekognition as MaxFaces — default is 1, which is WAY too low. */
const SEARCH_MAX_RESULTS = 100
/** Max faces indexed per photo. Event/crowd photos can legitimately contain
 *  40+ people; we want everyone to find themselves. Rekognition bills per
 *  image regardless of MaxFaces, so raising this is cost-neutral. */
const INDEX_MAX_FACES_PER_IMAGE = 100
/** Concurrent IndexFaces calls from a single edge-function invocation. */
const INDEX_CONCURRENCY = 6
/** Max times we'll retry indexing a single image before giving up. Transient
 *  AWS throttles or storage hiccups deserve a retry; persistent failures
 *  (corrupt file, missing storage object, unsupported format) shouldn't keep
 *  the gallery in 'indexing' forever. */
const MAX_INDEX_ATTEMPTS = 3
/** Staleness threshold for the in-flight indexing lock, in seconds. If a
 *  worker crashed mid-run, a new claim after this window takes over. */
const INDEXING_LOCK_STALENESS_SEC = 10 * 60

// ─── Helpers ────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(err: unknown, status = 400): Response {
  const msg = err instanceof Error ? err.message : String(err)
  return json({ error: msg }, status)
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${IP_HASH_SALT}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0'
  )
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function fetchImageBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch image failed: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

async function requirePhotographer(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new Error('Missing auth')
  const jwt = authHeader.replace('Bearer ', '')
  const sb = serviceClient()
  const { data: { user }, error } = await sb.auth.getUser(jwt)
  if (error || !user) throw new Error('Unauthorized')
  return { user, jwt, sb }
}

async function loadOwnedGallery(
  sb: SupabaseClient,
  userId: string,
  galleryId: string,
) {
  const { data: biz } = await sb
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (!biz) throw new Error('No business for user')

  const { data: gallery } = await sb
    .from('galleries')
    .select('id, business_id, face_index_enabled, face_index_status, rekognition_collection_id, face_indexed_count, face_indexed_at, image_count')
    .eq('id', galleryId)
    .eq('business_id', biz.id)
    .maybeSingle()
  if (!gallery) throw new Error('Gallery not found or not owned by caller')
  return gallery
}

// ─── Per-image indexing (internal — not exposed as an action anymore) ───────

/** Atomically stamp face_indexed_at on an image only if it's still null,
 *  and increment the gallery counter exactly when that transition happens.
 *  Returns true if THIS call did the transition (i.e., we should count it).
 *  Eliminates the double-count race where two concurrent workers each
 *  finished indexing the same image. */
async function stampImageIndexed(
  sb: SupabaseClient,
  galleryId: string,
  imageId: string,
  faceCount: number,
  errorMsg?: string,
): Promise<boolean> {
  const update: Record<string, unknown> = {
    face_indexed_at: new Date().toISOString(),
    face_count: faceCount,
  }
  if (errorMsg) update.face_index_error = errorMsg.slice(0, 500)
  const { data: rows } = await sb
    .from('images')
    .update(update)
    .eq('id', imageId)
    .is('face_indexed_at', null)
    .select('id')
  if (!rows || rows.length === 0) return false
  await sb.rpc('increment_face_indexed_count', { p_gallery_id: galleryId })
  return true
}

async function indexOneImage(
  sb: SupabaseClient,
  collectionId: string,
  galleryId: string,
  image: { id: string; storage_path: string | null; face_indexed_at: string | null; face_index_attempts?: number | null },
): Promise<{ indexed: boolean; faceCount: number; error?: string }> {
  if (image.face_indexed_at) return { indexed: false, faceCount: 0 }

  // Defensive: a missing storage path means the web preview was never wired
  // up. Treat as a permanent skip rather than burning retries on a 400.
  if (!image.storage_path) {
    await stampImageIndexed(sb, galleryId, image.id, 0, 'Web preview not available')
    return { indexed: false, faceCount: 0 }
  }

  try {
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/gallery-images/${image.storage_path}`
    const bytes = await fetchImageBytes(publicUrl)

    const result = await rekognition.send(new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: bytes },
      ExternalImageId: image.id,
      DetectionAttributes: [],
      MaxFaces: INDEX_MAX_FACES_PER_IMAGE,
      QualityFilter: 'AUTO',
    }))

    const records = (result.FaceRecords ?? [])
      .map(fr => ({
        gallery_id: galleryId,
        image_id: image.id,
        rekognition_face_id: fr.Face?.FaceId!,
        confidence: fr.Face?.Confidence ?? null,
        bounding_box: fr.Face?.BoundingBox ?? null,
      }))
      .filter(r => r.rekognition_face_id)

    if (records.length > 0) {
      await sb.from('image_faces').insert(records)
    }

    // Stamping face_indexed_at fires the trigger that auto-flips the gallery
    // to 'done' once the last image is in. The conditional update inside
    // stampImageIndexed makes this race-safe across concurrent workers.
    await stampImageIndexed(sb, galleryId, image.id, records.length)

    return { indexed: true, faceCount: records.length }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Up to MAX_INDEX_ATTEMPTS we leave face_indexed_at NULL so the next run
    // can retry (transient AWS throttles, network blips). After that we
    // stamp it processed with face_count = 0 so the gallery can finish; the
    // photo carries face_index_error for the photographer to diagnose.
    try {
      const nextAttempts = (image.face_index_attempts ?? 0) + 1
      const giveUp = nextAttempts >= MAX_INDEX_ATTEMPTS
      if (giveUp) {
        await stampImageIndexed(sb, galleryId, image.id, 0, msg)
      } else {
        await sb.from('images').update({
          face_index_attempts: nextAttempts,
          face_index_error: msg.slice(0, 500),
        }).eq('id', image.id)
      }
    } catch {
      /* swallow — the next pass will re-try if this DB write fails */
    }
    return { indexed: false, faceCount: 0, error: msg }
  }
}

/** Loops through unindexed images with bounded concurrency. Runs inside
 *  EdgeRuntime.waitUntil() so it keeps going after the HTTP response is sent. */
async function processGallery(
  sb: SupabaseClient,
  galleryId: string,
  collectionId: string,
): Promise<void> {
  const { data: imgs } = await sb
    .from('images')
    .select('id, storage_path:web_preview_path, face_indexed_at, face_index_attempts')
    .eq('gallery_id', galleryId)
    .is('face_indexed_at', null)
    .order('sort_order', { ascending: true })

  const all = imgs ?? []

  // Only pre-skip when there's literally no path on the row. We deliberately
  // do NOT trust `web_preview_uploaded` as a proxy for "is this fetchable" —
  // we observed in production that the photographer's upload pipeline can
  // succeed in landing the file in storage but fail to flip the boolean,
  // which previously caused us to mark every photo as face_count=0 even
  // when the file was sitting right there. The actual fetch in indexOneImage
  // is the source of truth: if it returns 400/404, the existing 3-attempt
  // retry loop catches that and stamps the row with face_count=0. If it
  // returns 200, we index normally.
  const noPath = all.filter(i => !i.storage_path)
  for (const img of noPath) {
    await stampImageIndexed(sb, galleryId, img.id, 0, 'Web preview path missing')
  }

  const pending = all.filter(i => i.storage_path)
  if (pending.length === 0) {
    // Nothing more to fetch. The trigger fires on the last face_indexed_at
    // stamp; this is just a belt-and-braces flip in case it didn't.
    await sb.from('galleries')
      .update({ face_index_status: 'done', face_indexed_at: new Date().toISOString() })
      .eq('id', galleryId)
      .eq('face_index_status', 'indexing')
    return
  }

  let cursor = 0
  let failureCount = 0
  const running = new Set<Promise<void>>()

  const processOne = async (image: typeof pending[number]) => {
    const result = await indexOneImage(sb, collectionId, galleryId, image)
    if (!result.indexed && result.error) failureCount += 1
    // Per-image errors live on the image row (face_index_error). We
    // intentionally don't mirror them onto the gallery — the gallery banner
    // should reflect overall health, not the last per-image hiccup.
  }

  while (cursor < pending.length || running.size > 0) {
    while (cursor < pending.length && running.size < INDEX_CONCURRENCY) {
      const p = processOne(pending[cursor++]).then(() => { running.delete(p) })
      running.add(p)
    }
    if (running.size > 0) await Promise.race(running)
  }

  // Only mark the gallery 'failed' if NO image in the gallery was ever
  // successfully indexed — i.e., a real catastrophic failure, not a few bad
  // photos at the tail of an otherwise healthy run. The happy-path flip to
  // 'done' is handled by the DB trigger.
  if (failureCount === pending.length && pending.length > 0) {
    const { count: indexedTotal } = await sb
      .from('images')
      .select('id', { count: 'exact', head: true })
      .eq('gallery_id', galleryId)
      .not('face_indexed_at', 'is', null)
    if ((indexedTotal ?? 0) === 0) {
      await sb.from('galleries')
        .update({ face_index_status: 'failed' })
        .eq('id', galleryId)
        .eq('face_index_status', 'indexing')
    }
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function actionPing(): Promise<Response> {
  const result = await rekognition.send(new ListCollectionsCommand({}))
  return json({ ok: true, region: AWS_REGION, collections: result.CollectionIds ?? [] })
}

async function actionIndexGallery(req: Request, body: { galleryId?: string }): Promise<Response> {
  if (!body.galleryId) throw new Error('galleryId required')
  const { user } = await requirePhotographer(req)
  const sb = serviceClient()
  const gallery = await loadOwnedGallery(sb, user.id, body.galleryId)

  // Self-heal the per-gallery counter from the source of truth before we do
  // anything else. Historical rows can show face_indexed_count > image_count
  // when a previous run double-counted (concurrent claims under lock
  // staleness), and the UI surfaces that as a confusing 1991/1198-style
  // overflow.
  await sb.rpc('recompute_face_indexed_count', { p_gallery_id: gallery.id })

  // Count unindexed images before anything else. If there's nothing to do,
  // short-circuit — avoids a briefly-flickering 'indexing' status and skips
  // an unnecessary Rekognition CreateCollection + background worker.
  const { count: unindexedCount } = await sb
    .from('images')
    .select('id', { count: 'exact', head: true })
    .eq('gallery_id', gallery.id)
    .is('face_indexed_at', null)

  if ((unindexedCount ?? 0) === 0) {
    // Make sure status reflects reality (in case we're fixing a stuck row).
    await sb.from('galleries')
      .update({
        face_index_status: 'done',
        face_indexed_at: new Date().toISOString(),
        face_index_error: null,
      })
      .eq('id', gallery.id)
      .neq('face_index_status', 'done')
    return json({ started: false, alreadyDone: true, pending: 0 })
  }

  // Atomic claim: only one worker can hold the lock at a time. Stale locks
  // (> INDEXING_LOCK_STALENESS_SEC) are auto-taken over. Any concurrent call
  // gets alreadyRunning: true.
  const { data: claimed } = await sb.rpc('try_claim_face_indexing', {
    p_gallery_id: gallery.id,
    p_staleness_sec: INDEXING_LOCK_STALENESS_SEC,
  })
  if (!claimed) {
    return json({ started: false, alreadyRunning: true, pending: unindexedCount })
  }

  // Create the collection (idempotent). Do it after the claim so failed
  // claims don't waste Rekognition API calls.
  const collectionId = gallery.id
  try {
    await rekognition.send(new CreateCollectionCommand({ CollectionId: collectionId }))
  } catch (err) {
    const code = (err as { name?: string })?.name
    if (code !== 'ResourceAlreadyExistsException') throw err
  }

  // Wire the collection id + feature flag onto the gallery. Status was
  // already set by the claim RPC.
  await sb.from('galleries')
    .update({
      face_index_enabled: true,
      rekognition_collection_id: collectionId,
    })
    .eq('id', gallery.id)

  // Fire-and-forget background work. waitUntil tells Supabase to keep the
  // worker alive after the HTTP response returns.
  // @ts-ignore — EdgeRuntime is a global on Supabase Edge Runtime
  EdgeRuntime.waitUntil(
    processGallery(sb, gallery.id, collectionId).catch(async (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      await sb.from('galleries')
        .update({ face_index_status: 'failed', face_index_error: msg })
        .eq('id', gallery.id)
    }),
  )

  return json({ started: true, pending: unindexedCount })
}

async function actionDeleteCollection(req: Request, body: { galleryId?: string }): Promise<Response> {
  if (!body.galleryId) throw new Error('galleryId required')
  const { user } = await requirePhotographer(req)
  const sb = serviceClient()
  const gallery = await loadOwnedGallery(sb, user.id, body.galleryId)

  const collectionId = gallery.rekognition_collection_id ?? gallery.id
  try {
    await rekognition.send(new DeleteCollectionCommand({ CollectionId: collectionId }))
  } catch (err) {
    const code = (err as { name?: string })?.name
    if (code !== 'ResourceNotFoundException') throw err
  }
  return json({ ok: true })
}

async function actionDeleteImageFaces(
  req: Request,
  body: { galleryId?: string; imageId?: string },
): Promise<Response> {
  if (!body.galleryId || !body.imageId) throw new Error('galleryId and imageId required')
  const { user } = await requirePhotographer(req)
  const sb = serviceClient()
  const gallery = await loadOwnedGallery(sb, user.id, body.galleryId)

  const { data: faces } = await sb
    .from('image_faces')
    .select('rekognition_face_id')
    .eq('image_id', body.imageId)

  const faceIds = (faces ?? []).map(f => f.rekognition_face_id).filter(Boolean)
  if (faceIds.length > 0 && gallery.rekognition_collection_id) {
    try {
      await rekognition.send(new DeleteFacesCommand({
        CollectionId: gallery.rekognition_collection_id,
        FaceIds: faceIds,
      }))
    } catch (err) {
      const code = (err as { name?: string })?.name
      if (code !== 'ResourceNotFoundException') throw err
    }
  }
  return json({ ok: true, deletedFaces: faceIds.length })
}

async function actionSearch(req: Request): Promise<Response> {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.startsWith('multipart/form-data')) {
    throw new Error('Expected multipart/form-data with `galleryId` and `selfie`')
  }
  const form = await req.formData()
  const galleryId = form.get('galleryId')
  const selfie = form.get('selfie')
  if (typeof galleryId !== 'string') throw new Error('galleryId required')
  if (!(selfie instanceof File)) throw new Error('selfie file required')
  if (selfie.size > SEARCH_MAX_SELFIE_BYTES) {
    return json({ error: 'Selfie too large (max 5 MB)' }, 413)
  }

  const sb = serviceClient()

  const { data: gallery } = await sb
    .from('galleries')
    .select('id, status, face_index_status, face_indexed_count, rekognition_collection_id')
    .eq('id', galleryId)
    .maybeSingle()
  if (!gallery) return json({ error: 'Gallery not found' }, 404)
  if (gallery.status !== 'live') return json({ error: 'Gallery not live' }, 404)
  // Allow partial-search while indexing is still running — as long as at
  // least one image has been indexed, searching against the collection is
  // meaningful and matches what the gallery viewer advertises. Without this
  // the viewer's "selfie search" button shows up but every search 404s.
  const isReady =
    gallery.face_index_status === 'done' ||
    (gallery.face_index_status === 'indexing' && (gallery.face_indexed_count ?? 0) > 0)
  if (!isReady || !gallery.rekognition_collection_id) {
    return json({ error: 'Face search not available for this gallery' }, 404)
  }

  const bytes = new Uint8Array(await selfie.arrayBuffer())
  const selfieHash = await sha256Hex(bytes)
  const ipHash = await hashIp(getClientIp(req))

  // Cache lookup BEFORE rate limit. A guest reloading or re-pressing the
  // search button with the same selfie should not burn through their quota,
  // and we don't want to bill AWS twice for the same input either.
  const cacheCutoff = new Date(Date.now() - SEARCH_CACHE_TTL_MS).toISOString()
  const { data: cached } = await sb
    .from('face_search_cache')
    .select('matches, image_ids')
    .eq('gallery_id', gallery.id)
    .eq('selfie_hash', selfieHash)
    .gte('created_at', cacheCutoff)
    .maybeSingle()

  let matches: Array<{ imageId: string; similarity: number }> = []
  let imageIds: string[] = []

  if (cached) {
    matches = (cached.matches as Array<{ imageId: string; similarity: number }>) ?? []
    imageIds = (cached.image_ids as string[]) ?? matches.map(m => m.imageId)
  } else {
    // Cache miss → enforce rate limit (per gallery + per IP), then call AWS.
    const since = new Date(Date.now() - SEARCH_RATE_WINDOW_MS).toISOString()
    const { count: recent } = await sb
      .from('rekognition_search_log')
      .select('id', { count: 'exact', head: true })
      .eq('gallery_id', gallery.id)
      .eq('ip_hash', ipHash)
      .gte('created_at', since)
    if ((recent ?? 0) >= SEARCH_RATE_LIMIT_PER_HOUR) {
      return json({ error: 'Too many searches. Try again later.' }, 429)
    }

    try {
      const result = await rekognition.send(new SearchFacesByImageCommand({
        CollectionId: gallery.rekognition_collection_id,
        Image: { Bytes: bytes },
        FaceMatchThreshold: SEARCH_FACE_MATCH_THRESHOLD,
        MaxFaces: SEARCH_MAX_RESULTS,
      }))
      const seen = new Set<string>()
      for (const m of result.FaceMatches ?? []) {
        const id = m.Face?.ExternalImageId
        if (!id || seen.has(id)) continue
        seen.add(id)
        matches.push({ imageId: id, similarity: m.Similarity ?? 0 })
        if (matches.length >= SEARCH_MAX_RESULTS) break
      }
    } catch (err) {
      const code = (err as { name?: string })?.name
      if (code === 'InvalidParameterException') {
        matches = []
      } else {
        throw err
      }
    }
    imageIds = matches.map(m => m.imageId)

    // Persist to cache. Upsert covers the race where two concurrent requests
    // for the same (gallery, selfie) both miss and both call AWS.
    await sb.from('face_search_cache').upsert(
      {
        gallery_id: gallery.id,
        selfie_hash: selfieHash,
        matches: matches,
        image_ids: imageIds,
      },
      { onConflict: 'gallery_id,selfie_hash' },
    )

    // Rate-limit ledger only on real AWS calls. Cache hits cost us nothing
    // and shouldn't count.
    await sb.from('rekognition_search_log').insert({ gallery_id: gallery.id, ip_hash: ipHash })
  }

  // Hydrate matched image rows server-side. In private galleries, anon RLS
  // blocks the public images SELECT, so the client cannot fetch these on its
  // own — we have to return them here. Service-role bypasses RLS.
  let images: Array<Record<string, unknown>> = []
  if (imageIds.length > 0) {
    const { data: rows } = await sb
      .from('images')
      .select('id, filename, storage_path:web_preview_path, original_path, thumbnail_path, is_top_pick, sort_order, section_id')
      .in('id', imageIds)
    images = rows ?? []
  }

  return json({ matches, images })
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.startsWith('multipart/form-data')) {
      return await actionSearch(req)
    }

    const body = await req.json().catch(() => ({ action: 'ping' }))
    const action = body?.action ?? 'ping'

    switch (action) {
      case 'ping':               return await actionPing()
      case 'index_gallery':      return await actionIndexGallery(req, body)
      case 'delete_collection':  return await actionDeleteCollection(req, body)
      case 'delete_image_faces': return await actionDeleteImageFaces(req, body)
      default:
        return json({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    return errorResponse(err)
  }
})
