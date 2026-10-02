import { useEffect, useState } from 'react'
import { listGalleryNames } from '@/shared/data/galleries'
import { listImagesByIds } from '@/shared/data/images'
import { getVendorByCode, getVendorImages, listVendorImageTags } from '@/shared/data/vendors'

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
      const { data: vData } = await getVendorByCode(code)
      if (!vData || (Array.isArray(vData) && vData.length === 0)) {
        setError('Invalid vendor code')
        setLoading(false)
        return
      }
      const v = Array.isArray(vData) ? vData[0] : vData
      setVendor(v)

      // The code-checked RPC is the only path that still returns photos from
      // private-face-mode galleries; the legacy anon reads cover a DB without it.
      let tagged: TaggedImage[] | null = null
      const rpc = await getVendorImages(code)
      if (!rpc.error && Array.isArray(rpc.data)) {
        tagged = rpc.data as TaggedImage[]
      } else {
        const { data: tags } = await listVendorImageTags(v.id)
        if (tags && tags.length > 0) {
          const { data: rows } = await listImagesByIds(tags.map(t => t.image_id))
          tagged = rows ?? []
        }
      }

      if (!tagged || tagged.length === 0) {
        setError('No photos tagged for you yet')
        setLoading(false)
        return
      }

      setImages(tagged)
      setSelectedIds(new Set(tagged.map(i => i.id)))
      const galsRes = await listGalleryNames([...new Set(tagged.map(t => t.gallery_id))])

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
