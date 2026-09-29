// Share route for bare /gallery/<uuid> links (gallery-page.ts handles the slug
// shapes): og-tagged HTML for social crawlers, a thin SPA bootstrap for browsers.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withSentry } from '../server/sentryServer.js'
import { anonClient } from '../server/supabase.js'


const BOT_UA =
  /WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|GoogleBot|iMessage|SkypeUriPreview|Pinterest|redditbot/i

const supabase = anonClient()

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function handler(req: VercelRequest, res: VercelResponse) {
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

  if (id) {
    const { data: gallery } = await supabase
      .from('galleries')
      .select('id, name, delivery_settings')
      .eq('id', id)
      .in('status', ['live'])
      .single()
    if (gallery) {
      // Allowlist: anything else in delivery_settings (notes, phone, clientCode)
      // would leak into link previews. Don't extend without a security review.
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
      // Prefer the photographer's own gallery description; fall back to the
      // face-search hook. The old "· {N} photos" segment relied on the cached,
      // often-stale gallery.image_count, which under-reported the real count.
      const custom = (safeSettings.galleryDescription || '').trim()
      description = custom
        ? custom
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
    // Load the Vite bundle from the static SPA shell (/app.html — renamed from
    // index.html so "/" can be SSR'd; fetching it directly keeps this bootstrap
    // decoupled from the homepage route).
    fetch('/app.html').then(r => r.text()).then(html => {
      const m = html.match(/src="(\\/assets\\/index-[^"]+\\.js)"/)
      const c = html.match(/href="(\\/assets\\/index-[^"]+\\.css)"/)
      if (c) { const l = document.createElement('link'); l.rel='stylesheet'; l.href=c[1]; document.head.appendChild(l) }
      if (m) { const s = document.createElement('script'); s.type='module'; s.src=m[1]; document.body.appendChild(s) }
    })
  </script>
</body>
</html>`
}

export default withSentry('share', handler)
