import { useEffect, useState } from 'react'
import { listLiveGalleriesForClient } from '@/shared/data/galleries'
import { getFirstImage, listTopPicks } from '@/shared/data/images'
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
      const { data } = await listLiveGalleriesForClient(clientId)
      if (!data?.length) { setLoading(false); return }
      setGalleries(data)
      const s0 = (data[0].delivery_settings || {}) as Record<string, unknown>
      setClientName(data[0].client_name || readStr(s0, 'clientName') || '')
      setStudioName(readStr(s0, 'studioName'))
      const cm = new Map<string, string>()
      await Promise.all(data.map(async g => {
        const { data: img } = await getFirstImage(g.id, 'thumbnail_path, storage_path:web_preview_path')
        if (img) cm.set(g.id, imgUrl(img.thumbnail_path || img.storage_path))
      }))
      setCovers(cm)
      const { data: picks } = await listTopPicks(data.map(g => g.id))
      if (picks) setTopPicks(picks)
      setSettings(loadPortfolioSettings(clientId))
      setLoading(false)
    })()
  }, [clientId])

  return { loading, clientName, studioName, galleries, topPicks, covers, settings }
}
