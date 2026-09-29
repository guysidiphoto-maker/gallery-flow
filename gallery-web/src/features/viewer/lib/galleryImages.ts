import type { GalleryImage, GallerySection } from '@/shared/types'

const WELCOME_TARGET = 30

/**
 * Photos for the welcome mosaic: curated top picks, else the first 30 spread
 * evenly across sections so the collage represents the whole gallery.
 */
export function pickWelcomeImages(images: GalleryImage[], sections: GallerySection[]): GalleryImage[] {
  const topPicks = images.filter(img => img.is_top_pick)
  if (topPicks.length > 0) return topPicks.slice(0, WELCOME_TARGET)
  if (sections.length <= 1) return images.slice(0, WELCOME_TARGET)
  const perSection = Math.ceil(WELCOME_TARGET / sections.length)
  const result: GalleryImage[] = []
  for (const sec of sections) {
    const secImgs = images.filter(img => img.section_id === sec.id)
    result.push(...secImgs.slice(0, perSection))
  }
  const unsectioned = images.filter(img => !img.section_id)
  result.push(...unsectioned.slice(0, Math.max(0, WELCOME_TARGET - result.length)))
  return result.slice(0, WELCOME_TARGET)
}

const isLandscape = (im: GalleryImage) => !!(im.width && im.height && im.width > im.height)

/** Hero fallback when no cover is set: images[0] is often a dark portrait frame. */
export function pickHeroFallback(images: GalleryImage[]): GalleryImage | undefined {
  return images.find(im => im.is_top_pick && isLandscape(im))
    ?? images.find(isLandscape)
    ?? images.find(im => im.is_top_pick)
    ?? images[0]
}

/** Cover lookup by id, or by filename for covers stored as a path. */
export function findCoverImage(images: GalleryImage[], coverImageId: string | null): GalleryImage | null {
  if (!coverImageId) return null
  const cFilename = coverImageId.includes('/') ? coverImageId.split('/').pop() : coverImageId
  return images.find(i => i.id === coverImageId || i.filename === coverImageId || i.filename === cFilename) ?? null
}
