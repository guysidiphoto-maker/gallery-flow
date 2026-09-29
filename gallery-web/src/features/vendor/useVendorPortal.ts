import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'

export interface VendorInfo {
  id: string; name: string; category: string; logo_url: string | null
}

export interface TaggedImage {
  id: string; gallery_id: string; filename: string
  storage_path: string; thumbnail_path: string | null
}

export interface GalleryInfo {
  id: string; name: string; published_at: string | null
}

/** Access code from `/vendor/{code}`. */
function readVendorCode(): string {
  const path = window.location.pathname.replace(/\/$/, '')
  const m = path.match(/\/vendor\/([^/]+)$/)
  return m ? m[1] : ''
}

/** Loads the vendor behind the URL code, their tagged photos and those photos' galleries. */
export function useVendorPortal() {
  const code = readVendorCode()
  const [vendor, setVendor] = useState<VendorInfo | null>(null)
  const [images, setImages] = useState<TaggedImage[]>([])
  const [galleries, setGalleries] = useState<Map<string, GalleryInfo>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!code) { setError('No vendor code in URL'); setLoading(false); return }
    load()
    async function load() {
      const { data: vData } = await supabase.rpc('get_vendor_by_code', { p_code: code })
      if (!vData || (Array.isArray(vData) && vData.length === 0)) {
        setError('Invalid vendor code')
        setLoading(false)
        return
      }
      const v = Array.isArray(vData) ? vData[0] : vData
      setVendor(v)

      // Preferred: code-authenticated RPC (migration 115). It is the only path
      // that still returns tagged photos from private-face-mode galleries.
      // Fallback: the legacy anon table reads, for a DB without 115 applied.
      let tagged: TaggedImage[] | null = null
      const rpc = await supabase.rpc('get_vendor_images', { p_code: code })
      if (!rpc.error && Array.isArray(rpc.data)) {
        tagged = rpc.data as TaggedImage[]
      } else {
        const { data: tags } = await supabase
          .from('image_vendor_tags')
          .select('image_id, gallery_id')
          .eq('vendor_id', v.id)
        if (tags && tags.length > 0) {
          const { data: rows } = await supabase.from('images')
            .select('id, gallery_id, filename, storage_path:web_preview_path, thumbnail_path')
            .in('id', tags.map(t => t.image_id))
            .order('sort_order', { ascending: true })
          tagged = (rows ?? []) as TaggedImage[]
        }
      }

      if (!tagged || tagged.length === 0) {
        setError('No photos tagged for you yet')
        setLoading(false)
        return
      }

      const galleryIds = [...new Set(tagged.map(t => t.gallery_id))]
      const galsRes = await supabase.from('galleries')
        .select('id, name, published_at')
        .in('id', galleryIds)

      setImages(tagged)
      setSelectedIds(new Set(tagged.map(i => i.id)))

      if (galsRes.data) {
        const gm = new Map<string, GalleryInfo>()
        galsRes.data.forEach(g => gm.set(g.id, g))
        setGalleries(gm)
      }

      setLoading(false)
    }
  }, [code])

  return { vendor, images, galleries, error, loading, selectedIds, setSelectedIds }
}
