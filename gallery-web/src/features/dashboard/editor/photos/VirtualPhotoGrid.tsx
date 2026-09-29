import { FixedSizeGrid } from 'react-window'
import type { GalleryImage } from '../../types'
import { VirtualPhotoCell, type VirtualPhotoCellData } from './VirtualPhotoCell'
import type { PhotoGridUI } from './usePhotoGridUI'

// Virtualized grid. Size is a heuristic from the viewport (minus ~360px of
// sidebar/padding and ~280px of chrome); at most one tile per row off.
export function VirtualPhotoGrid({ visibleImages, minCell, currentCoverPath, ui }: {
  visibleImages: GalleryImage[]
  minCell: number
  currentCoverPath: string | null
  ui: PhotoGridUI
}) {
  const w = typeof window === 'undefined' ? 1200 : Math.max(360, window.innerWidth - 360)
  const h = typeof window === 'undefined' ? 800 : Math.max(400, window.innerHeight - 280)
  const colCount = Math.max(1, Math.floor((w + 4) / (minCell + 4)))
  const rowCount = Math.ceil(visibleImages.length / colCount)
  const itemData: VirtualPhotoCellData = { visibleImages, colCount, currentCoverPath, ui }
  return (
    <FixedSizeGrid
      columnCount={colCount}
      rowCount={rowCount}
      columnWidth={minCell + 4}
      rowHeight={minCell + 4}
      height={h}
      width={w}
      overscanRowCount={2}
      itemData={itemData}
    >
      {VirtualPhotoCell}
    </FixedSizeGrid>
  )
}
