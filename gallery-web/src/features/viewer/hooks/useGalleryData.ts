import { useCallback, useEffect, useState } from 'react'
import { supabase, storageUrl } from '@/shared/lib/supabase'
import {
  getMeta as gcGetMeta,
  getImages as gcGetImages,
  getImagesResult as gcGetImagesResult,
  getStories as gcGetStories,
  bootstrapGallery as gcBootstrap,
  type GalleryMeta,
} from '@/shared/gallery/galleryClient'
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

/** Keep only stories whose file actually exists in storage. */
async function verifyStories(stories: Story[]): Promise<Story[]> {
  const verified: Story[] = []
  for (const story of stories) {
    const url = storageUrl('gallery-stories', story.storage_path)
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (res.ok) verified.push(story)
    } catch { /* skip */ }
  }
  return verified
}

/** Resolves the gallery from the URL and loads meta, images (paged), sections and stories. */
export function useGalleryData(route: GalleryRoute | null) {
  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [images, setImages] = useState<GalleryImage[]>([])
  const [sections, setSections] = useState<GallerySection[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [error, setError] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  async function loadGallery(id: string, prefetch?: Prefetch) {
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
    // for non-gated galleries. Section names are not sensitive: always usable.
    const canUsePrefetchImages = !!prefetch && !skipImages && !gateOn
    const [firstImgs, secsRes] = await Promise.all([
      canUsePrefetchImages
        ? Promise.resolve(prefetch!.images)
        : skipImages
          ? Promise.resolve([] as GalleryImage[])
          : gcGetImages<GalleryImage>(id, { offset: 0, limit: FIRST_PAGE }),
      prefetch
        ? Promise.resolve({ data: prefetch.sections })
        : supabase
            .from('gallery_sections')
            .select('id, name, slug, sort_order, description')
            .eq('gallery_id', id)
            .order('sort_order', { ascending: true }),
    ])

    const publishedRevisionId = (meta as { published_revision_id?: string | null }).published_revision_id ?? null
    const resolved = await applyPublishedSnapshot(id, publishedRevisionId, g, (secsRes.data || []) as GallerySection[])

    setImages(firstImgs)
    setSections(resolved.sections)
    setGallery(resolved.gallery)

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
        const { data: bizRows } = await supabase.rpc('get_business_by_slug', { p_slug: route.businessSlug })
        const biz = bizRows?.[0]
        if (!biz) { setError('Gallery not found'); return }
        // Draft is included so the owner can deep-link into an unpublished gallery.
        const { data: g } = await supabase.from('galleries').select('*')
          .eq('business_id', biz.id).eq('slug', route.gallerySlug)
          .in('status', ['live', 'draft']).single()
        if (g) { loadGallery(g.id); return }
        const { data: byName } = await supabase.from('galleries').select('*')
          .eq('business_id', biz.id).in('status', ['live', 'draft'])
          .ilike('name', route.gallerySlug.replace(/-/g, '%')).limit(1)
        if (byName?.[0]) { loadGallery(byName[0].id); return }
        setError('Gallery not found')
      } catch { setError('Gallery not found') }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  // After unlock, fetch the content loadGallery deferred. No-op once images exist.
  useEffect(() => {
    if (!gallery || !unlocked || images.length > 0) return
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
  }, [gallery?.id, unlocked])

  const handleUnlock = useCallback(() => setUnlocked(true), [])

  return { gallery, images, setImages, sections, stories, error, unlocked, handleUnlock }
}
