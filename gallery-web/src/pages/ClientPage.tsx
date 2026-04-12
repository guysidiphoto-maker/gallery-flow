import { useEffect, useState } from 'react'
import { supabase, storageUrl } from '../supabase'

interface GalleryRow {
  id: string
  name: string
  client_name: string | null
  image_count: number
  published_at: string | null
  delivery_settings: Record<string, unknown> | null
}

interface CoverLookup {
  galleryId: string
  thumbPath: string | null
  storagePath: string
}

function readString(obj: Record<string, unknown> | null, key: string): string {
  if (!obj) return ''
  const v = obj[key]
  return typeof v === 'string' ? v : ''
}

export function ClientPage() {
  const clientId = window.location.pathname.replace(/^\/client\//, '').replace(/\/$/, '')

  const [galleries, setGalleries] = useState<GalleryRow[]>([])
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientId) {
      setError('No client ID in URL')
      setLoading(false)
      return
    }
    load()
    async function load() {
      const { data, error: qErr } = await supabase
        .from('galleries')
        .select('id, name, client_name, image_count, published_at, delivery_settings')
        .eq('client_id', clientId)
        .eq('status', 'live')
        .order('published_at', { ascending: false })

      if (qErr) {
        setError('Could not load client page')
        setLoading(false)
        return
      }
      if (!data || data.length === 0) {
        setError('No galleries found for this client')
        setLoading(false)
        return
      }
      setGalleries(data)

      // Fetch one cover image per gallery (prefers the cover set in delivery_settings,
      // otherwise the first image by sort_order)
      const coverMap = new Map<string, string>()
      await Promise.all(data.map(async (g) => {
        const coverImageId = readString(g.delivery_settings as Record<string, unknown> | null, 'coverImageId')
        let row: CoverLookup | null = null
        if (coverImageId) {
          const { data: img } = await supabase
            .from('images')
            .select('id, thumbnail_path, storage_path')
            .eq('gallery_id', g.id)
            .eq('id', coverImageId)
            .maybeSingle()
          if (img) row = { galleryId: g.id, thumbPath: img.thumbnail_path, storagePath: img.storage_path }
        }
        if (!row) {
          const { data: img } = await supabase
            .from('images')
            .select('id, thumbnail_path, storage_path')
            .eq('gallery_id', g.id)
            .order('sort_order', { ascending: true })
            .limit(1)
            .maybeSingle()
          if (img) row = { galleryId: g.id, thumbPath: img.thumbnail_path, storagePath: img.storage_path }
        }
        if (row) {
          coverMap.set(g.id, storageUrl('gallery-images', row.thumbPath || row.storagePath))
        }
      }))
      setCovers(coverMap)
      setLoading(false)
    }
  }, [clientId])

  if (loading) {
    return (
      <div className="center-msg">
        <div className="loader" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="center-msg">
        <p>{error}</p>
      </div>
    )
  }

  const first = galleries[0]
  const settings = (first.delivery_settings || {}) as Record<string, unknown>
  const studioName = readString(settings, 'studioName')
  const studioWebsite = readString(settings, 'studioWebsite')
  const clientName = first.client_name || readString(settings, 'clientName') || 'Your Galleries'

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'inherit' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 24px 96px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          {studioName && (
            <div style={{
              fontSize: 12,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,.5)',
              marginBottom: 12,
            }}>
              {studioName}
            </div>
          )}
          <h1 style={{
            fontSize: 38,
            fontWeight: 300,
            letterSpacing: -0.5,
            margin: '0 0 8px',
          }}>
            {clientName}
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.45)', margin: 0 }}>
            {galleries.length} {galleries.length === 1 ? 'gallery' : 'galleries'}
          </p>
        </div>

        {/* Galleries grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 24,
        }}>
          {galleries.map(g => {
            const cover = covers.get(g.id)
            return (
              <a
                key={g.id}
                href={`/gallery/${g.id}`}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  background: '#111118',
                  border: '1px solid rgba(255,255,255,.06)',
                  borderRadius: 10,
                  overflow: 'hidden',
                  transition: 'transform .2s, border-color .2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.4)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.06)' }}
              >
                <div style={{
                  aspectRatio: '3 / 2',
                  background: 'rgba(255,255,255,.03)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {cover ? (
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  )}
                </div>
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{g.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)' }}>
                    {g.image_count} {g.image_count === 1 ? 'image' : 'images'}
                  </div>
                </div>
              </a>
            )
          })}
        </div>

        {/* Studio footer */}
        {studioName && (
          <div style={{
            textAlign: 'center',
            marginTop: 64,
            paddingTop: 32,
            borderTop: '1px solid rgba(255,255,255,.06)',
            fontSize: 12,
            color: 'rgba(255,255,255,.35)',
          }}>
            {studioWebsite ? (
              <a
                href={studioWebsite.startsWith('http') ? studioWebsite : `https://${studioWebsite}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {studioName}
              </a>
            ) : (
              <>{studioName}</>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
