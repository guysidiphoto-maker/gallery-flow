// Server-rendered marketing pages: real crawlable head/body per registered route,
// then the same Vite bundle hydrates. vercel.json rewrites each path to
// /api/page?route=<key>; asset tags are discovered from the static /app.html.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  SITE_ORIGIN,
  OG_DEFAULT,
  getRouteByKey,
  getRouteByPath,
  type SeoRoute,
} from '../seo/registry.js'

const FONTS = `  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@300;400;500;600;700;800&family=Inter+Tight:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700&family=Heebo:wght@400;500;600;700&family=Noto+Serif:wght@400;500;700&family=Cormorant+Garamond:wght@400;500;600&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="preconnect" href="https://vlyiqfawkrjvqcmkpfvs.supabase.co" />`

const FAVICON = `  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
  <link rel="apple-touch-icon" href="/pixflow-icon-192.png" />`

// Re-emit the bundle's hashed asset tags from dist/app.html. The matcher only
// captures opening tags, so <script> is rebuilt with its closing tag — an
// unclosed one swallows the rest of the document and React never mounts.
async function discoverAssets(
  origin: string,
): Promise<{ head: string; body: string } | null> {
  try {
    const res = await fetch(`${origin}/app.html`, {
      headers: { 'user-agent': 'pixflow-ssr' },
    })
    if (!res.ok) return null
    const html = await res.text()
    const tags = html.match(/<(?:script|link)\b[^>]*\/assets\/[^>]*>/g) || []
    const head: string[] = []
    const body: string[] = []
    for (const tag of tags) {
      if (/^<script\b/i.test(tag)) {
        // The module entry script. Rebuild from its src so the tag is always
        // complete and closed (a src'd module script has no inner content).
        const src = tag.match(/\bsrc=["']([^"']+)["']/)?.[1]
        if (src) body.push(`<script type="module" crossorigin src="${src}"></script>`)
      } else if (/rel=["']?stylesheet/i.test(tag)) {
        head.push(tag) // <link rel="stylesheet" …> — void element, complete as-is
      } else {
        body.push(tag) // <link rel="modulepreload"/"preload" …> — void, complete as-is
      }
    }
    if (!body.length && !head.length) return null
    return { head: head.join('\n  '), body: body.join('\n  ') }
  } catch {
    return null
  }
}

function hreflangLinks(route: SeoRoute): string {
  const alts = route.alternates
  if (!alts) {
    return `  <link rel="alternate" hreflang="${route.lang}" href="${SITE_ORIGIN}${route.path}" />`
  }
  const lines: string[] = []
  for (const [lang, path] of Object.entries(alts)) {
    lines.push(`  <link rel="alternate" hreflang="${lang}" href="${SITE_ORIGIN}${path}" />`)
  }
  // x-default → Hebrew home if present, else the route itself.
  const xdefault = alts.he ?? route.path
  lines.push(`  <link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${xdefault}" />`)
  return lines.join('\n')
}

function attrEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderHead(route: SeoRoute, assetHead: string): string {
  const canonical = `${SITE_ORIGIN}${route.path}`
  const ogImage = route.ogImage || OG_DEFAULT
  const title = attrEscape(route.title)
  const desc = attrEscape(route.description)
  const jsonLd = route.jsonLd
    .map(
      obj =>
        `  <script type="application/ld+json">${JSON.stringify(obj).replace(
          /</g,
          '\\u003c',
        )}</script>`,
    )
    .join('\n')
  return `  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <meta name="robots" content="${route.indexable ? 'index, follow' : 'noindex, follow'}" />
  <link rel="canonical" href="${canonical}" />
${hreflangLinks(route)}
${FAVICON}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Pixflow" />
  <meta property="og:locale" content="${route.lang === 'he' ? 'he_IL' : 'en_US'}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${attrEscape(ogImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${attrEscape(ogImage)}" />
${FONTS}
${assetHead}
${jsonLd}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Resolve the route: prefer the ?route= key the rewrite injects; fall back to
  // parsing the path for direct hits.
  const q = req.query as Record<string, string | string[] | undefined>
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const routeKey = first(q.route)
  // ?p= carries the original path for dynamic rewrites (e.g. /blog/:slug),
  // since a Vercel rewrite to /api/page does not preserve it in req.url.
  const pathParam = first(q.p)
  const path = (req.url || '/').split('?')[0]

  const route =
    (routeKey && getRouteByKey(routeKey)) || getRouteByPath(pathParam || path)

  const host = (req.headers['x-forwarded-host'] || req.headers.host || '') as string
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const origin = host ? `${proto}://${host}` : SITE_ORIGIN

  // Unknown route → hand back the static SPA shell unchanged so client-side
  // routing/404 still works. (Should not happen: rewrites only send known keys.)
  if (!route) {
    try {
      const shell = await fetch(`${origin}/app.html`)
      const html = await shell.text()
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      return res.status(200).send(html)
    } catch {
      return res.status(404).send('Not found')
    }
  }

  const assets = await discoverAssets(origin)

  // Discovery failed: load the bundle from /app.html in the browser instead.
  const assetHead = assets?.head ? `  ${assets.head}` : ''
  const assetBody = assets?.body
    ? `  ${assets.body}`
    : `  <script>
    fetch('/app.html').then(r=>r.text()).then(h=>{
      const css=h.match(/href="(\\/assets\\/[^"]+\\.css)"/);
      if(css){const l=document.createElement('link');l.rel='stylesheet';l.href=css[1];document.head.appendChild(l)}
      for(const m of h.matchAll(/src="(\\/assets\\/[^"]+\\.js)"/g)){const s=document.createElement('script');s.type='module';s.src=m[1];document.body.appendChild(s)}
    });
  </script>`

  const html = `<!DOCTYPE html>
<html lang="${route.lang}" dir="${route.dir}">
<head>
${renderHead(route, assetHead)}
</head>
<body>
  <div id="root">${route.bodyHtml}
  </div>
${assetBody}
</body>
</html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Same content for every user-agent, so it's CDN-cacheable; keeps the asset
  // self-fetch off the hot path.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).send(html)
}
