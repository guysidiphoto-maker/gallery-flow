import { supabase } from './supabase'
import { usePublish } from '../store/publish'

// ─── Face Recognition Client ────────────────────────────────────────────────
// The heavy lifting lives in the `rekognition` edge function, which runs the
// per-image loop inside EdgeRuntime.waitUntil(). The client here just kicks
// it off and polls the gallery row for progress.

const FUNCTION_NAME = 'rekognition'
const POLL_INTERVAL_MS = 3000

function log(step: string, detail?: string | number) {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`[face-index ${ts}] ${step}${detail != null ? ` — ${detail}` : ''}`)
}

async function callFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body })
  if (error) throw new Error(error.message || 'Edge function failed')
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String((data as { error: unknown }).error))
  }
  return data as T
}

// ─── Actions ────────────────────────────────────────────────────────────────

export async function indexGallery(galleryId: string): Promise<{ started: boolean; pending?: number; alreadyRunning?: boolean }> {
  return await callFunction({ action: 'index_gallery', galleryId })
}

export async function deleteCollection(galleryId: string): Promise<void> {
  try {
    await callFunction({ action: 'delete_collection', galleryId })
  } catch (err) {
    log('delete-collection:error', err instanceof Error ? err.message : String(err))
  }
}

export async function deleteImageFaces(galleryId: string, imageId: string): Promise<void> {
  try {
    await callFunction({ action: 'delete_image_faces', galleryId, imageId })
  } catch (err) {
    log('delete-image-faces:error', err instanceof Error ? err.message : String(err))
  }
}

// ─── Progress polling ───────────────────────────────────────────────────────
// The edge function runs independently of the client; to surface progress in
// the UI we just read the gallery row every few seconds until the status is
// terminal ('done' or 'failed').

export interface FaceIndexSnapshot {
  status: 'pending' | 'indexing' | 'done' | 'failed' | null
  total: number
  indexed: number
  error: string | null
}

export async function fetchFaceIndexSnapshot(galleryId: string): Promise<FaceIndexSnapshot | null> {
  const { data } = await supabase
    .from('galleries')
    .select('face_index_status, face_indexed_count, face_index_error, image_count')
    .eq('id', galleryId)
    .maybeSingle()
  if (!data) return null
  return {
    status: data.face_index_status ?? null,
    total: data.image_count ?? 0,
    indexed: data.face_indexed_count ?? 0,
    error: data.face_index_error ?? null,
  }
}

// If `face_indexed_count` hasn't moved for this long while status is still
// 'indexing', we treat the worker as stalled and kick the edge function
// again to re-claim. The server-side lock staleness is 10 minutes, so we
// wait a bit longer than that to give the live worker every chance to
// resume on its own before piling on a duplicate claim.
const STALL_THRESHOLD_MS = 12 * 60 * 1000
// Don't auto-resume more than once per minute even if we're still seeing
// no progress — gives the new claim time to actually start before we'd
// flag it as stalled again.
const AUTO_RESUME_COOLDOWN_MS = 60 * 1000

/** Returns a stop function. Polls until status is terminal or stopped.
 *  Auto-resumes a stalled `indexing` gallery by re-invoking index_gallery
 *  on the edge function — the new claim succeeds because the server-side
 *  lock has staled (10 min) by the time our threshold fires (12 min). */
export function pollFaceIndexProgress(
  galleryId: string,
  onSnapshot: (snap: FaceIndexSnapshot) => void,
): () => void {
  let stopped = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  let lastIndexed = -1
  let lastProgressAt = Date.now()
  let lastAutoResumeAt = 0

  const tick = async () => {
    if (stopped) return
    try {
      const snap = await fetchFaceIndexSnapshot(galleryId)
      if (snap) {
        onSnapshot(snap)
        if (snap.status === 'done' || snap.status === 'failed') {
          stopped = true
          return
        }
        if (snap.indexed !== lastIndexed) {
          lastIndexed = snap.indexed
          lastProgressAt = Date.now()
        }
        const now = Date.now()
        const stalled =
          snap.status === 'indexing' &&
          now - lastProgressAt > STALL_THRESHOLD_MS &&
          now - lastAutoResumeAt > AUTO_RESUME_COOLDOWN_MS
        if (stalled) {
          lastAutoResumeAt = now
          log('auto-resume', `no progress for ${Math.round((now - lastProgressAt) / 1000)}s — re-invoking index_gallery`)
          // Fire-and-forget: the existing poll loop will see new progress.
          indexGallery(galleryId).catch(err => {
            log('auto-resume:failed', err instanceof Error ? err.message : String(err))
          })
        }
      }
    } catch {
      // Transient failures during polling are non-fatal; just try again.
    }
    if (!stopped) timeoutId = setTimeout(tick, POLL_INTERVAL_MS)
  }

  timeoutId = setTimeout(tick, POLL_INTERVAL_MS)
  return () => {
    stopped = true
    if (timeoutId) clearTimeout(timeoutId)
  }
}

// ─── High-level orchestration ───────────────────────────────────────────────
// Kicks off indexing on the edge function, mirrors progress into the publish
// store so the UI can show a progress card, and polls until the gallery
// reaches a terminal state. Safe to call multiple times — the edge function
// is idempotent (already-indexed images are skipped).

/**
 * If the gallery already has face indexing enabled, resume/extend indexing.
 * Safe to call after any operation that might have added new image rows
 * (e.g., updateGalleryImages, a future add-images flow). Returns true if
 * indexing was triggered, false if the gallery isn't face-indexed.
 *
 * Unlike startFaceIndexingInBackground, this will NOT enable face indexing
 * on a gallery that didn't have it — that's a deliberate opt-in at publish
 * time or via the explicit "Run face indexing" button.
 */
export async function resumeFaceIndexingIfEnabled(galleryId: string): Promise<boolean> {
  const { data } = await supabase
    .from('galleries')
    .select('face_index_enabled')
    .eq('id', galleryId)
    .maybeSingle()
  if (!data?.face_index_enabled) return false
  startFaceIndexingInBackground(galleryId)
  return true
}

export function startFaceIndexingInBackground(galleryId: string): void {
  const store = usePublish.getState()
  store.setFaceIndex({ enabled: true, status: 'indexing', total: 0, indexed: 0, failed: 0, error: undefined })

  indexGallery(galleryId)
    .then(result => {
      log('face-index:started', result.alreadyRunning ? 'already running' : `pending=${result.pending ?? 0}`)
    })
    .catch(err => {
      const msg = err instanceof Error ? err.message : String(err)
      log('face-index:exception', msg)
      store.setFaceIndex({ status: 'failed', error: msg })
    })

  pollFaceIndexProgress(galleryId, (snap) => {
    store.setFaceIndex({
      total: snap.total,
      indexed: snap.indexed,
      status: snap.status === 'done' ? 'done'
            : snap.status === 'failed' ? 'failed'
            : 'indexing',
      error: snap.error ?? undefined,
    })
  })
}
