// Where a paused import picks up again. Pure (no I/O) so it is testable: merges
// the job's persisted state (job_status) with what this session already did.
import type { CollectionStatus } from './importApi'

export type PriorFileStatus = 'uploaded' | 'skipped_duplicate'

export interface PersistedCollection { id: string; target_gallery_id: string | null; status: CollectionStatus }
export interface PersistedFile { collection_id: string; filename: string; status: string; content_hash: string | null }

/** What this browser session already knows, kept across pause/resume. */
export interface RunMemory {
  galleryIds: Map<string, string>
  priorFiles: Map<string, Map<string, PriorFileStatus>>
  finished: Set<string>
}

export interface ResumeTarget {
  skip: boolean
  targetGalleryId: string | null
  priorFiles: Map<string, PriorFileStatus>
}

const DONE: ReadonlySet<CollectionStatus> = new Set(['imported', 'skipped'])

/**
 * Per collection: skip it when it already finished, reuse its gallery when one
 * was created (never create a second), and don't redo files already uploaded
 * or skipped. Hashes of persisted files seed cross-collection dedupe.
 */
export function planResume(
  collectionIds: string[],
  persisted: { collections: PersistedCollection[]; files: PersistedFile[] } | null,
  memory: RunMemory,
): { targets: Map<string, ResumeTarget>; knownHashes: Set<string> } {
  const byId = new Map((persisted?.collections ?? []).map(c => [c.id, c]))
  const knownHashes = new Set<string>()
  const filesByCol = new Map<string, Map<string, PriorFileStatus>>()
  for (const f of persisted?.files ?? []) {
    if (f.status !== 'uploaded' && f.status !== 'skipped_duplicate') continue
    if (f.content_hash) knownHashes.add(f.content_hash)
    let m = filesByCol.get(f.collection_id)
    if (!m) { m = new Map(); filesByCol.set(f.collection_id, m) }
    if (m.get(f.filename) !== 'uploaded') m.set(f.filename, f.status)
  }

  const targets = new Map<string, ResumeTarget>()
  for (const id of collectionIds) {
    const row = byId.get(id)
    const priorFiles = memory.priorFiles.get(id) ?? new Map<string, PriorFileStatus>()
    for (const [name, status] of filesByCol.get(id) ?? []) {
      if (priorFiles.get(name) !== 'uploaded') priorFiles.set(name, status)
    }
    memory.priorFiles.set(id, priorFiles)
    targets.set(id, {
      skip: memory.finished.has(id) || (row ? DONE.has(row.status) : false),
      targetGalleryId: memory.galleryIds.get(id) ?? row?.target_gallery_id ?? null,
      priorFiles,
    })
  }
  return { targets, knownHashes }
}
