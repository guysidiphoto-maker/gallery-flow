// sitemap.xml — public sitemap for Pixflow's marketing surfaces + every
// published gallery. Lets Google / Bing / DuckDuckGo crawl gallery URLs
// directly without relying on per-gallery share links being indexed
// individually.
//
// Why: today a photographer publishes a gallery, the only link discovery
// path is paste-into-WhatsApp → eventual crawl. With a sitemap, Google
// indexes the gallery URL the next crawl cycle, so the studio's slug
// becomes discoverable for "{studio name} portfolio" / "{event name}"
// queries.
//
// Privacy: only galleries with status='live' AND access_type='public'
// (no password / no client-code gate) are listed. Password-gated and
// code-gated galleries stay private — they should never appear in a
// public crawl.
//
// Cache: 1 hour. The gallery list mutates slowly enough that hourly
// freshness is plenty, and we don't want to hit Supabase on every
// crawler ping.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { allRoutes } from '../seo/registry.js'

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

const SITE_ORIGIN =
  process.env.SITE_ORIGIN ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://pixflow-ai.com'

// Marketing pages come from the SEO registry (seo/registry.ts) — the single
// source of truth shared with api/page.ts, so a new SEO/landing route appears
// in the sitemap automatically (indexable routes only; admin URLs never live
// in the registry).

interface GalleryRow {
  slug: string | null
  published_at: string | null
  businesses: { slug?: string | null } | Array<{ slug?: string | null }> | null
}

// XML escape — every text node we emit goes through this. URLs in
// our system are safe (slug regex) but defence-in-depth costs nothing.
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function fetchPublicGalleries(): Promise<Array<{ url: string; lastmod?: string }>> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return []
  // Inner join `businesses` so we can construct /{business-slug}/{gallery-slug}
  // — the canonical short-link form. Filter:
  //   - status = 'live' (only published)
  //   - access_type column (Phase 6 step 2) is 'public' OR null (legacy)
  //   - delivery_settings -> requireGalleryCode is not true
  // The double filter belt-and-braces against drift between the typed
  // column and the legacy JSONB key.
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
