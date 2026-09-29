import type { GalleryImage } from '../types'

export type PhotoSort = 'order' | 'name' | 'newest'

export const bySortOrder = (a: GalleryImage, b: GalleryImage) => (a.sort_order ?? 0) - (b.sort_order ?? 0)

/** Images of the active section (every image when no section is active). */
export function sectionImages(images: GalleryImage[], activeSectionId: string | null): GalleryImage[] {
  return activeSectionId ? images.filter(i => i.section_id === activeSectionId) : images
}

/** Active section's images in persisted manual order. */
export function orderedSectionImages(images: GalleryImage[], activeSectionId: string | null): GalleryImage[] {
  return sectionImages(images, activeSectionId).slice().sort(bySortOrder)
}

export function sortPhotos(images: GalleryImage[], sort: PhotoSort): GalleryImage[] {
  return [...images].sort((a, b) => {
    if (sort === 'name') return (a.filename || '').localeCompare(b.filename || '')
    if (sort === 'newest') return (b.sort_order ?? 0) - (a.sort_order ?? 0)
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })
}
