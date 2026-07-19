import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  RekognitionClient,
  ListCollectionsCommand,
  CreateCollectionCommand,
  DeleteCollectionCommand,
  IndexFacesCommand,
  DeleteFacesCommand,
  ListFacesCommand,
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

// ─── Per-image indexing (credit-metered — one credit per indexed photo) ─────
//
// Billing model (migration `face_index_billing_model`): uploads are free and
// storage-capped; a face-recognition credit is consumed only when an image is
// actually indexed. The per-image lifecycle is a DB state machine —
//   pending → processing → indexed | failed | skipped_no_allowance
// driven by three SECURITY DEFINER RPCs:
//   • reserve_face_index_credit  pending/skipped → processing, atomically
//       deducts one credit (balance>0 guard = never negative, never overshoot).
//       Returns 'reserved' | 'no_allowance' | 'not_claimable' | 'gallery_not_found'.
//   • finalize_face_index        processing → indexed, KEEPS the credit. Only
//       acts on rows still 'processing' (idempotent — a duplicate/late call
//       after a crash-window retry is a no-op, so no double-count).
//   • fail_face_index            processing → failed (terminal) or pending
//       (retry), REFUNDS the credit + writes a 'face_index_refund' ledger row.
//
// INVARIANT: an image in 'processing' holds exactly one reserved credit. That
// makes crash recovery safe — see recoverStuckProcessing / indexReserved.

interface IndexableImage {
  id: string
  storage_path: string | null
  face_index_attempts: number | null
}

type IndexOutcome = 'indexed' | 'failed' | 'skipped' | 'retry' | 'contended'

/** ExternalImageId-scoped face cleanup. Rekognition's ListFaces does not filter
 *  by ExternalImageId server-side, so we page through the whole collection
 *  (MaxResults 1000 + NextToken) and keep only the FaceIds registered under
 *  this image, then DeleteFaces them in ≤1000-id batches. This is the ONLY
 *  reliable way to purge orphans from a crash window where AWS IndexFaces
 *  succeeded but our DB writes (image_faces insert / finalize) never ran —
 *  the DB has no record of those FaceIds, so a DB-only delete would miss them
 *  and the re-index would double the faces. Called only on recovery/retry, so
 *  the full-collection scan cost is paid rarely. */
async function purgeExistingFaces(collectionId: string, imageId: string): Promise<number> {
  const faceIds: string[] = []
  let nextToken: string | undefined = undefined
  do {
    const res = await rekognition.send(new ListFacesCommand({
      CollectionId: collectionId,
      MaxResults: 1000,
      NextToken: nextToken,
    }))
    for (const f of res.Faces ?? []) {
      if (f.ExternalImageId === imageId && f.FaceId) faceIds.push(f.FaceId)
    }
    nextToken = res.NextToken
  } while (nextToken)

  for (let i = 0; i < faceIds.length; i += 1000) {
    const chunk = faceIds.slice(i, i + 1000)
    if (chunk.length > 0) {
      await rekognition.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: chunk }))
    }
  }
  return faceIds.length
}

/** Index an image that ALREADY holds a reserved credit (status 'processing').
 *  Used both by the happy path (right after reserve) and by crash recovery
 *  (credit reserved by a previous, dead run). Never reserves — the credit is
 *  already spent; on success we keep it, on terminal/transient failure
 *  fail_face_index refunds it. */
/** AWS IndexFaces succeeded but a DB write (image_faces insert / finalize) did
 *  not. The image MUST stay 'processing' (recoverable) — we neither refund nor
 *  mark it indexed; recoverStuckProcessing re-runs it later, reusing the held
 *  credit. Distinct from a pre-persistence failure, which refunds via fail. */
class PersistenceError extends Error {}

/** Transition a processing image to failed/pending + refund, checking the RPC
 *  result. If fail_face_index itself errors, the row stays 'processing' with its
 *  reserved credit → recovery converges it. We never throw past the batch. */
async function failImage(sb: SupabaseClient, image: IndexableImage, msg: string, terminal: boolean): Promise<void> {
  const { error } = await sb.rpc('fail_face_index', {
    p_image_id: image.id, p_error: msg, p_terminal: terminal,
  })
  if (error) {
    console.error('[failImage] fail_face_index RPC failed; left processing for recovery:', image.id, error.message)
  }
}

async function indexReserved(
  sb: SupabaseClient,
  collectionId: string,
  galleryId: string,
  image: IndexableImage,
): Promise<{ outcome: IndexOutcome; faceCount: number; error?: string }> {
  // On any retry (attempts>0) a prior attempt may have registered faces in AWS
  // and/or our DB before dying. Purge both so the re-index can't duplicate.
  const isRetry = (image.face_index_attempts ?? 0) > 0
  try {
    if (isRetry) {
      await purgeExistingFaces(collectionId, image.id) // throws on AWS error → caught → refund (pre-persistence)
      const { error: delErr } = await sb.from('image_faces').delete().eq('image_id', image.id)
      if (delErr) throw new Error(`image_faces delete failed: ${delErr.message}`)
    }

    // Missing preview path = unindexable. Refund the reserved credit (the
    // service was never used) and mark the image failed (terminal).
    if (!image.storage_path) {
      await failImage(sb, image, 'Web preview not available', true)
      return { outcome: 'failed', faceCount: 0, error: 'no preview path' }
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/gallery-images/${image.storage_path}`
    const bytes = await fetchImageBytes(publicUrl) // throws on fetch error → refund (pre-AWS)

    const result = await rekognition.send(new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: bytes },
      ExternalImageId: image.id,
      DetectionAttributes: [],
      MaxFaces: INDEX_MAX_FACES_PER_IMAGE,
      QualityFilter: 'AUTO',
    })) // throws on AWS error → refund (AWS did not complete)

    // ── AWS has now SUCCEEDED. Any failure below is a PersistenceError: keep the
    //    image 'processing' (recoverable), never refund, never mark indexed. ──
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
      const { error: insErr } = await sb.from('image_faces').insert(records)
      if (insErr) throw new PersistenceError(`image_faces insert failed: ${insErr.message}`)
    }

    // processing → indexed, keeps the reserved credit. Idempotent on status.
    // A successful AWS index with ZERO faces STILL keeps the credit (service used).
    const { data: fin, error: finErr } = await sb.rpc('finalize_face_index', {
      p_image_id: image.id, p_face_count: records.length,
    })
    if (finErr) throw new PersistenceError(`finalize_face_index failed: ${finErr.message}`)
    if (fin !== true) {
      // Row was no longer 'processing' when we finalized (should be unreachable
      // under single-ownership). Do NOT claim indexed; leave state as-is.
      console.warn('[indexReserved] finalize returned false (row not processing):', image.id)
      return { outcome: 'contended', faceCount: records.length }
    }
    return { outcome: 'indexed', faceCount: records.length }
  } catch (err) {
    if (err instanceof PersistenceError) {
      // AWS succeeded, DB persistence/finalize failed → preserve recoverable
      // 'processing' state. Never refund, never mark indexed. Recovery re-runs it.
      console.error('[indexReserved] persistence failure, left processing for recovery:', image.id, err.message)
      return { outcome: 'retry', faceCount: 0, error: err.message }
    }
    // Pre-persistence failure (retry purge/delete, storage fetch, AWS IndexFaces):
    // the index did not complete → REFUND via fail_face_index (terminal after
    // MAX_INDEX_ATTEMPTS). fail only touches rows still 'processing'.
    const msg = err instanceof Error ? err.message : String(err)
    const terminal = (image.face_index_attempts ?? 0) + 1 >= MAX_INDEX_ATTEMPTS
    await failImage(sb, image, msg, terminal)
    return { outcome: terminal ? 'failed' : 'retry', faceCount: 0, error: msg }
  }
}

/** Reserve a credit for a pending/skipped image, then index it. */
async function reserveAndIndex(
  sb: SupabaseClient,
  collectionId: string,
  galleryId: string,
  image: IndexableImage,
): Promise<{ outcome: IndexOutcome; faceCount: number; error?: string }> {
  const { data: reserve, error: resErr } = await sb.rpc('reserve_face_index_credit', {
    p_gallery_id: galleryId,
    p_image_id: image.id,
  })
  if (resErr) {
    // Reserve RPC failed — do NOT index (no credit claimed). Leave the image
    // pending/skipped for the next pass. Never index without a reservation.
    console.error('[reserveAndIndex] reserve_face_index_credit failed:', image.id, resErr.message)
    return { outcome: 'contended', faceCount: 0, error: resErr.message }
  }
  if (reserve === 'no_allowance') return { outcome: 'skipped', faceCount: 0 }
  if (reserve !== 'reserved') return { outcome: 'contended', faceCount: 0 } // not_claimable / gallery_not_found
  return indexReserved(sb, collectionId, galleryId, image)
}

/** Bounded-concurrency map — at most INDEX_CONCURRENCY in flight. A worker that
 *  rejects is captured as { ok:false } (never aborts the batch), and every
 *  settled promise is removed from the in-flight set in finally() so the loop
 *  can't wedge on a rejection. */
async function runBounded<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results: Array<{ ok: true; value: R } | { ok: false; error: unknown }> = []
  let cursor = 0
  const running = new Set<Promise<void>>()
  while (cursor < items.length || running.size > 0) {
    while (cursor < items.length && running.size < INDEX_CONCURRENCY) {
      const item = items[cursor++]
      const p = worker(item)
        .then(value => { results.push({ ok: true, value }) })
        .catch(error => { results.push({ ok: false, error }) })
        .finally(() => { running.delete(p) })
      running.add(p)
    }
    if (running.size > 0) await Promise.race(running).catch(() => {})
  }
  return results
}

/** Recover images orphaned in 'processing' by a previous crashed run. We only
 *  reach here holding the per-gallery lock (try_claim_face_indexing), and that
 *  claim only succeeds once the prior worker's lock is stale — so any row still
 *  'processing' is guaranteed to be an orphan, not a live in-flight index. The
 *  reserved credit is intact; we REUSE it (no re-charge): purge any orphan AWS
 *  faces, then re-index and finalize. */
async function recoverStuckProcessing(
  sb: SupabaseClient,
  galleryId: string,
  collectionId: string,
): Promise<void> {
  const { data: stuck, error: stuckErr } = await sb
    .from('images')
    .select('id, storage_path:web_preview_path, face_index_attempts')
    .eq('gallery_id', galleryId)
    .eq('face_index_status', 'processing')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true }) // stable tie-breaker: sort_order is not unique

  if (stuckErr) {
    console.error('[recoverStuckProcessing] select failed:', galleryId, stuckErr.message)
    return // leave orphans 'processing' for the next run
  }
  const orphans = stuck ?? []
  if (orphans.length === 0) return

  // Force the retry/purge path even if attempts was still 0 when the crash
  // happened — there may be AWS faces registered with no DB record.
  await runBounded(orphans, (img) =>
    indexReserved(sb, collectionId, galleryId, { ...img, face_index_attempts: (img.face_index_attempts ?? 0) + 1 }),
  )
}

/** Drives a gallery to completion under the new credit model. Runs inside
 *  EdgeRuntime.waitUntil() so it survives past the HTTP response.
 *
 *  Order of operations:
 *   1. Recover any 'processing' orphans from a crashed run (reuse their credit).
 *   2. Reserve credits for pending/skipped images in deterministic upload order.
 *      When allowance ≥ work, reserve+index concurrently (order is irrelevant —
 *      everyone gets a credit). When allowance < work, reserve the EARLIEST
 *      `allowance` images strictly in order, mark the remainder
 *      skipped_no_allowance, and never overshoot the balance.
 *   3. Flip the gallery to done / partial / failed from the terminal counts. */
async function processGallery(
  sb: SupabaseClient,
  galleryId: string,
  collectionId: string,
): Promise<void> {
  // 1. Crash recovery (idempotent, reuses reserved credits).
  await recoverStuckProcessing(sb, galleryId, collectionId)

  // 2. Fetch remaining work in deterministic upload order. 'skipped_no_allowance'
  //    is included so that adding allowance and re-running resumes those images.
  const { data: imgs, error: workErr } = await sb
    .from('images')
    .select('id, storage_path:web_preview_path, face_index_attempts')
    .eq('gallery_id', galleryId)
    .in('face_index_status', ['pending', 'skipped_no_allowance'])
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true }) // stable tie-breaker: sort_order is not unique

  if (workErr) {
    // Could not read the worklist — abort this run WITHOUT touching gallery
    // status; a later invocation retries. Never flip 'done' on incomplete data.
    console.error('[processGallery] worklist select failed:', galleryId, workErr.message)
    return
  }
  const work = (imgs ?? []) as IndexableImage[]

  if (work.length > 0) {
    const { data: summary, error: sumErr } = await sb.rpc('get_gallery_index_summary', { p_gallery_id: galleryId })
    if (sumErr || !summary) {
      console.error('[processGallery] summary RPC failed:', galleryId, sumErr?.message)
      return // do not proceed without an allowance figure; leave status as 'indexing'
    }
    const allowance = (summary.allowance as number) ?? 0

    if (allowance >= work.length) {
      // Ample allowance: every image will get a credit, so reserve+index
      // concurrently — completion order does not affect which images index.
      await runBounded(work, (img) => reserveAndIndex(sb, collectionId, galleryId, img))
    } else {
      // Constrained: hand the allowance to the EARLIEST images strictly in
      // upload order (sequential reserve = deterministic), then mark the rest
      // skipped and index the reserved set concurrently.
      const reserved: IndexableImage[] = []
      for (const img of work) {
        if (reserved.length >= allowance) break
        const { data: r, error: rErr } = await sb.rpc('reserve_face_index_credit', {
          p_gallery_id: galleryId,
          p_image_id: img.id,
        })
        if (rErr) { console.error('[processGallery] reserve failed:', img.id, rErr.message); break }
        if (r === 'reserved') reserved.push(img)
        else if (r === 'no_allowance') break // balance changed under us — stop
        // 'not_claimable': another worker/state took it; skip.
      }
      // Everything still pending/skipped beyond the allowance stays deferred.
      const { error: skipErr } = await sb
        .from('images')
        .update({ face_index_status: 'skipped_no_allowance' })
        .eq('gallery_id', galleryId)
        .eq('face_index_status', 'pending')
      if (skipErr) console.error('[processGallery] bulk-skip update failed:', galleryId, skipErr.message)

      await runBounded(reserved, (img) => indexReserved(sb, collectionId, galleryId, img))
    }
  }

  // 3. Authoritative final status from terminal counts. The DB trigger also
  //    flips done/partial on each finalize; this is the safety net that also
  //    covers the all-skipped case (where no finalize fires).
  const { data: fin, error: finErr } = await sb.rpc('get_gallery_index_summary', { p_gallery_id: galleryId })
  if (finErr || !fin) {
    console.error('[processGallery] final summary RPC failed; leaving status indexing:', galleryId, finErr?.message)
    return
  }
  const indexed = (fin.indexed as number) ?? 0
  const remaining = (fin.remaining as number) ?? 0 // pending + skipped_no_allowance
  const processing = (fin.processing as number) ?? 0 // recoverable images still in flight
  const failed = (fin.failed as number) ?? 0

  // Item 11: never flip a gallery to a terminal status while images remain
  // 'processing' (e.g. a post-AWS persistence failure left them recoverable).
  // Leave it 'indexing' so the next invocation's recovery converges them.
  if (processing > 0) {
    console.warn('[processGallery] images still processing; leaving status indexing:', galleryId, processing)
    return
  }

  let status: 'done' | 'partial' | 'failed'
  if (remaining > 0) status = 'partial' // allowance ran out — resumable
  else if (indexed === 0 && failed > 0) status = 'failed' // nothing indexable
  else status = 'done'

  const update: Record<string, unknown> = { face_index_status: status }
  if (status === 'done') {
    update.face_indexed_at = new Date().toISOString()
    update.face_index_error = null
  }
  const { error: statusErr } = await sb
    .from('galleries')
    .update(update)
    .eq('id', galleryId)
    .in('face_index_status', ['indexing', 'partial'])
  if (statusErr) console.error('[processGallery] final gallery status update failed:', galleryId, statusErr.message)
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

  // Count outstanding work before anything else. Under the credit model that's
  // any image still 'pending' or 'skipped_no_allowance' (the latter resumes
  // once allowance is topped up) OR any 'processing' orphan from a crashed run.
  // 'failed' images are terminal and do NOT count. If there's nothing to do,
  // short-circuit — avoids a briefly-flickering 'indexing' status and skips an
  // unnecessary Rekognition CreateCollection + background worker.
  const { count: unindexedCount } = await sb
    .from('images')
    .select('id', { count: 'exact', head: true })
    .eq('gallery_id', gallery.id)
    .in('face_index_status', ['pending', 'processing', 'skipped_no_allowance'])

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
  const unlockTokenRaw = form.get('token')
  const unlockToken = typeof unlockTokenRaw === 'string' && unlockTokenRaw.length > 0
    ? unlockTokenRaw
    : null
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

  // Server-side gate enforcement. gallery_token_is_valid passes through any
  // gallery that has not opted into the signed gate (legacy behaviour) and
  // requires a valid unlock token for galleries that have. Without this, the
  // selfie endpoint is a back door around the password gate.
  const { data: gateOk } = await sb.rpc('gallery_token_is_valid', {
    p_gallery_id: gallery.id,
    p_token: unlockToken,
  })
  if (!gateOk) {
    return json({ error: 'unauthorized' }, 401)
  }
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
      .select('id, filename, storage_path:web_preview_path, original_path, original_uploaded, thumbnail_path, is_top_pick, sort_order, section_id')
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
