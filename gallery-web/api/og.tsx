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
//   - Picks cover from delivery_settings.coverImageUrl, otherwise the first
//     image's web preview.
//   - Renders the card with system fonts. Hebrew falls back to OS default;
//     readable on every platform we care about.
//   - On ANY failure, returns a branded fallback image (never a 500). A
//     half-broken share preview is worse for the brand than a bare logo.
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

// Editorial palette — matches the dashboard sign-in + chapter style. No
// purple-gradient SaaS feel; the cover photo carries the visual weight and
// type is restrained.
const BG = '#0a0a0f'
const TEXT = '#f5f5f3'
const TEXT_MUTED = 'rgba(245,245,243,0.62)'
const HAIRLINE = 'rgba(245,245,243,0.18)'

interface GalleryLite {
  id: string
  name: string | null
  delivery_settings: Record<string, unknown> | null
  image_count: number | null
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

async function lookupGallery(params: URLSearchParams): Promise<GalleryLite | null> {
  const id = params.get('gallery') || params.get('id')
  if (id) {
    const rows = (await sbFetch(
      `galleries?select=id,name,delivery_settings,image_count&id=eq.${encodeURIComponent(id)}&status=in.(live,published)&limit=1`,
    )) as GalleryLite[] | null
    return rows?.[0] ?? null
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
      `galleries?select=id,name,delivery_settings,image_count&business_id=eq.${businessId}&slug=eq.${encodeURIComponent(gallerySlug)}&status=in.(live,published)&limit=1`,
    )) as GalleryLite[] | null
    return rows?.[0] ?? null
  }
  return null
}

async function pickCoverUrl(g: GalleryLite): Promise<string | null> {
  const settings = (g.delivery_settings ?? {}) as Record<string, unknown>
  // Prefer the canonical storage path (Phase 6 Step 2 column); resolve via
  // the transform URL so the OG card gets a 1200-wide version, not a 10MB
  // original. Fall back to the legacy fully-resolved URL for galleries
  // saved before the cover-as-path migration.
  const path = typeof settings.coverImagePath === 'string' ? settings.coverImagePath : null
  if (path) return buildRenderUrl(path)
  const declared = typeof settings.coverImageUrl === 'string' ? settings.coverImageUrl : null
  if (declared) return declared
  const imgs = (await sbFetch(
    `images?select=web_preview_path&gallery_id=eq.${g.id}&order=sort_order.asc&limit=1`,
  )) as Array<{ web_preview_path: string | null }> | null
  const firstPath = imgs?.[0]?.web_preview_path
  if (!firstPath) return null
  return buildRenderUrl(firstPath)
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
          background: BG,
          color: TEXT,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: '0.32em',
            color: TEXT_MUTED,
            textTransform: 'uppercase',
          }}
        >
          Pixflow
        </div>
        <div style={{ width: 36, height: 1, background: HAIRLINE, margin: '24px 0' }} />
        <div
          style={{
            fontSize: 28,
            fontWeight: 400,
            color: TEXT,
            letterSpacing: '-0.015em',
          }}
        >
          Smart event galleries
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const gallery = await lookupGallery(url.searchParams)
    if (!gallery) {
      const r = fallbackResponse()
      r.headers.set('Cache-Control', 'public, s-maxage=300')
      return r
    }

    const settings = (gallery.delivery_settings ?? {}) as Record<string, unknown>
    const title =
      (settings.galleryTitle as string | undefined) ||
      gallery.name ||
      'Gallery'
    const studio =
      (settings.studioName as string | undefined) ||
      (settings.businessName as string | undefined) ||
      ''
    const photoCount = Math.max(0, gallery.image_count ?? 0)
    const coverUrl = await pickCoverUrl(gallery)

    // Detect Hebrew so we can flip the text-flow direction without affecting
    // the layout. Satori supports `dir="rtl"` on individual blocks.
    const isHebrew = /[֐-׿]/.test(title) || /[֐-׿]/.test(studio)
    const dir: 'rtl' | 'ltr' = isHebrew ? 'rtl' : 'ltr'

    // Editorial card — cover as the headline, soft dark vignette so type
    // remains legible against any photo. No purple, no logo squircle. Studio
    // name leads (it's the photographer's brand the client recognises),
    // gallery name is the hero, photo count is a quiet eyebrow.
    const card = (
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          background: BG,
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
              opacity: 0.62,
            }}
          />
        )}
        {/* Vignette — bottom-heavy gradient so the title block stays readable
            against any cover, with a subtle top fade so the brand stripe also
            has contrast. Editorial palette only (no accent color). */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background:
              'linear-gradient(180deg, rgba(10,10,15,0.55) 0%, rgba(10,10,15,0.20) 28%, rgba(10,10,15,0.45) 60%, rgba(10,10,15,0.92) 100%)',
            display: 'flex',
          }}
        />

        {/* Top brand row — tracked wordmark + hairline + "shared gallery" eyebrow */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            padding: '40px 56px 0 56px',
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: '0.36em',
              textTransform: 'uppercase',
              color: TEXT,
            }}
          >
            Pixflow
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: TEXT_MUTED,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
            }}
          >
            Shared gallery
          </div>
        </div>

        {/* Title block — bottom-aligned, RTL-aware. Studio above, gallery
            title as the editorial hero, photo count as the eyebrow below. */}
        <div
          dir={dir}
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '0 56px 60px 56px',
          }}
        >
          {studio && (
            <div
              style={{
                fontSize: 18,
                fontWeight: 500,
                color: TEXT_MUTED,
                marginBottom: 18,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
              }}
            >
              {studio}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              fontSize: 76,
              fontWeight: 500,
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              maxWidth: '100%',
            }}
          >
            {title.length > 60 ? title.slice(0, 57) + '…' : title}
          </div>
          {/* Hairline divider */}
          <div style={{ width: 48, height: 1, background: HAIRLINE, margin: '22px 0' }} />
          {photoCount > 0 && (
            <div
              style={{
                display: 'flex',
                fontSize: 16,
                color: TEXT_MUTED,
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              {photoCount.toLocaleString()} {isHebrew ? 'תמונות' : 'Photos'}
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
