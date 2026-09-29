import { useEffect, useMemo } from 'react'
import { preloadGalleryThumbs } from '@/shared/lib/warmCache'
import type { GalleryImage, GallerySection } from '@/shared/types'
import type { ViewerRole } from '../lib/viewerSettings'

/**
 * Guests see non-hidden photos (narrowed to face matches while that filter is
 * on); clients always see everything.
 */
export function useVisibleImages(opts: {
  images: GalleryImage[]
  sections: GallerySection[]
  hiddenImageIds: Set<string>
  viewerRole: ViewerRole
  faceMatchIds: Set<string> | null
  faceFilterActive: boolean
}) {
  const { images, sections, hiddenImageIds, viewerRole, faceMatchIds, faceFilterActive } = opts

  const visibleImages = useMemo(() => {
    if (viewerRole === 'client') return images
    const base = images.filter(img => !hiddenImageIds.has(img.id))
    if (!faceMatchIds || !faceFilterActive) return base
    return base.filter(img => faceMatchIds.has(img.id))
  }, [images, hiddenImageIds, viewerRole, faceMatchIds, faceFilterActive])

  // No section, or a deleted one: the "More Photos" page (paged) or the all-images block (stacked).
  const unsectionedImages = useMemo(() => {
    const sectionIdSet = new Set(sections.map(s => s.id))
    return visibleImages.filter(img => !img.section_id || !sectionIdSet.has(img.section_id))
  }, [visibleImages, sections])

  const anySectionHasContent = useMemo(
    () => sections.some(sec => visibleImages.some(img => img.section_id === sec.id)),
    [sections, visibleImages],
  )

  return { visibleImages, unsectionedImages, anySectionHasContent }
}

/**
 * While the cover screen shows, warm the first grid thumbnails so the grid appears instantly on enter.
 * Starts after a beat so the cover and mosaic, which are on screen, get the bandwidth first.
 */
export function usePreloadThumbs(showWelcome: boolean, images: GalleryImage[], bucket: string) {
  useEffect(() => {
    if (!showWelcome || images.length === 0) return
    let cancel: (() => void) | undefined
    const id = setTimeout(() => { cancel = preloadGalleryThumbs(images, { bucket, count: 150 }) }, 1500)
    return () => { clearTimeout(id); cancel?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWelcome, images.length, bucket])
}
