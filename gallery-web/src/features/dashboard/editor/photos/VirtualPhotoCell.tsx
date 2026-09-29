import type { GridChildComponentProps } from 'react-window'
import type { GalleryImage } from '../../types'
import { PhotoTile } from './PhotoTile'
import type { PhotoGridUI } from './usePhotoGridUI'

export interface VirtualPhotoCellData {
  visibleImages: GalleryImage[]
  colCount: number
  currentCoverPath: string | null
  ui: PhotoGridUI
}

// react-window's `style` positions the cell; the wrapper keeps the tile's own
// position: relative for its overlays.
export function VirtualPhotoCell({ columnIndex, rowIndex, style, data }: GridChildComponentProps<VirtualPhotoCellData>) {
  const idx = rowIndex * data.colCount + columnIndex
  const img = data.visibleImages[idx]
  if (!img) return <div style={style} />
  return (
    <div style={{ ...style, padding: 2 }}>
      <PhotoTile img={img} visibleImages={data.visibleImages} currentCoverPath={data.currentCoverPath} ui={data.ui} />
    </div>
  )
}
