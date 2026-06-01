// Open Graph image generator for shared gallery links.
//
// When a guest pastes /gallery/:id in WhatsApp/iMessage/Telegram/Slack/etc, the
// crawler hits /api/share (which serves bot-flavoured HTML) and the og:image
// in that HTML points here. We compose a 1200x630 branded card with the
// gallery name + studio + a soft-blurred cover photo as backdrop. Pixshare
// can't do this because their app is hosted on raw S3 — this is the kind of
// detail that makes our shared links feel polished.
//
// Edge runtime for fast cold-starts; ImageResponse comes from @vercel/og.
//
// Inputs (any of):
//   ?gallery=<uuid>
//   ?id=<uuid>            (legacy alias from earlier og.ts)
//   ?business=<slug>&slug=<gallery-slug>
//
// Behavior:
//   - Fetches gallery row via Supabase REST (anon key) directly — avoids the
//     ~200kb @supabase-js bundle on edge.
//   - Now ALSO pulls the owning business's `brand_kit` JSONB in the same call
//     via PostgREST embedded select `businesses(name,brand_kit)`. One extra
//     join, zero extra round-trips.
//   - Picks cover from delivery_settings.coverImageUrl, otherwise the first
//     image's web preview.
//   - Renders the card with system fonts. Hebrew falls back to OS default;
//     readable on every platform we care about.
//   - On ANY failure, returns a branded fallback image (never a 500). A
//     half-broken share preview is worse for the brand than a bare logo.
//
// Brand Kit support (added in feat/web-og-image-brand-kit):
//   When the studio has a Brand Kit set up on their business row, the card
//   reads from it and re-skins the share preview to the studio (not Pixflow):
//     - brand_kit.logo.url | brand_kit.logo.square_url  → rendered top-left
//       at 28px tall. If missing OR fetch fails, falls back to studio name
//       rendered in uppercase tracked type (the previous wordmark slot).
//     - brand_kit.colors.ink     → dark base background (else editorial #0a0a0f)
//     - brand_kit.colors.primary → title accent + hairline divider tint
//                                  (else the editorial cream tone)
//     - brand_kit.voice.tagline  → rendered as a small italic line between
//                                  studio name and gallery title.
//   Logo fetch is bounded: @vercel/og fetches absolute <img src> URLs while
//   rendering. We pre-flight the logo with a 1s AbortController; on timeout
//   or non-2xx we drop the <img> entirely and use the text wordmark. A
//   broken logo URL must NEVER kill the OG response — the share preview
//   itself is more valuable than any one element of it.
//
//   When brand_kit is absent / `{}` / partially populated, the card degrades
//   to the prior editorial card exactly — zero regression for galleries
//   without a Brand Kit.
//
// Caching: 1 hour public CDN cache.

import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

// Read Supabase credentials from edge env vars (set in Vercel project
// settings as SUPABASE_URL + SUPABASE_ANON_KEY). Falls back to the
// Vite-style names a contributor might be tempted to set instead.
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ''
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''

// Centralized public-storage URL builder. Mirrors the SPA's storageUrl() in
// gallery-web/src/supabase.ts but reads SUPABASE_URL from env (edge runtime).
// Single line so a future signed-URL swap is a one-file change.
function buildPublicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/gallery-images/${path}`
}

// Server-side transform — the OG card is 1200×630, and in the originals-only
// model web_preview_path points at the multi-MB original. Pull a small
// resized copy so the edge function never fetches a 10MB file.
function buildRenderUrl(path: string, width = 1200, quality = 70): string {
  return `${SUPABASE_URL}/storage/v1/render/image/public/gallery-images/${path}?width=${width}&quality=${quality}&resize=contain`
}

// Editorial defaults — used when brand_kit is missing or partial. Keep these
// in sync with the previous editorial polish PR so unbranded galleries look
// identical to before.
const ACCENT = '#6366f1'
const ACCENT_LIGHT = '#818cf8'
const DEFAULT_INK = '#0a0a0f'
const DEFAULT_PRIMARY = '#e8e4d8' // cream accent from the editorial polish PR
const TEXT = '#f1f1f4'
const TEXT_MUTED = 'rgba(241,241,244,0.6)'

// ──────────────────────────────────────────────────────────────────────────
// Brand Kit shape (matches what the studio's settings UI writes into
// businesses.brand_kit JSONB). Everything is optional — we treat the column
// as untrusted shape and read defensively.
// ──────────────────────────────────────────────────────────────────────────
interface BrandKit {
  logo?: {
    url?: string | null         // wide / horizontal variant (preferred)
    square_url?: string | null  // square variant (fallback for top slot)
  } | null
  colors?: {
    ink?: string | null         // dark base (background)
    primary?: string | null     // accent / hairline / title tint
    accent?: string | null      // unused for now, reserved
  } | null
  typography?: {
    weight?: number | null      // optional weight hint for the studio name
    tracking?: string | null    // letter-spacing hint, e.g. '0.12em'
  } | null
  voice?: {
    tagline?: string | null     // short line under the studio name
  } | null
}

interface GalleryLite {
  id: string
  name: string | null
  delivery_settings: Record<string, unknown> | null
  image_count: number | null
  businesses?: { name?: string | null; brand_kit?: BrandKit | null } | null
}

interface GalleryWithBrand {
  gallery: GalleryLite
  brand: BrandKit | null
  businessName: string | null
}

async function sbFetch(path: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  })
  if (!res.ok) return null
  return await res.json()
}

// Defensive normaliser — brand_kit is JSONB so the column can legitimately be
// null, `{}`, or partially populated. Anything that isn't a plain object
// collapses to null so the caller can use a single `brand ?? null` check.
function normaliseBrandKit(raw: unknown): BrandKit | null {
  if (!raw || typeof raw !== 'object') return null
  const k = raw as BrandKit
  // Treat `{}` as "no brand kit" so we don't waste time on the brand path.
  const hasAnything =
    k.logo?.url ||
    k.logo?.square_url ||
    k.colors?.ink ||
    k.colors?.primary ||
    k.voice?.tagline
  return hasAnything ? k : null
}

async function lookupGallery(params: URLSearchParams): Promise<GalleryWithBrand | null> {
  // PostgREST embedded select pulls the parent businesses row in the same
  // request — `businesses(name,brand_kit)` adds the join, no extra DB call.
  const SELECT = 'id,name,delivery_settings,image_count,businesses(name,brand_kit)'

  const id = params.get('gallery') || params.get('id')
  if (id) {
    const rows = (await sbFetch(
      `galleries?select=${SELECT}&id=eq.${encodeURIComponent(id)}&status=in.(live,published)&limit=1`,
    )) as GalleryLite[] | null
    const gallery = rows?.[0]
    if (!gallery) return null
    return {
      gallery,
      brand: normaliseBrandKit(gallery.businesses?.brand_kit),
      businessName: gallery.businesses?.name ?? null,
    }
  }
  const businessSlug = params.get('business')
  const gallerySlug = params.get('slug')
  if (businessSlug && gallerySlug) {
    const bizRows = (await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_business_by_slug`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_slug: businessSlug }),
    }).then((r) => (r.ok ? r.json() : null))) as Array<{ id: string }> | null
    const businessId = bizRows?.[0]?.id
    if (!businessId) return null
    const rows = (await sbFetch(
      `galleries?select=${SELECT}&business_id=eq.${businessId}&slug=eq.${encodeURIComponent(gallerySlug)}&status=in.(live,published)&limit=1`,
    )) as GalleryLite[] | null
    const gallery = rows?.[0]
    if (!gallery) return null
    return {
      gallery,
      brand: normaliseBrandKit(gallery.businesses?.brand_kit),
      businessName: gallery.businesses?.name ?? null,
    }
  }
  return null
}

async function pickCoverUrl(g: GalleryLite): Promise<string | null> {
  const settings = (g.delivery_settings ?? {}) as Record<string, unknown>
  const declared = typeof settings.coverImageUrl === 'string' ? settings.coverImageUrl : null
  if (declared) return declared
  const imgs = (await sbFetch(
    `images?select=web_preview_path&gallery_id=eq.${g.id}&order=sort_order.asc&limit=1`,
  )) as Array<{ web_preview_path: string | null }> | null
  const path = imgs?.[0]?.web_preview_path
  if (!path) return null
  return buildRenderUrl(path)
}

// Pre-flight the brand logo with a hard 1s timeout. We don't actually use the
// response body — we just need to know whether to include the <img> tag in
// the rendered JSX (because @vercel/og itself will fetch the URL again while
// rastering). A HEAD request + AbortController is enough to confirm the asset
// resolves quickly; if it doesn't, we degrade to the text wordmark.
//
// Critically: this MUST NEVER throw out of handler() — a flaky logo CDN
// shouldn't be able to take down the share preview for an entire gallery.
async function probeLogo(url: string): Promise<string | null> {
  // SSRF guard: brand_kit.logo_url is photographer-controlled JSONB. A
  // poisoned row with file://, internal IPs, or non-http schemes must not be
  // fetched from inside the function. Allow only http(s) on public hosts.
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.')
    ) return null
  } catch {
    return null
  }
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 1000)
    const res = await fetch(url, { method: 'HEAD', signal: ctl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return url
  } catch {
    return null
  }
}

// Choose the best logo variant for the top slot. Prefer the wide variant
// (looks correct next to text); fall back to square.
function pickLogoUrl(brand: BrandKit | null): string | null {
  if (!brand?.logo) return null
  const wide = typeof brand.logo.url === 'string' ? brand.logo.url.trim() : ''
  if (wide) return wide
  const square = typeof brand.logo.square_url === 'string' ? brand.logo.square_url.trim() : ''
  if (square) return square
  return null
}

function fallbackResponse(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${DEFAULT_INK} 0%, #0a0a14 100%)`,
          color: TEXT,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_LIGHT})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            P
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: '-0.04em',
            }}
          >
            pixflow
          </div>
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 22,
            color: TEXT_MUTED,
            letterSpacing: '0.02em',
          }}
        >
          Smart event galleries · find yourself in seconds
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const result = await lookupGallery(url.searchParams)
    if (!result) {
      const r = fallbackResponse()
      r.headers.set('Cache-Control', 'public, s-maxage=300')
      return r
    }
    const { gallery, brand, businessName } = result

    const settings = (gallery.delivery_settings ?? {}) as Record<string, unknown>
    const title =
      (settings.galleryTitle as string | undefined) ||
      gallery.name ||
      'Gallery'
    const studio =
      (settings.studioName as string | undefined) ||
      (settings.businessName as string | undefined) ||
      businessName ||
      ''
    const photoCount = Math.max(0, gallery.image_count ?? 0)
    const coverUrl = await pickCoverUrl(gallery)

    // Resolve brand-kit-driven values with editorial fallbacks. Every brand
    // path below is wrapped in `brand?.…` and falls back to the prior
    // editorial token — no regression for galleries without a Brand Kit.
    const ink = brand?.colors?.ink || DEFAULT_INK
    const primary = brand?.colors?.primary || DEFAULT_PRIMARY
    const tagline =
      typeof brand?.voice?.tagline === 'string' && brand.voice.tagline.trim()
        ? brand.voice.tagline.trim()
        : ''
    const studioWeight =
      typeof brand?.typography?.weight === 'number' ? brand.typography.weight : 600
    const studioTracking =
      typeof brand?.typography?.tracking === 'string' ? brand.typography.tracking : '0.12em'

    // Pre-flight the logo URL with a 1s timeout. If it doesn't resolve in
    // time (or 404s), we fall back to the text wordmark below.
    const logoCandidate = pickLogoUrl(brand)
    const logoUrl = logoCandidate ? await probeLogo(logoCandidate) : null

    // The cover sits behind everything as a soft-blurred backdrop. We don't
    // blur in CSS (Satori doesn't support filter:blur reliably) — instead we
    // overlay a heavy dark gradient so the imagery feels supportive, not loud.
    const card = (
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          background: ink,
          color: TEXT,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", "Heebo", sans-serif',
        }}
      >
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.45,
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: `linear-gradient(135deg, ${ink}d9 0%, ${ink}a6 50%, ${primary}40 100%)`,
            display: 'flex',
          }}
        />
        {/* Top brand row — logo if available, else tracked studio wordmark */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '46px 56px 0 56px',
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              style={{
                height: 28,
                width: 'auto',
                maxWidth: 240,
                objectFit: 'contain',
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: studioTracking,
                textTransform: 'uppercase',
                color: TEXT,
              }}
            >
              {studio || 'pixflow'}
            </div>
          )}
          <div
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'flex-end',
              fontSize: 16,
              color: TEXT_MUTED,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            shared gallery
          </div>
        </div>

        {/* Hairline divider — tinted with the brand primary at low opacity */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            margin: '22px 56px 0 56px',
            height: 1,
            background: `${primary}33`,
          }}
        />

        {/* Title block */}
        <div
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '0 56px 56px 56px',
          }}
        >
          {studio && (
            <div
              style={{
                fontSize: 20,
                fontWeight: studioWeight,
                color: TEXT_MUTED,
                marginBottom: tagline ? 8 : 14,
                letterSpacing: '0.02em',
              }}
            >
              {studio}
            </div>
          )}
          {tagline && (
            <div
              style={{
                fontSize: 18,
                fontStyle: 'italic',
                color: TEXT_MUTED,
                marginBottom: 14,
                letterSpacing: '0.01em',
              }}
            >
              {tagline.length > 90 ? tagline.slice(0, 87) + '…' : tagline}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              fontSize: 80,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
              maxWidth: '100%',
              color: TEXT,
            }}
          >
            {title.length > 60 ? title.slice(0, 57) + '…' : title}
          </div>
          {photoCount > 0 && (
            <div
              style={{
                marginTop: 22,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 22,
                color: TEXT_MUTED,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: primary,
                }}
              />
              <span>
                {photoCount.toLocaleString()} photos · find yours with a selfie
              </span>
            </div>
          )}
        </div>
      </div>
    )

    const response = new ImageResponse(card, { width: 1200, height: 630 })
    response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return response
  } catch (err) {
    console.error('[og] error', err)
    const r = fallbackResponse()
    r.headers.set('Cache-Control', 'public, s-maxage=60')
    return r
  }
}
