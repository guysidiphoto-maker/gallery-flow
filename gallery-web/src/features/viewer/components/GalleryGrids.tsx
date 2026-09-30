import type { GalleryImage, GallerySection as Section } from '@/shared/types'
import type { ViewerRole } from '../lib/viewerSettings'
import { ALL_IMAGES_ANCHOR, sectionAnchor } from '../lib/sectionPaging'
import { GallerySection } from './GallerySection'
import { MasonryGrid, type MasonryGridProps } from './masonry/MasonryGrid'

export type SharedGridProps = Omit<MasonryGridProps, 'images' | 'onImageClick'>

/**
 * Chapters (only the active one in paged mode), then the all-images block:
 * the whole gallery when there are no sections or none has content, else the
 * unsectioned leftovers, so no photo is ever stranded.
 */
export function GalleryGrids({
  images, sections, visibleImages, unsectionedImages, anySectionHasContent, pagedMode, activeAnchor, viewerRole, gridProps, photoCount, onOpen,
}: {
  images: GalleryImage[]
  sections: Section[]
  visibleImages: GalleryImage[]
  unsectionedImages: GalleryImage[]
  anySectionHasContent: boolean
  pagedMode: boolean
  activeAnchor: string
  viewerRole: ViewerRole
  gridProps: SharedGridProps
  photoCount: (n: number) => string
  /** Next/prev in the lightbox stays within the list the tile came from. */
  onOpen: (list: GalleryImage[], index: number) => void
}) {
  const showAllBlock =
    (sections.length === 0 || !anySectionHasContent || unsectionedImages.length > 0) &&
    !(pagedMode && anySectionHasContent && activeAnchor !== ALL_IMAGES_ANCHOR)
  const mainGridImages =
    viewerRole === 'client' ? images :
    sections.length === 0 ? visibleImages :
    unsectionedImages.length > 0 ? unsectionedImages :
    visibleImages

  return (
    <>
      {sections
        .filter(sec => !pagedMode || activeAnchor === sectionAnchor(sec.id))
        .map(sec => {
          // visibleImages is already face-filtered, so chapters without matches drop out.
          const sectionImages = visibleImages.filter(img => img.section_id === sec.id)
          if (sectionImages.length === 0) return null
          return (
            <GallerySection key={sec.id} section={sec} countLabel={photoCount(sectionImages.length)}>
              <MasonryGrid {...gridProps} images={sectionImages} onImageClick={idx => onOpen(sectionImages, idx)} />
            </GallerySection>
          )
        })}

      {showAllBlock && (
        <section id={ALL_IMAGES_ANCHOR} className="mt-[clamp(4px,0.6vw,8px)] scroll-mt-20 px-(--viewer-content-px)">
          <MasonryGrid {...gridProps} images={mainGridImages} onImageClick={idx => onOpen(mainGridImages, idx)} />
        </section>
      )}
    </>
  )
}
