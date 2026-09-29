import { useCallback, useEffect, useState } from 'react'
import { storageUrl } from '@/shared/lib/supabase'
import {
  getMeta as gcGetMeta,
  getImages as gcGetImages,
  getImagesResult as gcGetImagesResult,
  getStories as gcGetStories,
  bootstrapGallery as gcBootstrap,
  type GalleryMeta,
} from '@/shared/data/publicGallery'
import { getBusinessBySlug } from '@/shared/data/businesses'
import { findGalleryByNameSlug, getGalleryBySlug } from '@/shared/data/galleries'
import { listGallerySections } from '@/shared/data/sections'
import type { Gallery, GalleryImage, GallerySection, Story } from '@/shared/types'
import { isGalleryUnlocked } from '../components/PasswordGate'
import { applyPublishedSnapshot } from '../lib/publishedSnapshot'
import type { GalleryRoute } from '../lib/galleryRoute'

// First page MUST match the bootstrap limit: covers the welcome mosaic + first
// grid screens while keeping the single-call payload light; the rest streams.
const FIRST_PAGE = 100
const REST_PAGE = 1000

type Prefetch = { meta: GalleryMeta; images: GalleryImage[]; sections: GallerySection[] }

const isPrivateFace = (g: Gallery | GalleryMeta) =>
  ((g as Gallery).delivery_settings as { facePrivacyMode?: string } | null)?.facePrivacyMode === 'private'

/** Keep only stories whose file actually exists in storage (checked in parallel). */
async function verifyStories(stories: Story[]): Promise<Story[]> {
  const checks = await Promise.all(stories.map(async story => {
    try {
      const res = await fetch(storageUrl('gallery-stories', story.storage_path), { method: 'HEAD' })
      return res.ok
    } catch { return false }
  }))
  return stories.filter((_, i) => checks[i])
}

/** Resolves the gallery from the URL and loads meta, images (paged), sections and stories. */
export function useGalleryData(route: GalleryRoute | null) {
  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [images, setImages] = useState<GalleryImage[]>([])
  const [sections, setSections] = useState<GallerySection[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [imagesPending, setImagesPending] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  async function loadGallery(id: string, prefetch?: Prefetch) {
    // Section names are not sensitive and don't depend on meta, so fetch them alongside it.
    const sectionsReq = prefetch
      ? Promise.resolve({ data: prefetch.sections })
      : listGallerySections(id)
    const meta = prefetch?.meta ?? await gcGetMeta(id)
    if (!meta) {
      setError('Gallery not found')
      return
    }
    const g = meta as unknown as Gallery
    const gateOn = (meta as { signed_gate_enabled?: boolean }).signed_gate_enabled === true
    const hasPw = (meta as { has_password?: boolean }).has_password === true

    if (isGalleryUnlocked(id)) setUnlocked(true)

    // Private face mode gets its rows from the face-search function instead;
    // gated galleries need the unlock token before any image/story RPC.
    const mustWaitForUnlock = gateOn && hasPw && !isGalleryUnlocked(id)
    const skipImages = isPrivateFace(g) || mustWaitForUnlock

    // The bootstrap ran without an unlock token, so its images are only valid
    // for non-gated galleries.
    const canUsePrefetchImages = !!prefetch && !skipImages && !gateOn
    const imagesReq = canUsePrefetchImages
      ? Promise.resolve(prefetch!.images)
      : skipImages
        ? Promise.resolve([] as GalleryImage[])
        : gcGetImages<GalleryImage>(id, { offset: 0, limit: FIRST_PAGE })

    // The snapshot overlay runs while the first image page loads; the shell
    // (gate / welcome screen) renders as soon as settings are final.
    const secsRes = await sectionsReq
    const publishedRevisionId = (meta as { published_revision_id?: string | null }).published_revision_id ?? null
    const resolved = await applyPublishedSnapshot(id, publishedRevisionId, g, (secsRes.data || []) as GallerySection[])
    setSections(resolved.sections)
    setGallery(resolved.gallery)

    const firstImgs = await imagesReq
    setImages(firstImgs)
    setImagesPending(false)

    // Stream the remaining pages while the guest is still on the cover screen.
    if (!skipImages && firstImgs.length === FIRST_PAGE) {
      void (async () => {
        for (let offset = FIRST_PAGE; ; offset += REST_PAGE) {
          // ok=false only on a real failure (transient ones retry inside), so a
          // blip never silently truncates the gallery.
          const res = await gcGetImagesResult<GalleryImage>(id, { offset, limit: REST_PAGE })
          if (!res.ok) break
          if (res.data.length > 0) setImages(prev => [...prev, ...res.data])
          if (res.data.length < REST_PAGE) break
        }
      })()
    }

    if (mustWaitForUnlock) return

    const found = await gcGetStories<Story>(id)
    if (found.length > 0) setStories(await verifyStories(found))
  }

  useEffect(() => {
    if (!route) { setError('No gallery ID in URL'); return }
    if (route.type === 'id') {
      loadGallery(route.value)
      return
    }
    (async () => {
      try {
        // One RPC resolves both slugs and returns meta + first page + sections;
        // 'unavailable' falls through to the legacy multi-call resolve.
        const boot = await gcBootstrap<GalleryMeta, GalleryImage, GallerySection>(
          route.businessSlug, route.gallerySlug, FIRST_PAGE,
        )
        if (boot.status === 'ok' && boot.galleryId) {
          loadGallery(boot.galleryId, {
            meta: boot.meta as unknown as GalleryMeta,
            images: boot.images ?? [],
            sections: boot.sections ?? [],
          })
          return
        }
        if (boot.status === 'not_found') { setError('Gallery not found'); return }
        const { data: bizRows } = await getBusinessBySlug(route.businessSlug)
        const biz = bizRows?.[0]
        if (!biz) { setError('Gallery not found'); return }
        // Draft is included so the owner can deep-link into an unpublished gallery.
        const { data: g } = await getGalleryBySlug(biz.id, route.gallerySlug)
        if (g) { loadGallery(g.id); return }
        const { data: byName } = await findGalleryByNameSlug(biz.id, route.gallerySlug)
        if (byName?.[0]) { loadGallery(byName[0].id); return }
        setError('Gallery not found')
      } catch { setError('Gallery not found') }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  // After unlock, fetch the content loadGallery deferred. No-op once images exist.
  useEffect(() => {
    if (!gallery || !unlocked || imagesPending || images.length > 0) return
    if (isPrivateFace(gallery)) return
    ;(async () => {
      const out: GalleryImage[] = []
      for (let offset = 0; ; offset += REST_PAGE) {
        const rows = await gcGetImages<GalleryImage>(gallery.id, { offset, limit: REST_PAGE })
        out.push(...rows)
        if (rows.length < REST_PAGE) break
      }
      setImages(out)
      const found = await gcGetStories<Story>(gallery.id)
      if (found.length > 0) setStories(await verifyStories(found))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallery?.id, unlocked, imagesPending])

  const handleUnlock = useCallback(() => setUnlocked(true), [])

  return { gallery, images, setImages, imagesPending, sections, stories, error, unlocked, handleUnlock }
}
