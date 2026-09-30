import { useLayoutEffect, useRef, useState } from 'react'
import { FixedSizeGrid } from 'react-window'
import type { GalleryImage } from '../../types'
import { VirtualPhotoCell, type VirtualPhotoCellData } from './VirtualPhotoCell'
import type { PhotoGridUI } from './usePhotoGridUI'

// Room for the grid's own vertical scrollbar; columns must fit inside what's left
// or react-window adds a horizontal scrollbar.
const SCROLLBAR_ALLOWANCE = 18

// Virtualized grid sized from its container's real width (ResizeObserver);
// columns stretch to fill it, like the non-virtual auto-fill grid.
export function VirtualPhotoGrid({ visibleImages, minCell, currentCoverPath, ui }: {
  visibleImages: GalleryImage[]
  minCell: number
  currentCoverPath: string | null
  ui: PhotoGridUI
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const h = typeof window === 'undefined' ? 800 : Math.max(400, window.innerHeight - 280)
  const usable = Math.max(minCell, width - SCROLLBAR_ALLOWANCE)
  const colCount = Math.max(1, Math.floor(usable / (minCell + 4)))
  const cell = Math.floor(usable / colCount)
  const rowCount = Math.ceil(visibleImages.length / colCount)
  const itemData: VirtualPhotoCellData = { visibleImages, colCount, currentCoverPath, ui }

  return (
    <div ref={boxRef} className="w-full overflow-hidden">
      {width > 0 && (
        <FixedSizeGrid
          columnCount={colCount}
          rowCount={rowCount}
          columnWidth={cell}
          rowHeight={cell}
          height={h}
          width={width}
          overscanRowCount={2}
          itemData={itemData}
          style={{ overflowX: 'hidden' }}
        >
          {VirtualPhotoCell}
        </FixedSizeGrid>
      )}
    </div>
  )
}
