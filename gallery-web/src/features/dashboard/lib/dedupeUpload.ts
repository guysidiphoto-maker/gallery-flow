import { pathHash } from './uploadPipeline'

// Pre-upload duplicate detection keyed on the pipeline's content key
// (pathHash of galleryId/name/size/lastModified): exact matches are `duplicate`,
// same filename with a different key is `review` (never auto-skipped), else `new`.

export interface ExistingImageRef {
  filename?: string | null
  storage_path?: string | null
  original_path?: string | null
  web_preview_path?: string | null
}

export interface ExistingKeys {
  hashes: Set<string>
  names: Set<string>
}

// Pull the 8-hex content hash out of an `.../originals/<hash8>_<name>` path.
const HASH_RE = /\/originals\/([0-9a-f]{8})_/i

/** Build the lookup sets from the gallery's existing image rows. */
export function extractExistingKeys(images: ExistingImageRef[]): ExistingKeys {
  const hashes = new Set<string>()
  const names = new Set<string>()
  for (const img of images) {
    if (img.filename) names.add(img.filename)
    for (const p of [img.storage_path, img.original_path, img.web_preview_path]) {
      if (!p) continue
      const m = HASH_RE.exec(p)
      if (m) hashes.add(m[1].toLowerCase())
    }
  }
  return { hashes, names }
}

/** Content key for a candidate file — identical to the upload pipeline's. */
export function contentKey(galleryId: string, file: File): string {
  return pathHash(`${galleryId}/${file.name}/${file.size}/${file.lastModified}`)
}

export interface UploadClassification {
  newFiles: File[]
  duplicates: File[]
  review: File[]
}

export function classifyForUpload(
  files: File[],
  galleryId: string,
  existing: ExistingKeys,
): UploadClassification {
  const newFiles: File[] = []
  const duplicates: File[] = []
  const review: File[] = []
  for (const f of files) {
    const key = contentKey(galleryId, f)
    if (existing.hashes.has(key)) {
      duplicates.push(f)
    } else if (f.name && existing.names.has(f.name)) {
      review.push(f)
    } else {
      newFiles.push(f)
    }
  }
  return { newFiles, duplicates, review }
}
