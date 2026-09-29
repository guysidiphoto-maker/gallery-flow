import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../server/sentryServer.js'
import { SUPABASE_URL } from '../server/env.js'
import { anonClient } from '../server/supabase.js'


const BOT_UA = /WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|GoogleBot/i

const supabase = anonClient()

async function handler(req: VercelRequest, res: VercelResponse) {
  const ua = req.headers['user-agent'] || ''
  res.setHeader('Vary', 'User-Agent')

  // Regular browsers: pass through to SPA (let Vercel serve index.html)
  if (!BOT_UA.test(ua)) {
    // Serve SPA by sending the index.html content inline
    // We include the Vite-built assets references
    res.setHeader('Content-Type', 'text/html')
    res.setHeader('Cache-Control', 'no-cache')
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pixflow — Smart Event Galleries</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet" />
  <link rel="preconnect" href="https://vlyiqfawkrjvqcmkpfvs.supabase.co" />
</head>
<body>
  <div id="root">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:20px;background:#0a0a0f">
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:18px;font-weight:600;letter-spacing:0.08em;color:rgba(255,255,255,.15)">pixflow</div>
      <div style="width:32px;height:32px;border:2px solid rgba(255,255,255,.06);border-top-color:rgba(99,102,241,.5);border-radius:50%;animation:spin .8s linear infinite"></div>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  </div>
  <script>
    // Dynamically load the latest Vite bundle from the static SPA shell.
    // (/app.html — renamed from index.html so "/" can be SSR'd. Fetching the
    // shell directly keeps this bootstrap decoupled from the homepage route.)
    fetch('/app.html').then(r => r.text()).then(html => {
      const m = html.match(/src="(\\/assets\\/index-[^"]+\\.js)"/)
      const c = html.match(/href="(\\/assets\\/index-[^"]+\\.css)"/)
      if (c) { const l = document.createElement('link'); l.rel='stylesheet'; l.href=c[1]; document.head.appendChild(l) }
      if (m) { const s = document.createElement('script'); s.type='module'; s.src=m[1]; document.body.appendChild(s) }
    })
  </script>
</body>
</html>`)
  }

  // Bots: OG tags. Prefer the query params the vercel.json rewrite injects (a
  // rewrite doesn't preserve the original path); parse req.url for direct hits.
  const q = req.query as Record<string, string | string[] | undefined>
  const qStr = (v: string | string[] | undefined): string | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  const path = (req.url || '').split('?')[0].replace(/\/+$/, '')

  let bizSlug = qStr(q.biz)
  let gallerySlug = qStr(q.gallery)
  let legacyId = qStr(q.legacyId)
  let sectionSlug = qStr(q.section)

  if (!bizSlug && !legacyId) {
    // Fallback: parse req.url (direct hit, not via rewrite).
    const legacy = path.match(/\/([^/]+)\/gallery\/([^/]+)/)
    if (legacy) { bizSlug = legacy[1]; legacyId = legacy[2] }
    else {
      const withSection = path.match(/^\/([^/]+)\/([^/]+)\/([^/]+)$/)
      const clean = withSection || path.match(/^\/([^/]+)\/([^/]+)$/)
      if (clean) {
        bizSlug = clean[1]; gallerySlug = clean[2]
        if (withSection) sectionSlug = decodeURIComponent(withSection[3])
      }
    }
  }

  let gallery: Record<string, unknown> | null = null

  if (legacyId) {
    const { data } = await supabase.from('galleries').select('*')
      .eq('id', legacyId).in('status', ['live']).single()
    gallery = data
  } else if (bizSlug && gallerySlug) {
    const { data: bizRows } = await supabase.rpc('get_business_by_slug', { p_slug: bizSlug })
    const biz = bizRows?.[0]
    if (biz) {
      const { data } = await supabase.from('galleries').select('*')
        .eq('business_id', biz.id).eq('slug', gallerySlug)
        .in('status', ['live']).single()
      gallery = data
    }
  }

  if (!gallery) {
    return res.status(404).send('Gallery not found')
  }
  // Don't trust req.url for the canonical og:url (it's /api/gallery-page under
  // the rewrite); rebuild it from the resolved slugs.
  const canonicalPath = legacyId
    ? `/${bizSlug}/gallery/${legacyId}`
    : `/${bizSlug}/${gallerySlug}${sectionSlug ? `/${sectionSlug}` : ''}`

  // Section page link → surface the section name in the card.
  let sectionName: string | null = null
  if (sectionSlug && sectionSlug !== 'more') {
    const base = supabase.from('gallery_sections').select('name')
      .eq('gallery_id', gallery.id as string)
    const byId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(sectionSlug)
    const { data: sec } = await (byId ? base.eq('id', sectionSlug) : base.eq('slug', sectionSlug))
      .limit(1).maybeSingle()
    sectionName = (sec?.name as string) ?? null
  }

  // Photographer-controlled values would otherwise break out of HTML attributes.
  const escapeHtml = (str: string): string =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const s = (gallery.delivery_settings || {}) as Record<string, unknown>
  const baseTitle = (s.galleryTitle as string) || (gallery.name as string) || 'Gallery'
  const title = sectionName ? `${baseTitle} — ${sectionName}` : baseTitle
  const studioName = (s.studioName as string) || ''
  // Prefer the photographer's own text; image_count is a stale cached counter.
  const welcomeText = (
    (s.welcomeMessage as string) || (s.galleryDescription as string) || ''
  ).trim()
  const description = welcomeText
    ? welcomeText
    : studioName
      ? `${title} by ${studioName}`
      : title

  // web_preview_path may be a multi-MB original and WhatsApp/Facebook reject
  // previews over ~300KB, so serve a 1200x630 transform (~130KB).
  const ogTransform = (path: string): string =>
    `${SUPABASE_URL}/storage/v1/render/image/public/gallery-images/${path}?width=1200&height=630&resize=cover&quality=70`

  // Resolve og:image to a direct cover photo from storage so WhatsApp/Facebook
  // see a real preview. Order: settings.coverImageUrl (if HTTP) → first
  // image's web_preview_path → /api/og as last-resort fallback.
  let ogImage: string
  // A declared cover that is a Supabase storage object URL is also bounded
  // through the transform; an arbitrary external http cover is left as-is.
  const declaredCover =
    typeof s.coverImageUrl === 'string' && s.coverImageUrl.startsWith('http')
      ? s.coverImageUrl
      : null
  const declaredCoverObjMatch = declaredCover?.match(/\/storage\/v1\/object\/public\/gallery-images\/(.+)$/)
  if (declaredCoverObjMatch) {
    ogImage = ogTransform(declaredCoverObjMatch[1])
  } else if (declaredCover) {
    ogImage = declaredCover
  } else {
    const { data: imgs } = await supabase
      .from('images')
      .select('web_preview_path')
      .eq('gallery_id', gallery.id)
      .order('sort_order', { ascending: true })
      .limit(1)
    const firstPath = imgs?.[0]?.web_preview_path as string | undefined
    ogImage = firstPath
      ? ogTransform(firstPath)
      : `https://pixflow-ai.com/api/og?gallery=${encodeURIComponent(gallery.id as string)}`
  }

  const eTitle = escapeHtml(title)
  const eStudio = escapeHtml(studioName)
  const eDesc = escapeHtml(description)
  const eImage = escapeHtml(ogImage)
  const ePath = escapeHtml(canonicalPath)

  res.setHeader('Content-Type', 'text/html')
  res.setHeader('Cache-Control', 'public, s-maxage=3600')
  return res.status(200).send(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>${eTitle}${studioName ? ` — ${eStudio}` : ''}</title>
<meta property="og:title" content="${eTitle}" />
<meta property="og:description" content="${eDesc}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://pixflow-ai.com${ePath}" />
<meta property="og:image" content="${eImage}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${eTitle}" />
<meta name="twitter:description" content="${eDesc}" />
<meta name="twitter:image" content="${eImage}" />
</head><body></body></html>`)
}

export default withSentry('gallery-page', handler)
