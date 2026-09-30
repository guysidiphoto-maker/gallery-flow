import type { GallerySection } from '@/shared/types'

/** Slug of the synthetic "More Photos" page holding unsectioned images. */
const UNSECTIONED_SLUG = 'more'
export const ALL_IMAGES_ANCHOR = 'all-images'

export const sectionAnchor = (sectionId: string) => `section-${sectionId}`

/** Section slug/id from the path segment after the gallery base, else the legacy ?section= param. */
export function currentSectionParam(galleryBasePath: string | null): string | null {
  try {
    const path = window.location.pathname.replace(/\/+$/, '')
    if (galleryBasePath && path.startsWith(galleryBasePath + '/')) {
      return decodeURIComponent(path.slice(galleryBasePath.length + 1))
    }
    return new URLSearchParams(window.location.search).get('section')
  } catch { return null }
}

export function anchorForParam(param: string | null, sections: GallerySection[]): string | null {
  if (!param) return null
  if (param === UNSECTIONED_SLUG) return ALL_IMAGES_ANCHOR
  const sec = sections.find(s => s.slug === param || s.id === param)
  return sec ? sectionAnchor(sec.id) : null
}

export function slugForAnchor(anchorId: string, sections: GallerySection[]): string | null {
  if (anchorId === ALL_IMAGES_ANCHOR) return UNSECTIONED_SLUG
  const secId = anchorId.replace(/^section-/, '')
  const sec = sections.find(s => s.id === secId)
  return sec ? (sec.slug || sec.id) : null
}
