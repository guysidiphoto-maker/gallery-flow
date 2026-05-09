// gallery-zip.ts — Phase 4.6
//
// Streams a ZIP of selected images for an anonymous gallery viewer. Replaces
// the JSZip client-side bundling that today fetches each photo via public
// URL. After the bucket flip, the public URL won't work; this endpoint uses
// the service-role key to fetch from the (private) bucket and streams the
// ZIP back to the browser.
//
// Auth model:
//   1. Origin allowlist (existing guard, mirrors append-event-posts).
//   2. Public-viewer token (pvt) — must be alive, scoped to the galleryId
//      passed in the request. Verified via the same RPC the signed_url
//      action uses (verify_public_gallery_session).
//   3. The image_ids in the request must all belong to the gallery — we
//      validate via a single SELECT before pulling any bytes.
//
// Cost: ~$0.50 per 1000-photo download on Vercel Pro at 300s timeout (per
// the Phase 4 master plan estimate). Galleries >2GB risk timeout; for those
// the frontend can fall back to client-side fetches over signed URLs.

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import archiver from 'archiver'

export const config = {
  runtime: 'nodejs',
}
export const maxDuration = 300 // 5 minutes (Vercel Pro)

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRIVATE_BUCKET = 'gallery-images'
const MAX_IMAGES_PER_REQUEST = 500
const FETCH_CONCURRENCY = 6

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  try {
    const u = new URL(origin)
    const host = u.hostname
    if (host === 'localhost' || host === '127.0.0.1') return true
    if (host.endsWith('.vercel.app')) return true
    if (host === 'pixflow.co.il' || host.endsWith('.pixflow.co.il')) return true
    if (host === 'eclipsemedia.co.il' || host.endsWith('.eclipsemedia.co.il')) return true
    return false
  } catch {
    return false
  }
}

interface ZipBody {
  galleryId?: string
  imageIds?: string[]
  pvt?: string
  filenameStem?: string
  /** 'web' (default) | 'original'. 'original' tries original_path with a
   *  per-row fallback to web_preview_path when original_uploaded is false. */
  quality?: 'web' | 'original'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' }); return
  }
  if (!isAllowedOrigin(req.headers.origin as string | undefined)) {
    res.status(403).json({ ok: false, error: 'origin_not_allowed' }); return
  }
  if (!supabase) {
    res.status(500).json({ ok: false, error: 'supabase_not_configured' }); return
  }

  const body = (req.body || {}) as ZipBody
  const galleryId = String(body.galleryId ?? '').trim()
  const pvt = String(body.pvt ?? '').trim()
  const quality = body.quality === 'original' ? 'original' : 'web'
  const filenameStem = (body.filenameStem ?? 'photos').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 60) || 'photos'
  const imageIds: string[] = Array.isArray(body.imageIds) ? body.imageIds.filter(s => typeof s === 'string') : []

  if (!galleryId || !UUID_RE.test(galleryId)) {
    res.status(400).json({ ok: false, error: 'invalid_payload' }); return
  }
  if (imageIds.length === 0) {
    res.status(400).json({ ok: false, error: 'no_images_requested' }); return
  }
  if (imageIds.length > MAX_IMAGES_PER_REQUEST) {
    res.status(400).json({ ok: false, error: 'too_many_images', max: MAX_IMAGES_PER_REQUEST }); return
  }
  if (!imageIds.every(id => UUID_RE.test(id))) {
    res.status(400).json({ ok: false, error: 'invalid_image_id' }); return
  }

  // Public-viewer token check. Mirrors signed_url's pattern but here we
  // require the token (this endpoint is gated behind PVT — the only path).
  if (!pvt) {
    res.status(401).json({ ok: false, error: 'missing_pvt' }); return
  }
  const { data: pvtOk, error: pvtErr } = await supabase.rpc('verify_public_gallery_session', {
    p_token: pvt,
    p_gallery_id: galleryId,
  })
  if (pvtErr || pvtOk !== true) {
    res.status(401).json({ ok: false, error: 'invalid_pvt' }); return
  }

  // Verify all requested images belong to the gallery, fetch their paths.
  const { data: rows, error: rowsErr } = await supabase
    .from('images')
    .select('id, filename, original_path, original_uploaded, web_preview_path:storage_path, thumbnail_path')
    .eq('gallery_id', galleryId)
    .in('id', imageIds)
  if (rowsErr) {
    res.status(500).json({ ok: false, error: 'db_query_failed', detail: rowsErr.message.slice(0, 200) }); return
  }
  type Row = {
    id: string
    filename: string | null
    original_path: string | null
    original_uploaded: boolean | null
    web_preview_path: string
    thumbnail_path: string | null
  }
  const allRows = (rows ?? []) as unknown as Row[]
  if (allRows.length === 0) {
    res.status(404).json({ ok: false, error: 'no_matching_images' }); return
  }

  // Stream ZIP back to the browser.
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${filenameStem}.zip"`)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')

  const archive = archiver('zip', { zlib: { level: 5 } })
  archive.on('warning', err => { console.warn('[gallery-zip] archive warning', err) })
  archive.on('error', err => {
    console.error('[gallery-zip] archive error', err)
    try { res.end() } catch { /* ignore */ }
  })
  archive.pipe(res as unknown as NodeJS.WritableStream)

  // Pull bytes with bounded concurrency, push each into the archive as it
  // arrives. archiver is back-pressure-aware so memory stays low even on
  // large galleries.
  let cursor = 0
  let added = 0
  const seenNames = new Map<string, number>()
  const running = new Set<Promise<void>>()

  const dedupeName = (base: string): string => {
    const count = seenNames.get(base) ?? 0
    seenNames.set(base, count + 1)
    if (count === 0) return base
    const dot = base.lastIndexOf('.')
    if (dot < 0) return `${base}_${count + 1}`
    return `${base.slice(0, dot)}_${count + 1}${base.slice(dot)}`
  }

  const downloadOne = async (row: Row) => {
    const path = quality === 'original' && row.original_uploaded && row.original_path
      ? row.original_path
      : row.web_preview_path
    if (!path) return
    const { data, error } = await supabase!.storage.from(PRIVATE_BUCKET).download(path)
    if (error || !data) {
      console.warn('[gallery-zip] download failed', { id: row.id, error: error?.message })
      return
    }
    const buf = Buffer.from(await data.arrayBuffer())
    const safeBase = (row.filename ?? `photo_${row.id.slice(0, 8)}.jpg`).replace(/[^\w.\- ]/g, '_')
    const name = dedupeName(safeBase)
    archive.append(buf, { name })
    added += 1
  }

  while (cursor < allRows.length || running.size > 0) {
    while (cursor < allRows.length && running.size < FETCH_CONCURRENCY) {
      const p = downloadOne(allRows[cursor++]).then(() => { running.delete(p) })
      running.add(p)
    }
    if (running.size > 0) await Promise.race(running)
  }

  if (added === 0) {
    // Streaming already started; we can't switch to JSON. Just close out
    // an empty archive so the browser sees a proper (empty) ZIP rather
    // than a broken stream.
    console.warn('[gallery-zip] zero images successfully added')
  }

  await archive.finalize()
  // archive.pipe() already calls res.end via the readable stream lifecycle
}
