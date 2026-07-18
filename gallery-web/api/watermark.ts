// watermark.ts — composites the studio's brand-kit watermark onto the
// full-resolution download. Browsing surfaces (thumbs, web previews) stay
// CLEAN; only the explicit download path routes through this engine. The
// photographer keeps the wow-factor in the gallery, the watermark protects
// the export. Failure mode is intentionally lenient: a missing watermark is
// better than a 500, so any sharp/render error returns the unmarked original.
//
// Auth model:
//   1. Origin allowlist (mirrors gallery-zip.ts).
//   2. Public-viewer token (`pvt`) — must be alive AND scoped to the gallery
//      we're serving. Resolves galleryId from the image's storage_path via
//      service-role lookup, then verifies the PVT against that gallery_id.
//      This keeps the URL shape simple (image + business) without trusting
//      an attacker-supplied gallery hint.
//
// Brand-kit resolution order (per-gallery override > studio default):
//   - delivery_settings.watermarkEnabled / watermarkText / watermarkPosition
//     on the gallery row (existing per-gallery toggles) WIN if present.
//   - businesses.brand_kit JSONB column (if present) supplies the studio's
//     default watermark config + logo URL/scale/opacity/contrast_aware.
//   - If neither is set, we fall back to returning the unmarked original.
//
// Runtime: nodejs (sharp is a native binding — Edge can't run it).

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../server/sentryServer.js'
import sharp from 'sharp'

export const config = { runtime: 'nodejs' }
export const maxDuration = 30

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRIVATE_BUCKET = 'gallery-images'
const DEMO_BUCKET = 'demo-uploads'
const MAX_SOURCE_BYTES = 50 * 1024 * 1024 // 50 MB cap, abort on bigger originals

type Position =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

interface WatermarkConfig {
  source: 'logo' | 'studio_name' | 'custom_text'
  text?: string
  logoUrl?: string
  position: Position
  scalePercent: number      // 1–50 (% of min(width,height))
  opacityPercent: number    // 1–100
  contrastAware: boolean
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  try {
    const u = new URL(origin)
    const host = u.hostname
    if (host === 'localhost' || host === '127.0.0.1') return true
    if (host.endsWith('.vercel.app')) return true
    if (host === 'pixflow.co.il' || host.endsWith('.pixflow.co.il')) return true
    if (host === 'pixflow-ai.com' || host.endsWith('.pixflow-ai.com')) return true
    if (host === 'eclipsemedia.co.il' || host.endsWith('.eclipsemedia.co.il')) return true
    return false
  } catch {
    return false
  }
}

function clampInt(n: unknown, lo: number, hi: number, dflt: number): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return dflt
  return Math.max(lo, Math.min(hi, Math.round(v)))
}

function normalizePosition(p: unknown): Position {
  const allowed: Position[] = [
    'top-left', 'top-center', 'top-right',
    'center-left', 'center', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ]
  return (allowed as string[]).includes(String(p)) ? (p as Position) : 'bottom-right'
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c],
  )
}

/** Translate a 3×3 grid position into (gravity, x-offset, y-offset) for sharp.composite. */
function placement(
  position: Position,
  baseW: number,
  baseH: number,
  overlayW: number,
  overlayH: number,
): { left: number; top: number } {
  // Margin: 4% of the smaller dimension, capped at 64px. Keeps the
  // watermark inset on both phone-shot 4032×3024 and 8000×5000 backs.
  const margin = Math.min(64, Math.round(Math.min(baseW, baseH) * 0.04))
  const [vert, horiz] = (() => {
    const parts = position.split('-')
    return parts.length === 2 ? [parts[0], parts[1]] : ['center', 'center']
  })()
  let left = margin
  let top = margin
  if (horiz === 'center') left = Math.round((baseW - overlayW) / 2)
  else if (horiz === 'right') left = baseW - overlayW - margin
  if (vert === 'center') top = Math.round((baseH - overlayH) / 2)
  else if (vert === 'bottom') top = baseH - overlayH - margin
  // Guardrails so we never composite off-canvas (sharp throws).
  left = Math.max(0, Math.min(left, baseW - overlayW))
  top = Math.max(0, Math.min(top, baseH - overlayH))
  return { left, top }
}

/** Sample a small region under the planned watermark and decide whether
 *  a light overlay (white) or dark overlay (black) will be more legible.
 *  Returns 'light' (use dark text) or 'dark' (use light text). */
async function sampleRegionLuminance(
  src: Buffer,
  left: number,
  top: number,
  width: number,
  height: number,
): Promise<'light' | 'dark'> {
  // Downsample the cropped region to 8×8 grey then average — way cheaper
  // than reading every pixel and gives the same flip decision.
  const stats = await sharp(src)
    .extract({ left, top, width, height })
    .resize(8, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer()
  let sum = 0
  for (let i = 0; i < stats.length; i++) sum += stats[i]
  const avg = sum / stats.length
  return avg > 140 ? 'light' : 'dark'
}

/** Render a text watermark as an SVG buffer sized to ~scalePercent of the
 *  smaller image dimension. Returns the PNG-rasterised overlay. */
async function renderTextOverlay(
  text: string,
  baseMinDim: number,
  scalePercent: number,
  opacityPercent: number,
  color: 'white' | 'black',
): Promise<{ buf: Buffer; w: number; h: number }> {
  // scalePercent applies to the TARGET HEIGHT of the text band, not the
  // glyph. ~5–8% reads well on a 4000px photo, big enough to be legible,
  // small enough not to overpower the photo.
  const targetH = Math.max(20, Math.round((baseMinDim * scalePercent) / 100))
  // Heuristic glyph width: ~0.55 em on typical sans, plus 8% padding.
  const fontSize = Math.round(targetH * 0.7)
  const padX = Math.round(targetH * 0.4)
  const padY = Math.round(targetH * 0.15)
  const textW = Math.max(40, Math.round(fontSize * 0.55 * text.length))
  const svgW = textW + padX * 2
  const svgH = targetH
  const fill = color === 'white' ? '#FFFFFF' : '#111111'
  const stroke = color === 'white' ? '#00000033' : '#FFFFFF33'
  const opacity = Math.max(1, Math.min(100, opacityPercent)) / 100
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <text x="${padX}" y="${svgH - padY}"
    font-family="system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
    font-size="${fontSize}" font-weight="600"
    fill="${fill}" stroke="${stroke}" stroke-width="1"
    opacity="${opacity}">${escapeXml(text)}</text>
</svg>`
  const buf = await sharp(Buffer.from(svg)).png().toBuffer()
  return { buf, w: svgW, h: svgH }
}

/** Fetch and resize the logo to scalePercent of the smaller dim. Applies
 *  global opacity. If contrast-aware mode flips us to "light" sample, we
 *  also negate the logo so a dark logo on a dark image becomes legible. */
async function renderLogoOverlay(
  logoUrl: string,
  baseMinDim: number,
  scalePercent: number,
  opacityPercent: number,
  flipColor: boolean,
): Promise<{ buf: Buffer; w: number; h: number }> {
  const targetH = Math.max(40, Math.round((baseMinDim * scalePercent) / 100))
  const res = await fetch(logoUrl, { redirect: 'follow' })
  if (!res.ok) throw new Error(`logo_fetch_${res.status}`)
  const raw = Buffer.from(await res.arrayBuffer())
  let pipe = sharp(raw).resize({ height: targetH, fit: 'inside', withoutEnlargement: false })
  if (flipColor) pipe = pipe.negate({ alpha: false })
  // Multiply alpha by opacity. sharp's `composite` doesn't expose a direct
  // opacity scalar, so we bake it into the overlay's alpha channel.
  const opacity = Math.max(1, Math.min(100, opacityPercent)) / 100
  const ensuredAlpha = pipe.ensureAlpha().png()
  const overlayBuf = await ensuredAlpha.toBuffer()
  const withOpacity = await sharp(overlayBuf)
    .composite([{
      input: Buffer.from([255, 255, 255, Math.round(255 * opacity)]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'dest-in',
    }])
    .png()
    .toBuffer()
  const finalMeta = await sharp(withOpacity).metadata()
  return {
    buf: withOpacity,
    w: finalMeta.width ?? targetH,
    h: finalMeta.height ?? targetH,
  }
}

/** Pull the brand-kit watermark config from the business row, with an
 *  optional per-gallery override applied on top. */
async function loadWatermarkConfig(
  businessId: string,
  galleryDeliverySettings: Record<string, unknown> | null,
): Promise<WatermarkConfig | null> {
  if (!supabase) return null
  // We don't know whether the schema has businesses.brand_kit yet. Try the
  // narrow select; if it errors (column missing), retry without it. Either
  // way we still pick up the per-gallery override.
  let brandKit: Record<string, unknown> | null = null
  let logoFromBusiness: string | null = null
  let studioName: string | null = null
  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('id, business_name, logo_url, brand_kit')
      .eq('id', businessId)
      .maybeSingle()
    if (!error && data) {
      brandKit = (data as { brand_kit?: Record<string, unknown> | null }).brand_kit ?? null
      logoFromBusiness = (data as { logo_url?: string | null }).logo_url ?? null
      studioName = (data as { business_name?: string | null }).business_name ?? null
    }
  } catch {
    // Column might not exist — fall through to logo_url only.
    try {
      const { data } = await supabase
        .from('businesses')
        .select('id, business_name, logo_url')
        .eq('id', businessId)
        .maybeSingle()
      if (data) {
        logoFromBusiness = (data as { logo_url?: string | null }).logo_url ?? null
        studioName = (data as { business_name?: string | null }).business_name ?? null
      }
    } catch { /* nothing more we can do */ }
  }

  const bkWatermark = (brandKit && typeof brandKit === 'object'
    ? (brandKit as { watermark?: Record<string, unknown> }).watermark
    : null) ?? null
  const override = galleryDeliverySettings ?? {}

  // Per-gallery override wins on each field. If the gallery row doesn't set
  // the field, fall back to brand kit, then to a sensible default.
  const overrideEnabled = override.watermarkEnabled
  const bkEnabled = bkWatermark ? (bkWatermark as { enabled?: boolean }).enabled : undefined
  const enabled = overrideEnabled !== undefined ? overrideEnabled === true : bkEnabled === true
  if (!enabled) return null

  const bkSource = bkWatermark ? (bkWatermark as { source?: string }).source : undefined
  const bkLogoUrl = bkWatermark ? (bkWatermark as { logo?: { url?: string; square_url?: string } }).logo : undefined
  const logoUrl = (bkLogoUrl?.url || bkLogoUrl?.square_url || logoFromBusiness || '').trim()

  // Override text wins; then brand-kit custom text; then studio name.
  const overrideText = typeof override.watermarkText === 'string' ? override.watermarkText.trim() : ''
  const bkText = bkWatermark ? String((bkWatermark as { text?: string }).text ?? '').trim() : ''
  const bkStudioFallback = (studioName || '').trim()

  // Source resolution: override.watermarkSource > brand kit > inferred.
  const overrideSource = typeof override.watermarkSource === 'string'
    ? (override.watermarkSource as string)
    : ''
  let source: 'logo' | 'studio_name' | 'custom_text'
  if (overrideSource === 'logo' || overrideSource === 'studio_name' || overrideSource === 'custom_text') {
    source = overrideSource
  } else if (bkSource === 'logo' || bkSource === 'studio_name' || bkSource === 'custom_text') {
    source = bkSource
  } else if (overrideText) {
    source = 'custom_text'
  } else if (logoUrl) {
    source = 'logo'
  } else {
    source = 'studio_name'
  }

  const text =
    source === 'custom_text' ? (overrideText || bkText || bkStudioFallback)
    : source === 'studio_name' ? bkStudioFallback
    : ''

  if (source === 'logo' && !logoUrl) return null
  if ((source === 'studio_name' || source === 'custom_text') && !text) return null

  const overridePosition = override.watermarkPosition
  const bkPosition = bkWatermark ? (bkWatermark as { position?: string }).position : undefined
  const position = normalizePosition(overridePosition ?? bkPosition)

  const overrideScale = (override as { watermarkScalePercent?: number }).watermarkScalePercent
  const bkScale = bkWatermark ? (bkWatermark as { scale_percent?: number }).scale_percent : undefined
  const scalePercent = clampInt(overrideScale ?? bkScale, 1, 50, source === 'logo' ? 12 : 6)

  const overrideOpacity = (override as { watermarkOpacityPercent?: number }).watermarkOpacityPercent
  const bkOpacity = bkWatermark ? (bkWatermark as { opacity_percent?: number }).opacity_percent : undefined
  const opacityPercent = clampInt(overrideOpacity ?? bkOpacity, 1, 100, 70)

  const overrideContrast = (override as { watermarkContrastAware?: boolean }).watermarkContrastAware
  const bkContrast = bkWatermark ? (bkWatermark as { contrast_aware?: boolean }).contrast_aware : undefined
  const contrastAware = overrideContrast !== undefined ? overrideContrast === true : bkContrast === true

  return {
    source,
    text,
    logoUrl: source === 'logo' ? logoUrl : undefined,
    position,
    scalePercent,
    opacityPercent,
    contrastAware,
  }
}

/** Resolve the gallery_id + bucket for a storage path by querying the
 *  images table on either `original_path` or `storage_path`. Service-role
 *  read; the PVT check still has to pass before we hand back bytes. */
async function resolveImageContext(imagePath: string): Promise<{
  galleryId: string
  bucket: string
  businessId: string
  hasOriginal: boolean
  filename: string | null
} | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('images')
    .select('id, gallery_id, filename, storage_path, original_path, original_uploaded, galleries!inner(business_id, demo_expires_at, delivery_settings)')
    .or(`original_path.eq.${imagePath},storage_path.eq.${imagePath}`)
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const g = (data as { galleries?: { business_id?: string; demo_expires_at?: string | null; delivery_settings?: Record<string, unknown> } }).galleries
  if (!g?.business_id) return null
  const isDemo = !!g.demo_expires_at
  return {
    galleryId: (data as { gallery_id?: string }).gallery_id ?? '',
    bucket: isDemo ? DEMO_BUCKET : PRIVATE_BUCKET,
    businessId: g.business_id,
    hasOriginal: !!(data as { original_uploaded?: boolean }).original_uploaded,
    filename: (data as { filename?: string | null }).filename ?? null,
  }
}

/** Returns the raw original bytes — used both as the input to compositing
 *  AND as the fallback when watermarking fails. */
async function downloadOriginal(bucket: string, path: string): Promise<Buffer | null> {
  if (!supabase) return null
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) return null
  const arr = await data.arrayBuffer()
  if (arr.byteLength > MAX_SOURCE_BYTES) return null
  return Buffer.from(arr)
}

function sendImage(res: VercelResponse, buf: Buffer, mime: 'image/jpeg' | 'image/png', filename: string) {
  // 1 day on Vercel's CDN, 1 year client-side (the URL embeds the storage
  // path which is content-addressable for a given upload, and the watermark
  // config changes are rare). Brand-kit changes invalidate via a manual
  // purge / new gallery slug rotation rather than a TTL race.
  res.setHeader('Content-Type', mime)
  res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=86400, stale-while-revalidate=86400, immutable')
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.\- ]/g, '_')}"`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.status(200).send(buf)
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' }); return
  }
  if (!isAllowedOrigin(req.headers.origin as string | undefined)) {
    res.status(403).json({ ok: false, error: 'origin_not_allowed' }); return
  }
  if (!supabase) {
    res.status(500).json({ ok: false, error: 'supabase_not_configured' }); return
  }

  const imagePath = String(req.query.image ?? '').trim()
  const businessId = String(req.query.business ?? '').trim()
  const pvt = String(req.query.pvt ?? req.query.token ?? '').trim()

  if (!imagePath || imagePath.length > 512) {
    res.status(400).json({ ok: false, error: 'invalid_image' }); return
  }
  if (!businessId || !UUID_RE.test(businessId)) {
    res.status(400).json({ ok: false, error: 'invalid_business' }); return
  }
  if (!pvt) {
    res.status(401).json({ ok: false, error: 'missing_pvt' }); return
  }

  // Resolve which gallery owns this image. We need this both for the PVT
  // scope check AND to pick up per-gallery overrides.
  const ctx = await resolveImageContext(imagePath)
  if (!ctx || ctx.businessId !== businessId) {
    res.status(404).json({ ok: false, error: 'image_not_found' }); return
  }
  const { data: pvtOk, error: pvtErr } = await supabase.rpc('verify_public_gallery_session', {
    p_token: pvt,
    p_gallery_id: ctx.galleryId,
  })
  if (pvtErr || pvtOk !== true) {
    res.status(401).json({ ok: false, error: 'invalid_pvt' }); return
  }

  // P2.2: password galleries additionally require a valid unlock token before
  // we composite + stream the original. gallery_token_is_valid is a no-op
  // (true) for non-password galleries and an enforced gate for password ones.
  const unlock = String(req.query.unlock ?? '').trim()
  const { data: authzOk, error: authzErr } = await supabase.rpc('gallery_token_is_valid', {
    p_gallery_id: ctx.galleryId,
    p_token: unlock || null,
  })
  if (authzErr || authzOk !== true) {
    res.status(401).json({ ok: false, error: 'unlock_required' }); return
  }

  const original = await downloadOriginal(ctx.bucket, imagePath)
  if (!original) {
    res.status(404).json({ ok: false, error: 'source_unavailable' }); return
  }
  const fallbackName = ctx.filename ?? 'photo.jpg'

  // Re-fetch the gallery row's delivery_settings (we have it via the join
  // already, but the join's column isn't typed and the override is
  // load-bearing). Cheap to re-read.
  const { data: galleryRow } = await supabase
    .from('galleries')
    .select('delivery_settings')
    .eq('id', ctx.galleryId)
    .maybeSingle()
  const galleryDeliverySettings =
    (galleryRow?.delivery_settings as Record<string, unknown> | null) ?? null

  const wmConfig = await loadWatermarkConfig(businessId, galleryDeliverySettings)
  if (!wmConfig) {
    // Watermarking not configured — serve the original unmarked. The caller
    // shouldn't have routed through here, but we don't punish them with a
    // 500. Same fall-through as a composition error below.
    sendImage(res, original, 'image/jpeg', fallbackName)
    return
  }

  // Compose. Any sharp/render failure → log + return original. A failed
  // watermark is worse for UX than no watermark.
  try {
    const meta = await sharp(original).metadata()
    const baseW = meta.width ?? 0
    const baseH = meta.height ?? 0
    if (!baseW || !baseH) throw new Error('no_metadata')
    const baseMin = Math.min(baseW, baseH)

    // Decide overlay color when contrast-aware. We need the planned
    // placement first so we can sample the right region.
    let overlayPNG: { buf: Buffer; w: number; h: number }

    if (wmConfig.source === 'logo' && wmConfig.logoUrl) {
      overlayPNG = await renderLogoOverlay(
        wmConfig.logoUrl, baseMin, wmConfig.scalePercent, wmConfig.opacityPercent, /*flip*/ false,
      )
      if (wmConfig.contrastAware) {
        const pos = placement(wmConfig.position, baseW, baseH, overlayPNG.w, overlayPNG.h)
        const tone = await sampleRegionLuminance(original, pos.left, pos.top, overlayPNG.w, overlayPNG.h)
        if (tone === 'light') {
          // Re-render the logo negated so it reads on a light background.
          overlayPNG = await renderLogoOverlay(
            wmConfig.logoUrl, baseMin, wmConfig.scalePercent, wmConfig.opacityPercent, /*flip*/ true,
          )
        }
      }
    } else {
      const text = wmConfig.text ?? ''
      // Provisional white render — then sample, then maybe re-render black.
      overlayPNG = await renderTextOverlay(text, baseMin, wmConfig.scalePercent, wmConfig.opacityPercent, 'white')
      if (wmConfig.contrastAware) {
        const pos = placement(wmConfig.position, baseW, baseH, overlayPNG.w, overlayPNG.h)
        const tone = await sampleRegionLuminance(original, pos.left, pos.top, overlayPNG.w, overlayPNG.h)
        if (tone === 'light') {
          overlayPNG = await renderTextOverlay(text, baseMin, wmConfig.scalePercent, wmConfig.opacityPercent, 'black')
        }
      }
    }

    const finalPos = placement(wmConfig.position, baseW, baseH, overlayPNG.w, overlayPNG.h)
    const sourceIsPng = (meta.format ?? '').toLowerCase() === 'png'
    const composed = sharp(original)
      .composite([{ input: overlayPNG.buf, left: finalPos.left, top: finalPos.top }])
    const outBuf = sourceIsPng
      ? await composed.png().toBuffer()
      : await composed.jpeg({ quality: 92, mozjpeg: true }).toBuffer()
    const mime: 'image/jpeg' | 'image/png' = sourceIsPng ? 'image/png' : 'image/jpeg'
    sendImage(res, outBuf, mime, fallbackName)
  } catch (err) {
    console.warn('[watermark] compose failed, serving original', {
      err: err instanceof Error ? err.message : String(err),
      image: imagePath,
      business: businessId,
    })
    sendImage(res, original, 'image/jpeg', fallbackName)
  }
}

export default withSentry('watermark', handler)
