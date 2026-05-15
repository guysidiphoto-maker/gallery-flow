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

  // Bots: serve OG tags
  const path = (req.url || '').split('?')[0].replace(/\/+$/, '')
  let gallery: Record<string, unknown> | null = null

  // /{slug}/gallery/{uuid}
  const legacy = path.match(/\/([^/]+)\/gallery\/([^/]+)/)
  if (legacy) {
    const { data } = await supabase.from('galleries').select('*')
      .eq('id', legacy[2]).in('status', ['live', 'published']).single()
    gallery = data
  }

  // /{business-slug}/{gallery-slug}
  if (!gallery) {
    const clean = path.match(/\/([^/]+)\/([^/]+)$/)
    if (clean) {
      const { data: bizRows } = await supabase.rpc('get_business_by_slug', { p_slug: clean[1] })
      const biz = bizRows?.[0]
      if (biz) {
        const { data } = await supabase.from('galleries').select('*')
          .eq('business_id', biz.id).eq('slug', clean[2])
          .in('status', ['live', 'published']).single()
        gallery = data
      }
    }
  }

  if (!gallery) {
    return res.status(404).send('Gallery not found')
  }

  const s = (gallery.delivery_settings || {}) as Record<string, unknown>
  const title = (s.galleryTitle as string) || (gallery.name as string) || 'Gallery'
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

  res.setHeader('Content-Type', 'text/html')
  res.setHeader('Cache-Control', 'public, s-maxage=3600')
  return res.status(200).send(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>${title}${studioName ? ` — ${studioName}` : ''}</title>
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://pixflow-ai.com${path}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${ogImage}" />
</head><body></body></html>`)
}
