import { useEffect, useState } from 'react'
import { storageUrl } from '@/shared/lib/supabase'
import { listLiveGalleriesForClient } from '@/shared/data/galleries'
import { getFirstImage } from '@/shared/data/images'
import { clientHasLegacyPin } from '@/shared/data/clientPortal'

export interface PortalGalleryRow {
  id: string; name: string; client_name: string | null; image_count: number
  published_at: string | null; delivery_settings: Record<string, unknown> | null
}

/** Live galleries of the client, their first-image covers, and whether a legacy PIN gates them. */
export function usePortalGalleries(clientId: string, resolveErr: string | null) {
  const [galleries, setGalleries] = useState<PortalGalleryRow[]>([])
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
  const [hasPin, setHasPin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientId) {
      // Slug URL still resolving (stay loading) or resolution failed.
      if (resolveErr) { setError(resolveErr); setLoading(false) }
      return
    }
    load()
    async function load() {
      const { data, error: e } = await listLiveGalleriesForClient(clientId)
      if (e || !data?.length) { setError(e ? 'Could not load' : 'No galleries found'); setLoading(false); return }
      setGalleries(data)
      setHasPin(await clientHasLegacyPin(clientId))
      const coverRes = await Promise.all(data.map(async g => {
        const { data: img } = await getFirstImage(g.id, 'thumbnail_path, web_preview_path')
        return { id: g.id, url: img ? storageUrl('gallery-images', img.thumbnail_path || img.web_preview_path) : null }
      }))
      const cm = new Map<string, string>()
      coverRes.forEach(c => { if (c.url) cm.set(c.id, c.url) })
      setCovers(cm)
      setLoading(false)
    }
  }, [clientId, resolveErr])

  return { galleries, covers, hasPin, error, loading }
}
