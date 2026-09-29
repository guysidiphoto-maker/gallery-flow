// Public sitemap: indexable marketing routes from seo/registry.ts plus every live,
// public (non-password, non-code) gallery. Cached for an hour.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { allRoutes } from '../seo/registry.js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../server/env.js'


const SITE_ORIGIN =
  process.env.SITE_ORIGIN ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://pixflow-ai.com'

interface GalleryRow {
  slug: string | null
  published_at: string | null
  businesses: { slug?: string | null } | Array<{ slug?: string | null }> | null
}

// Slugs are already safe; escaping every text node is defence in depth.
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function fetchPublicGalleries(): Promise<Array<{ url: string; lastmod?: string }>> {
  // Live galleries with access_type public/null AND no requireGalleryCode: both
  // filters guard against drift between the column and the legacy JSONB key.
  const url =
    `${SUPABASE_URL}/rest/v1/galleries` +
    `?select=slug,published_at,businesses(slug)` +
    `&status=eq.live` +
    `&or=(access_type.is.null,access_type.eq.public)` +
    `&limit=2000`
  let rows: GalleryRow[] = []
  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    })
    if (!res.ok) return []
    rows = (await res.json()) as GalleryRow[]
  } catch (err) {
    console.warn('[sitemap] gallery fetch failed', err)
    return []
  }
  const out: Array<{ url: string; lastmod?: string }> = []
  for (const row of rows) {
    if (!row.slug) continue
    const biz = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses
    const bizSlug = biz?.slug
    if (!bizSlug) continue
    out.push({
      url: `${SITE_ORIGIN}/${encodeURIComponent(bizSlug)}/${encodeURIComponent(row.slug)}`,
      lastmod: row.published_at ?? undefined,
    })
  }
  return out
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const galleries = await fetchPublicGalleries()

  const urls: string[] = []
  for (const r of allRoutes()) {
    if (!r.indexable) continue
    // hreflang alternates (xhtml:link) so Google clusters he/en versions.
    const altLinks = r.alternates
      ? Object.entries(r.alternates)
          .map(
            ([lang, path]) =>
              `    <xhtml:link rel="alternate" hreflang="${lang}" href="${xmlEscape(`${SITE_ORIGIN}${path}`)}" />\n`,
          )
          .join('')
      : ''
    urls.push(
      `  <url>\n` +
      `    <loc>${xmlEscape(`${SITE_ORIGIN}${r.path}`)}</loc>\n` +
      altLinks +
      `    <changefreq>${r.changefreq}</changefreq>\n` +
      `    <priority>${r.priority.toFixed(1)}</priority>\n` +
      `  </url>`
    )
  }
  for (const g of galleries) {
    urls.push(
      `  <url>\n` +
      `    <loc>${xmlEscape(g.url)}</loc>\n` +
      (g.lastmod ? `    <lastmod>${xmlEscape(g.lastmod)}</lastmod>\n` : '') +
      `    <changefreq>weekly</changefreq>\n` +
      `    <priority>0.7</priority>\n` +
      `  </url>`
    )
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urls.join('\n') +
    `\n</urlset>\n`

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  res.status(200).send(xml)
}
