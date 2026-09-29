import { useEffect, useState } from 'react'
import { supabase, storageUrl } from '@/shared/lib/supabase'

export interface PortalGalleryRow {
  id: string; name: string; client_name: string | null; image_count: number
  published_at: string | null; delivery_settings: Record<string, unknown> | null
}

/** Live galleries of the client, their first-image covers, and the legacy PIN (if any). */
export function usePortalGalleries(clientId: string, resolveErr: string | null) {
  const [galleries, setGalleries] = useState<PortalGalleryRow[]>([])
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
  const [clientCode, setClientCode] = useState('')
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
      const { data, error: e } = await supabase
        .from('galleries')
        .select('id, name, client_name, image_count, published_at, delivery_settings')
        .eq('client_id', clientId).eq('status', 'live')
        .order('published_at', { ascending: false })
      if (e || !data?.length) { setError(e ? 'Could not load' : 'No galleries found'); setLoading(false); return }
      setGalleries(data)
      // The legacy PIN lives in the first gallery's delivery settings.
      const s = (data[0].delivery_settings || {}) as Record<string, unknown>
      if (typeof s.clientCode === 'string' && s.clientCode) setClientCode(s.clientCode)
      const coverRes = await Promise.all(data.map(async g => {
        const { data: img } = await supabase.from('images').select('thumbnail_path, web_preview_path')
          .eq('gallery_id', g.id).order('sort_order', { ascending: true }).limit(1).maybeSingle()
        return { id: g.id, url: img ? storageUrl('gallery-images', img.thumbnail_path || img.web_preview_path) : null }
      }))
      const cm = new Map<string, string>()
      coverRes.forEach(c => { if (c.url) cm.set(c.id, c.url) })
      setCovers(cm)
      setLoading(false)
    }
  }, [clientId, resolveErr])

  return { galleries, covers, clientCode, error, loading }
}
