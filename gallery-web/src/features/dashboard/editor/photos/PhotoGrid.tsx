import { readCoverConfig } from '@/shared/gallery/coverImage'
import { sectionImages, sortPhotos } from '../../lib/photoOrder'
import { useEditor } from '../EditorContext'
import { PhotoTile } from './PhotoTile'
import { VirtualPhotoGrid } from './VirtualPhotoGrid'
import type { PhotoGridUI } from './usePhotoGridUI'

// Past this many photos only the visible tiles are mounted (react-window).
const VIRTUALIZE_THRESHOLD = 300

// Tight square grid of the active section, sorted per photoSort, sized per gridSize.
export function PhotoGrid({ ui }: { ui: PhotoGridUI }) {
  const { session, photos } = useEditor()
  const { galleryImages, activeSectionId, editingGallery } = session
  // Sort a copy so the underlying state keeps upload order.
  const visibleImages = sortPhotos(sectionImages(galleryImages, activeSectionId), photos.photoSort)
  const minCell = photos.gridSize === 'large' ? 220 : 140
  // The canonical cover is a stable storage path in delivery_settings; a tile
  // is "the cover" only when a gallery photo is used and the path matches.
  const coverCfgGrid = readCoverConfig(
    (editingGallery?.delivery_settings ?? {}) as Record<string, unknown>,
  )
  const currentCoverPath =
    coverCfgGrid.source === 'gallery_asset' ? coverCfgGrid.path : null

  if (!visibleImages.length) return null
  if (visibleImages.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minCell}px, 1fr))`,
        gap: 4,
      }}>
        {visibleImages.map(img => (
          <PhotoTile key={img.id} img={img} visibleImages={visibleImages} currentCoverPath={currentCoverPath} ui={ui} />
        ))}
      </div>
    )
  }
  return (
    <VirtualPhotoGrid
      visibleImages={visibleImages}
      minCell={minCell}
      currentCoverPath={currentCoverPath}
      ui={ui}
    />
  )
}
