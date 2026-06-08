import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZseWlxZmF3a3JqdnFjbWtwZnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg3NzksImV4cCI6MjA5MDU2NDc3OX0.ionfOl71NrBO-0iBVBAu6oiTUzkJuIu-drEkY1cmsFY'

const BOT_UA = /WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|GoogleBot/i

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    // Dynamically load the latest Vite bundle
    fetch('/').then(r => r.text()).then(html => {
      const m = html.match(/src="(\\/assets\\/index-[^"]+\\.js)"/)
      const c = html.match(/href="(\\/assets\\/index-[^"]+\\.css)"/)
      if (c) { const l = document.createElement('link'); l.rel='stylesheet'; l.href=c[1]; document.head.appendChild(l) }
      if (m) { const s = document.createElement('script'); s.type='module'; s.src=m[1]; document.body.appendChild(s) }
    })
  </script>
</body>
</html>`)
  }

  // Bots: serve OG tags.
  //
  // Resolution prefers the query params the vercel.json rewrite injects
  // (?biz=&gallery=&section= / ?biz=&legacyId=) — a Vercel rewrite to
  // /api/gallery-page does NOT preserve the original path in req.url, so the
  // old path-parsing branch silently failed for every clean/legacy share link
  // (only /gallery/:id worked, because share.ts gets ?id= explicitly). We fall
  // back to parsing req.url so a direct hit still resolves.
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

  // Escape every photographer-controlled value before it lands in HTML
  // attributes — a gallery/studio/section name (or a crafted coverImageUrl)
  // containing `"` or `<` would otherwise break out of the attribute and
  // inject tags into the crawler-facing markup. (share.ts already does this.)
  const escapeHtml = (str: string): string =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const s = (gallery.delivery_settings || {}) as Record<string, unknown>
  const baseTitle = (s.galleryTitle as string) || (gallery.name as string) || 'Gallery'
  const title = sectionName ? `${baseTitle} — ${sectionName}` : baseTitle
  const studioName = (s.studioName as string) || ''
  const imageCount = gallery.image_count as number || 0
  const description = studioName
    ? `${title} by ${studioName} — ${imageCount} photos`
    : `${title} — ${imageCount} photos`

  // Hot-fix 2026-05-16: /api/og is failing in production (Satori/Edge issue).
  // Resolve og:image to a direct cover photo from storage so WhatsApp/Facebook
  // see a real preview. Order: settings.coverImageUrl (if HTTP) → first
  // image's web_preview_path → /api/og as last-resort fallback.
  let ogImage: string
  const declaredCover =
    typeof s.coverImageUrl === 'string' && s.coverImageUrl.startsWith('http')
      ? s.coverImageUrl
      : null
  if (declaredCover) {
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
      ? `${SUPABASE_URL}/storage/v1/object/public/gallery-images/${firstPath}`
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
