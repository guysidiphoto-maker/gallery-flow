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

const ACCENT = '#6366f1'
const ACCENT_LIGHT = '#818cf8'
const BG = '#07070d'
const TEXT = '#f1f1f4'
const TEXT_MUTED = 'rgba(241,241,244,0.6)'

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
  const declared = typeof settings.coverImageUrl === 'string' ? settings.coverImageUrl : null
  if (declared) return declared
  const imgs = (await sbFetch(
    `images?select=web_preview_path&gallery_id=eq.${g.id}&order=sort_order.asc&limit=1`,
  )) as Array<{ web_preview_path: string | null }> | null
  const path = imgs?.[0]?.web_preview_path
  if (!path) return null
  return buildPublicUrl(path)
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
          background: `linear-gradient(135deg, ${BG} 0%, #0a0a14 100%)`,
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
            background: `linear-gradient(135deg, rgba(7,7,13,0.85) 0%, rgba(7,7,13,0.65) 50%, rgba(99,102,241,0.35) 100%)`,
            display: 'flex',
          }}
        />
        {/* Top brand row */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '46px 56px 0 56px',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 11,
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_LIGHT})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 800,
              color: 'white',
            }}
          >
            P
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            pixflow
          </div>
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
                fontWeight: 600,
                color: TEXT_MUTED,
                marginBottom: 14,
                letterSpacing: '0.02em',
              }}
            >
              {studio}
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
                  background: ACCENT_LIGHT,
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
