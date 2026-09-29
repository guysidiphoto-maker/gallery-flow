import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { storageUrl } from '@/shared/lib/supabase'
import { getOwnerBusiness } from '@/shared/data/businesses'
import { listBusinessGalleries } from '@/shared/data/galleries'
import { listGalleryCoverThumbs } from '@/shared/data/images'
import { GALLERY_COLUMNS, type Gallery } from '../types'

type CoverThumbRow = { gallery_id: string; thumbnail_path: string | null; web_preview_path: string | null }

// The owner's gallery list plus a cover fallback (first image per gallery) for
// galleries without an explicit coverImageUrl, e.g. desktop uploads.
export function useGalleries(
  user: User | null,
  businessId: string | null,
  setBusinessId: (id: string) => void,
) {
  const [galleries, setGalleries] = useState<Gallery[]>([])
  const [coverFallback, setCoverFallback] = useState<Record<string, string>>({})
  const [loadingGalleries, setLoadingGalleries] = useState(true)

  /** Pass the id when the caller just resolved it (state may not have re-rendered yet). */
  async function fetchGalleries(knownBusinessId?: string | null) {
    setLoadingGalleries(true)
    let bId = knownBusinessId ?? businessId
    if (!bId) {
      const { data: biz } = await getOwnerBusiness(user!.id, 'id')
      bId = (biz as { id: string } | null)?.id ?? null
      if (bId) setBusinessId(bId)
    }
    if (!bId) {
      setGalleries([])
      setLoadingGalleries(false)
      return
    }
    const { data, error } = await listBusinessGalleries(bId, GALLERY_COLUMNS)
    if (error) console.error('Fetch galleries error:', error)
    setGalleries((data ?? []) as Gallery[])
    setLoadingGalleries(false)
  }

  useEffect(() => {
    let cancelled = false
    const targets = galleries.filter(g =>
      !((g.delivery_settings as Record<string, unknown> | undefined)?.coverImageUrl)
      && (g.image_count ?? 0) > 0
      && !coverFallback[g.id]
    )
    if (targets.length === 0) return
    void (async () => {
      // One RPC for every missing cover; a per-gallery query saturated the
      // connection pool and was the dashboard's main load bottleneck.
      const { data, error } = await listGalleryCoverThumbs(targets.map(g => g.id))
      if (cancelled) return
      if (error) {
        console.warn('[cover-fallback] batch fetch failed', error)
        return
      }
      const next: Record<string, string> = {}
      for (const r of (data ?? []) as CoverThumbRow[]) {
        const path = r.thumbnail_path || r.web_preview_path
        if (path) next[r.gallery_id] = storageUrl('gallery-images', path)
      }
      if (Object.keys(next).length > 0) {
        setCoverFallback(prev => ({ ...prev, ...next }))
      }
    })()
    return () => { cancelled = true }
  }, [galleries])

  return { galleries, setGalleries, coverFallback, loadingGalleries, fetchGalleries }
}
