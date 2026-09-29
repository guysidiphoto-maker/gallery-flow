import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { loadPortfolioSettings, DEFAULT_SETTINGS, type PortfolioSettings } from '../portfolioSettings'
import { imgUrl, readStr, type GalleryRow, type ImageRow } from './lib'

/** Live galleries, first-image covers and top picks for one client's public portfolio. */
export function usePortfolioData(clientId: string) {
  const [loading, setLoading] = useState(true)
  const [clientName, setClientName] = useState('')
  const [studioName, setStudioName] = useState('')
  const [galleries, setGalleries] = useState<GalleryRow[]>([])
  const [topPicks, setTopPicks] = useState<ImageRow[]>([])
  const [covers, setCovers] = useState<Map<string, string>>(new Map())
  const [settings, setSettings] = useState<PortfolioSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    if (!clientId) { setLoading(false); return }
    ;(async () => {
      const { data } = await supabase.from('galleries')
        .select('id, name, client_name, image_count, published_at, delivery_settings')
        .eq('client_id', clientId).eq('status', 'live').order('published_at', { ascending: false })
      if (!data?.length) { setLoading(false); return }
      setGalleries(data)
      const s0 = (data[0].delivery_settings || {}) as Record<string, unknown>
      setClientName(data[0].client_name || readStr(s0, 'clientName') || '')
      setStudioName(readStr(s0, 'studioName'))
      const cm = new Map<string, string>()
      await Promise.all(data.map(async g => {
        const { data: img } = await supabase.from('images').select('thumbnail_path, storage_path:web_preview_path')
          .eq('gallery_id', g.id).order('sort_order', { ascending: true }).limit(1).maybeSingle()
        if (img) cm.set(g.id, imgUrl(img.thumbnail_path || img.storage_path))
      }))
      setCovers(cm)
      const { data: picks } = await supabase.from('images')
        .select('id, gallery_id, filename, storage_path:web_preview_path, thumbnail_path')
        .in('gallery_id', data.map(g => g.id)).eq('is_top_pick', true)
        .order('sort_order', { ascending: true }).limit(200)
      if (picks) setTopPicks(picks)
      setSettings(loadPortfolioSettings(clientId))
      setLoading(false)
    })()
  }, [clientId])

  return { loading, clientName, studioName, galleries, topPicks, covers, settings }
}
