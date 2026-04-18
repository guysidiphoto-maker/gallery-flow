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

const SEARCH_RATE_LIMIT_PER_HOUR = 10
const SEARCH_RATE_WINDOW_MS = 60 * 60 * 1000
const SEARCH_MAX_SELFIE_BYTES = 5 * 1024 * 1024
/** Minimum similarity % to count as a match. AWS recommends 80 for general
 *  use; lower = more matches + more false positives. */
const SEARCH_FACE_MATCH_THRESHOLD = 80
/** Max matches returned from the collection per selfie search.
 *  Passed to Rekognition as MaxFaces — default is 1, which is WAY too low. */
const SEARCH_MAX_RESULTS = 100
const INDEX_MAX_FACES_PER_IMAGE = 15
/** Concurrent IndexFaces calls from a single edge-function invocation. */
const INDEX_CONCURRENCY = 6
/** If a gallery is already 'indexing' and its face_indexed_at is fresher than
 *  this, we assume another invocation is in-flight and bail. Prevents two
 *  parallel runs from double-indexing the same images. */
const INDEXING_LOCK_STALENESS_MS = 10 * 60 * 1000

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

async function indexOneImage(
  sb: SupabaseClient,
  collectionId: string,
  galleryId: string,
  image: { id: string; storage_path: string; face_indexed_at: string | null },
): Promise<{ indexed: boolean; faceCount: number; error?: string }> {
  if (image.face_indexed_at) return { indexed: false, faceCount: 0 }

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
    // to 'done' once the last image is in.
    await sb
      .from('images')
      .update({ face_indexed_at: new Date().toISOString(), face_count: records.length })
      .eq('id', image.id)

    await sb.rpc('increment_face_indexed_count', { p_gallery_id: galleryId })

    return { indexed: true, faceCount: records.length }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
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
    .select('id, storage_path, face_indexed_at')
    .eq('gallery_id', galleryId)
    .is('face_indexed_at', null)
    .order('sort_order', { ascending: true })

  const pending = imgs ?? []
  if (pending.length === 0) {
    // Nothing to do; just in case the trigger hasn't fired, flip the gallery.
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
    if (!result.indexed && result.error) {
      failureCount += 1
      // Keep a note of the last failure on the gallery — mostly for debugging.
      await sb.from('galleries')
        .update({ face_index_error: `Image ${image.id}: ${result.error}` })
        .eq('id', galleryId)
    }
  }

  while (cursor < pending.length || running.size > 0) {
    while (cursor < pending.length && running.size < INDEX_CONCURRENCY) {
      const p = processOne(pending[cursor++]).then(() => { running.delete(p) })
      running.add(p)
    }
    if (running.size > 0) await Promise.race(running)
  }

  // Final safety net: if every image failed, mark the gallery failed. The
  // happy-path flip to 'done' is handled by the DB trigger.
  if (failureCount === pending.length && pending.length > 0) {
    await sb.from('galleries')
      .update({ face_index_status: 'failed' })
      .eq('id', galleryId)
      .eq('face_index_status', 'indexing')
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

  // Refuse to double-run if a recent invocation is still in flight. Stale
  // locks (e.g., edge function crashed) are ignored after 10 minutes.
  if (gallery.face_index_status === 'indexing' && gallery.face_indexed_at) {
    const last = new Date(gallery.face_indexed_at).getTime()
    if (Date.now() - last < INDEXING_LOCK_STALENESS_MS) {
      return json({ started: false, alreadyRunning: true })
    }
  }

  // Create the collection (idempotent).
  const collectionId = gallery.id
  try {
    await rekognition.send(new CreateCollectionCommand({ CollectionId: collectionId }))
  } catch (err) {
    const code = (err as { name?: string })?.name
    if (code !== 'ResourceAlreadyExistsException') throw err
  }

  await sb.from('galleries')
    .update({
      face_index_enabled: true,
      face_index_status: 'indexing',
      rekognition_collection_id: collectionId,
      face_index_error: null,
      // Bump face_indexed_at so the lock is fresh; the trigger will reset it
      // to the real completion time when done.
      face_indexed_at: new Date().toISOString(),
    })
    .eq('id', gallery.id)

  const pendingCount = Math.max(0, (gallery.image_count ?? 0) - (gallery.face_indexed_count ?? 0))

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

  return json({ started: true, pending: pendingCount })
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
    .select('id, status, face_index_status, rekognition_collection_id')
    .eq('id', galleryId)
    .maybeSingle()
  if (!gallery) return json({ error: 'Gallery not found' }, 404)
  if (gallery.status !== 'live') return json({ error: 'Gallery not live' }, 404)
  if (gallery.face_index_status !== 'done' || !gallery.rekognition_collection_id) {
    return json({ error: 'Face search not available for this gallery' }, 404)
  }

  const ipHash = await hashIp(getClientIp(req))
  const since = new Date(Date.now() - SEARCH_RATE_WINDOW_MS).toISOString()
  const { count: recent } = await sb
    .from('rekognition_search_log')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since)
  if ((recent ?? 0) >= SEARCH_RATE_LIMIT_PER_HOUR) {
    return json({ error: 'Too many searches. Try again later.' }, 429)
  }

  const bytes = new Uint8Array(await selfie.arrayBuffer())
  let matches: Array<{ imageId: string; similarity: number }> = []
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

  await sb.from('rekognition_search_log').insert({ gallery_id: gallery.id, ip_hash: ipHash })
  return json({ matches })
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
