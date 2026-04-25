import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const SUPABASE_URL = 'https://vlyiqfawkrjvqcmkpfvs.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZseWlxZmF3a3JqdnFjbWtwZnZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg3NzksImV4cCI6MjA5MDU2NDc3OX0.ionfOl71NrBO-0iBVBAu6oiTUzkJuIu-drEkY1cmsFY'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id, slug, business } = req.query

  let gallery: Record<string, unknown> | null = null
  let coverUrl = ''

  // Load gallery by ID or by slug
  if (id) {
    const { data } = await supabase
      .from('galleries').select('*').eq('id', id as string)
      .in('status', ['live', 'published']).single()
    gallery = data
  } else if (slug && business) {
    const { data: bizRows } = await supabase
      .rpc('get_business_by_slug', { p_slug: business as string })
    const biz = bizRows?.[0]
    if (biz) {
      const { data } = await supabase
        .from('galleries').select('*').eq('business_id', biz.id)
        .eq('slug', slug as string).in('status', ['live', 'published']).single()
      gallery = data
    }
  }

  if (!gallery) {
    return res.status(404).send('Not found')
  }

  const settings = (gallery.delivery_settings || {}) as Record<string, unknown>
  const title = (settings.galleryTitle as string) || (gallery.name as string) || 'Gallery'
  const studioName = (settings.studioName as string) || ''
  const imageCount = gallery.image_count as number || 0
  const description = studioName
    ? `${title} by ${studioName} — ${imageCount} photos`
    : `${title} — ${imageCount} photos`

  // Get cover image
  const coverImageUrl = settings.coverImageUrl as string | null
  if (coverImageUrl) {
    coverUrl = coverImageUrl
  } else {
    // Fallback: first image thumbnail
    const gid = gallery.id as string
    const { data: imgs } = await supabase
      .from('images').select('storage_path:web_preview_path')
      .eq('gallery_id', gid).order('sort_order').limit(1)
    if (imgs && imgs[0]) {
      coverUrl = `${SUPABASE_URL}/storage/v1/object/public/gallery-images/${imgs[0].storage_path}`
    }
  }

  // Determine the canonical URL
  const originalUrl = (req.headers['x-original-url'] as string) || req.url || '/'

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}${studioName ? ` — ${studioName}` : ''}</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="website" />
  ${coverUrl ? `<meta property="og:image" content="${coverUrl}" />` : ''}
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  ${coverUrl ? `<meta name="twitter:image" content="${coverUrl}" />` : ''}
  <meta http-equiv="refresh" content="0;url=${originalUrl}" />
</head>
<body>
  <p>Redirecting to gallery...</p>
</body>
</html>`

  res.setHeader('Content-Type', 'text/html')
  res.setHeader('Cache-Control', 'public, s-maxage=3600')
  return res.status(200).send(html)
}
