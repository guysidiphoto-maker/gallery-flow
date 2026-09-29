// Portable per-gallery backup: every original plus a metadata.json sidecar in
// one client-side ZIP (JSZip + object URL). Very large galleries would be better
// served server-side; DEFAULT_MAX_BYTES caps what the browser attempts.

import { getGallery } from '@/shared/data/galleries'
import { listImagesForExport } from '@/shared/data/images'
import { listGallerySections } from '@/shared/data/sections'
import { downloadStorageObject } from '@/shared/data/storage'
import { buildReadme, safeFolderName, saveBlob, uniqueFilename } from './galleryExportFiles'

// ── Public API ──────────────────────────────────────────────────────────────

export interface ExportProgress {
  phase: 'metadata' | 'downloading' | 'zipping' | 'saving'
  current: number
  total: number
}

export interface ExportOptions {
  onProgress?: (p: ExportProgress) => void
  /** Soft cap (bytes). When the running estimate exceeds this we bail out
   *  before zipping so the browser doesn't OOM. Default 2 GB. */
  maxBytes?: number
}

export interface ExportResult {
  /** Final filename of the saved ZIP. */
  filename: string
  /** Number of images successfully archived. */
  imageCount: number
  /** Number of images that failed to download and were skipped. */
  failedCount: number
  /** Whether the cap was hit (export aborted before zipping). */
  capExceeded: boolean
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB

/** Download a gallery's originals (falling back to the web preview) and save one
 *  ZIP with `photos/`, `metadata.json` and `README.txt`. */
export async function exportGalleryAsZip(
  galleryId: string,
  opts: ExportOptions = {},
): Promise<ExportResult> {
  const onProgress = opts.onProgress ?? (() => {})
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES

  // ── 1. Fetch gallery, sections, images ────────────────────────────────────
  onProgress({ phase: 'metadata', current: 0, total: 1 })

  // Independent reads, fetched together. Sections use `*` to tolerate schemas
  // without `description`; images bring every path so originals can be preferred.
  const [
    { data: gallery, error: gErr },
    { data: sectionsRaw },
    { data: imagesRaw, error: iErr },
  ] = await Promise.all([
    getGallery(galleryId, 'id, name, slug, delivery_settings'),
    listGallerySections(galleryId, '*'),
    listImagesForExport(galleryId),
  ])
  if (gErr || !gallery) {
    throw new Error(`Gallery not found: ${gErr?.message ?? 'unknown error'}`)
  }
  const sections = (sectionsRaw ?? []) as Array<{
    id: string
    name: string
    description?: string | null
    sort_order: number
  }>

  if (iErr) {
    throw new Error(`Failed to fetch images: ${iErr.message}`)
  }
  const images = (imagesRaw ?? []) as Array<{
    id: string
    filename: string | null
    web_preview_path: string
    original_path: string | null
    original_uploaded: boolean | null
    thumbnail_path: string | null
    is_top_pick: boolean
    sort_order: number
    section_id: string | null
  }>

  onProgress({ phase: 'metadata', current: 1, total: 1 })

  // ── 2. Pick the storage bucket ────────────────────────────────────────────
  // The owner dashboard never opens demo galleries, so default to production.
  const ds = (gallery.delivery_settings ?? {}) as Record<string, unknown>
  const bucket =
    (ds.imageBucket as string | undefined) ||
    'gallery-images'

  const sectionById = new Map<string, { name: string; slug: string }>()
  for (const s of sections) {
    sectionById.set(s.id, { name: s.name, slug: safeFolderName(s.name) })
  }

  // ── 3. Dynamic-import JSZip ───────────────────────────────────────────────
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  // ── 4. Fetch each image, prefer original, fall back to web preview ────────
  const total = images.length
  let downloadedBytes = 0
  let failedCount = 0
  const usedNames = new Set<string>()

  onProgress({ phase: 'downloading', current: 0, total })

  const metadataImages: Array<{
    filename: string
    section: string | null
    sort_order: number
    is_top_pick: boolean
    served_from: 'original' | 'web_preview'
  }> = []

  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const sectionInfo = img.section_id ? sectionById.get(img.section_id) : null
    const sectionFolder = sectionInfo?.slug ?? '_unsectioned'

    // Authenticated owner download (never a public URL) so export keeps working
    // with private originals; any error falls back to the web preview.
    let blob: Blob | null = null
    let servedFrom: 'original' | 'web_preview' = 'web_preview'
    if (img.original_path) {
      const { data, error } = await downloadStorageObject(bucket, img.original_path)
      if (!error && data) {
        blob = data
        servedFrom = 'original'
      }
    }
    if (!blob) {
      const { data, error } = await downloadStorageObject(bucket, img.web_preview_path)
      if (!error && data) {
        blob = data
        servedFrom = 'web_preview'
      }
    }
    if (!blob) {
      failedCount += 1
      console.warn('[galleryExport] failed to download image', img.id)
    }

    if (blob) {
      downloadedBytes += blob.size
      if (downloadedBytes > maxBytes) {
        // Bail before generating — the in-memory ZIP would push the tab OOM.
        throw new ExportCapExceededError(
          downloadedBytes,
          maxBytes,
          i + 1,
          total,
        )
      }
      const safeName = uniqueFilename(
        img.filename || `${String(img.sort_order).padStart(4, '0')}.jpg`,
        img.sort_order,
        usedNames,
      )
      const pathInZip = `photos/${sectionFolder}/${String(img.sort_order).padStart(4, '0')}_${safeName}`
      zip.file(pathInZip, blob)
      metadataImages.push({
        filename: safeName,
        section: sectionInfo?.name ?? null,
        sort_order: img.sort_order,
        is_top_pick: !!img.is_top_pick,
        served_from: servedFrom,
      })
    }

    onProgress({ phase: 'downloading', current: i + 1, total })
  }

  // ── 5. metadata.json + README.txt ─────────────────────────────────────────
  const exportedAt = new Date().toISOString()
  const metadata = {
    schema_version: 1,
    exported_at: exportedAt,
    name: gallery.name,
    slug: gallery.slug ?? null,
    delivery_settings: ds,
    sections: sections.map(s => ({
      name: s.name,
      description: s.description ?? null,
      sort_order: s.sort_order,
    })),
    images: metadataImages,
    notes: {
      failed_count: failedCount,
      total_bytes: downloadedBytes,
      bucket,
    },
  }
  zip.file('metadata.json', JSON.stringify(metadata, null, 2))
  zip.file('README.txt', buildReadme(gallery.name, metadata.images.length, exportedAt))

  // ── 6. Zip + save ─────────────────────────────────────────────────────────
  onProgress({ phase: 'zipping', current: 0, total: 100 })
  const zipBlob = await zip.generateAsync(
    { type: 'blob' },
    meta => onProgress({ phase: 'zipping', current: Math.round(meta.percent), total: 100 }),
  )

  onProgress({ phase: 'saving', current: 0, total: 1 })
  const safeSlug = safeFolderName(gallery.slug || gallery.name || 'gallery')
  const dateStamp = new Date().toISOString().slice(0, 10)
  const filename = `${safeSlug}_export_${dateStamp}.zip`

  // App.tsx pattern — no file-saver dep; createObjectURL + click anchor.
  // Phase 2 (server-side render to S3) would skip this and hand back a
  // presigned URL instead, sparing the browser the memory pressure.
  saveBlob(zipBlob, filename)
  onProgress({ phase: 'saving', current: 1, total: 1 })

  return {
    filename,
    imageCount: metadataImages.length,
    failedCount,
    capExceeded: false,
  }
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class ExportCapExceededError extends Error {
  readonly bytes: number
  readonly cap: number
  readonly imagesDownloaded: number
  readonly totalImages: number
  constructor(bytes: number, cap: number, imagesDownloaded: number, totalImages: number) {
    super(
      `Gallery export exceeds soft cap (${(bytes / 1024 / 1024).toFixed(0)} MB > ${(
        cap /
        1024 /
        1024
      ).toFixed(0)} MB).`,
    )
    this.name = 'ExportCapExceededError'
    this.bytes = bytes
    this.cap = cap
    this.imagesDownloaded = imagesDownloaded
    this.totalImages = totalImages
  }
}
