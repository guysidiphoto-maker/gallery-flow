// Crawler-detecting share route for /gallery/:id deep links.
//
// gallery-page.ts already handles the slug-shaped URLs (/:business/:gallery
// and /:slug/gallery/:id). This handler covers the remaining shape — the
// bare `/gallery/<uuid>` URLs that the dashboard "Copy link" button hands
// out — which used to fall through to /index.html and lose their preview.
//
// For social-card crawlers we render og-tagged HTML pointing at /api/og.
// For real browsers we mimic gallery-page.ts: emit a thin SPA bootstrap
// that fetches the latest /index.html, extracts the Vite asset URLs, and
// loads the React app.

import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Read Supabase credentials from server env vars (set in Vercel project
// settings as SUPABASE_URL + SUPABASE_ANON_KEY). Falls back to the
// VITE_-prefixed names so a single env can power both bundle + Functions.
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ''
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''

const BOT_UA =
  /WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|GoogleBot|iMessage|SkypeUriPreview|Pinterest|redditbot/i

// Skip creating the client if env is missing — the route still works in
// degraded mode (bare title/description for crawlers, browser SPA shell
// served as before). Better to lose a polished preview than 500 the route.
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Vary', 'User-Agent')
  const ua = req.headers['user-agent'] || ''
  const idParam = (req.query.gallery as string | undefined) || (req.query.id as string | undefined)
  const id = (idParam || '').trim()

  // Browsers: serve a tiny SPA shell that re-resolves the latest assets.
  if (!BOT_UA.test(ua)) {
    res.setHeader('Content-Type', 'text/html')
    res.setHeader('Cache-Control', 'no-cache')
    return res.status(200).send(spaShell())
  }

  // Crawlers: emit og-tagged HTML.
  let title = 'Pixflow Gallery'
  let description = 'Find your photos with a selfie.'
  let canonicalPath = `/gallery/${id || ''}`

  if (id && supabase) {
    const { data: gallery } = await supabase
      .from('galleries')
      .select('id, name, delivery_settings, image_count')
      .eq('id', id)
      .in('status', ['live'])
      .single()
    if (gallery) {
      // Whitelist: ONLY these fields may be read out of delivery_settings into
      // OG meta. Anything else (notes, internal phone, clientCode, …) would
      // leak into WhatsApp/Slack/Twitter previews. Do not add to this list
      // without a security review.
      const rawSettings = (gallery.delivery_settings || {}) as Record<string, unknown>
      const safeSettings: {
        studioName?: string
        galleryTitle?: string
        galleryDescription?: string
        studioWebsite?: string
        logoUrl?: string
      } = {
        studioName: typeof rawSettings.studioName === 'string' ? rawSettings.studioName : undefined,
        galleryTitle: typeof rawSettings.galleryTitle === 'string' ? rawSettings.galleryTitle : undefined,
        galleryDescription: typeof rawSettings.galleryDescription === 'string' ? rawSettings.galleryDescription : undefined,
        studioWebsite: typeof rawSettings.studioWebsite === 'string' ? rawSettings.studioWebsite : undefined,
        logoUrl: typeof rawSettings.logoUrl === 'string' ? rawSettings.logoUrl : undefined,
      }
      const studio = safeSettings.studioName || ''
      const t = safeSettings.galleryTitle || (gallery.name as string) || 'Gallery'
      title = studio ? `${t} — ${studio}` : t
      const count = Number(gallery.image_count ?? 0)
      description = count > 0
        ? `${t} · ${count} photos · find yours with a selfie`
        : `${t} · find your photos with a selfie`
    }
  }

  const ogImage = `https://pixflow-ai.com/api/og?gallery=${encodeURIComponent(id)}`
  res.setHeader('Content-Type', 'text/html')
  res.setHeader('Cache-Control', 'public, s-maxage=3600')
  return res.status(200).send(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://pixflow-ai.com${escapeHtml(canonicalPath)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(ogImage)}" />
</head><body></body></html>`)
}

// Same shell as gallery-page.ts: fetch the latest /index.html, splice in the
// hashed Vite asset URLs, and let the SPA mount. Keeps social URLs working
// across deploys without baking a specific bundle hash in here.
function spaShell(): string {
  return `<!DOCTYPE html>
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
    fetch('/').then(r => r.text()).then(html => {
      const m = html.match(/src="(\\/assets\\/index-[^"]+\\.js)"/)
      const c = html.match(/href="(\\/assets\\/index-[^"]+\\.css)"/)
      if (c) { const l = document.createElement('link'); l.rel='stylesheet'; l.href=c[1]; document.head.appendChild(l) }
      if (m) { const s = document.createElement('script'); s.type='module'; s.src=m[1]; document.body.appendChild(s) }
    })
  </script>
</body>
</html>`
}
