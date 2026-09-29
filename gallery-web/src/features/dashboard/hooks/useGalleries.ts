import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, storageUrl } from '@/shared/lib/supabase'
import { GALLERY_COLUMNS, type Gallery } from '../types'

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

  async function fetchGalleries() {
    setLoadingGalleries(true)
    let bId = businessId
    if (!bId) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle()
      bId = biz?.id ?? null
      if (bId) setBusinessId(bId)
    }
    if (!bId) {
      setGalleries([])
      setLoadingGalleries(false)
      return
    }
    const { data, error } = await supabase
      .from('galleries')
      .select(GALLERY_COLUMNS)
      .eq('business_id', bId)
      .order('created_at', { ascending: false })
    if (error) console.error('Fetch galleries error:', error)
    setGalleries(data ?? [])
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
      const { data, error } = await supabase.rpc('gallery_cover_thumbs', {
        p_gallery_ids: targets.map(g => g.id),
      })
      if (cancelled) return
      if (error) {
        console.warn('[cover-fallback] batch fetch failed', error)
        return
      }
      const rows = (data ?? []) as Array<{
        gallery_id: string
        thumbnail_path: string | null
        web_preview_path: string | null
      }>
      const next: Record<string, string> = {}
      for (const r of rows) {
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
