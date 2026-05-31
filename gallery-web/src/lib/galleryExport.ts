// galleryExport.ts — portable per-gallery backup as a single ZIP.
//
// Pixflow's trust story: a photographer should never feel locked in. This
// helper bundles every original photo of a gallery (with the gallery shape
// preserved in a metadata.json sidecar) into one downloadable archive that
// can be restored elsewhere or kept as an offline backup.
//
// Phase 1 is client-side: the browser fetches each image and zips locally.
// For very large galleries (~500+ originals) Phase 2 should spawn a
// server-side render to S3 + presigned-URL download so the photographer
// doesn't have to keep the tab open for minutes. See note at saveAs().
//
// Pattern intentionally mirrors the in-app batch-download in App.tsx so the
// two flows behave the same (JSZip + createObjectURL + anchor click).

import { supabase, storageUrl } from '../supabase'

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

/**
 * Fetches a gallery's row, sections and images from Supabase, downloads each
 * original (with a HEAD-guarded fallback to the web preview when the
 * original_uploaded flag is false), and triggers a browser download of a
 * single ZIP containing `photos/`, `metadata.json` and `README.txt`.
 */
export async function exportGalleryAsZip(
  galleryId: string,
  opts: ExportOptions = {},
): Promise<ExportResult> {
  const onProgress = opts.onProgress ?? (() => {})
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES

  // ── 1. Fetch gallery, sections, images ────────────────────────────────────
  onProgress({ phase: 'metadata', current: 0, total: 1 })

  const { data: gallery, error: gErr } = await supabase
    .from('galleries')
    .select('id, name, slug, delivery_settings')
    .eq('id', galleryId)
    .single()
  if (gErr || !gallery) {
    throw new Error(`Gallery not found: ${gErr?.message ?? 'unknown error'}`)
  }

  // gallery_sections.description may or may not exist depending on schema
  // version — select * to be tolerant. Result is small (one row per section).
  const { data: sectionsRaw } = await supabase
    .from('gallery_sections')
    .select('*')
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: true })
  const sections = (sectionsRaw ?? []) as Array<{
    id: string
    name: string
    description?: string | null
    sort_order: number
  }>

  // Images: bring the full path set so we can prefer originals when available.
  const { data: imagesRaw, error: iErr } = await supabase
    .from('images')
    .select(
      'id, filename, web_preview_path, original_path, original_uploaded, thumbnail_path, is_top_pick, sort_order, section_id',
    )
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: true })
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
  // Mirrors App.tsx (`gallery?.demo_expires_at ? 'demo-uploads' : ...`) — the
  // owner-facing dashboard never has demo galleries open, so default to the
  // production bucket.
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

    // Prefer the original; HEAD-guard so a stale original_uploaded flag
    // doesn't 404 the export. Same belt-and-braces rule App.tsx uses.
    let url: string | null = null
    let servedFrom: 'original' | 'web_preview' = 'web_preview'
    if (img.original_path) {
      const originalUrl = storageUrl(bucket, img.original_path)
      if (img.original_uploaded) {
        url = originalUrl
        servedFrom = 'original'
      } else {
        try {
          const head = await fetch(originalUrl, { method: 'HEAD' })
          if (head.ok) {
            url = originalUrl
            servedFrom = 'original'
          }
        } catch {
          // network blip — treat as missing, fall through to web preview
        }
      }
    }
    if (!url) {
      url = storageUrl(bucket, img.web_preview_path)
      servedFrom = 'web_preview'
    }

    let blob: Blob | null = null
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`http_${res.status}`)
      blob = await res.blob()
    } catch (err) {
      failedCount += 1
      console.warn('[galleryExport] failed to fetch image', img.id, err)
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

// ── Internals ───────────────────────────────────────────────────────────────

function safeFolderName(raw: string): string {
  // Keep Hebrew / Latin letters and digits; collapse the rest to "-".
  return (
    raw
      .replace(/[^\p{L}\p{N}_-]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'gallery'
  )
}

function uniqueFilename(name: string, sortOrder: number, used: Set<string>): string {
  let candidate = name
  if (used.has(candidate)) {
    const dot = candidate.lastIndexOf('.')
    const base = dot > 0 ? candidate.slice(0, dot) : candidate
    const ext = dot > 0 ? candidate.slice(dot) : ''
    candidate = `${base}-${sortOrder}${ext}`
  }
  used.add(candidate)
  return candidate
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function buildReadme(galleryName: string, imageCount: number, exportedAt: string): string {
  return [
    '================================================================',
    `  Pixflow Gallery Export — ${galleryName}`,
    `  Exported: ${exportedAt}`,
    `  Photos:   ${imageCount}`,
    '================================================================',
    '',
    'STRUCTURE / מבנה הקובץ',
    '----------------------',
    '  photos/<section_name>/<sort_order>_<filename>.jpg',
    '      The original photos (falls back to the web preview when an',
    '      original was not uploaded to storage).',
    '',
    '  metadata.json',
    '      Full gallery shape: settings, sections, and the ordered',
    '      image list with section + top-pick flags. schema_version: 1.',
    '',
    '  README.txt',
    '      This file.',
    '',
    'RESTORE / שחזור',
    '---------------',
    '  This archive is portable: the photos are standard JPEG/PNG/etc.',
    '  files and metadata.json is plain JSON. Any future tool — Pixflow',
    '  or otherwise — can rebuild the gallery from these two pieces.',
    '',
    '  הקובץ הזה נייד: התמונות הן קבצי JPEG רגילים ו-metadata.json',
    '  הוא JSON פשוט. כל כלי עתידי (פיקספלו או אחר) יכול לשחזר את',
    '  הגלריה מהשניים האלה.',
    '',
    'NOTES / הערות',
    '-------------',
    '  - Images whose "served_from" is "web_preview" in metadata.json',
    '    are compressed copies (the original was never uploaded).',
    '  - Section folders use safe-slug names; the human-readable name',
    '    lives in metadata.json under sections[].name.',
    '',
  ].join('\n')
}
