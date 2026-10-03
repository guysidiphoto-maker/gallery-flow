import type { CSSProperties } from 'react'
import { gapForSpacing } from '@/shared/gallery/galleryLayout'
import { cn } from '@/shared/ui'
import type { GalleryImage } from '@/shared/types'
import { MasonryTile, type TileWatermark } from './MasonryTile'
import { useBalancedColumns, useColumnCount, useContainerWidth, useProgressiveImages } from './useMasonryLayout'

export interface MasonryGridProps {
  images: GalleryImage[]
  imgBucket: string
  layoutMode: string
  imageSpacing: string
  cornerStyle: string
  onImageClick: (index: number) => void
  onDownload?: (img: GalleryImage) => void
  /** Called when a finger lands on a tile's download button, before the tap. */
  onWarmDownload?: (img: GalleryImage) => void
  selectMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  clientMode?: boolean
  hiddenIds?: Set<string>
  onToggleHide?: (id: string) => void
  watermark?: TileWatermark | null
}

/** Uncropped column masonry: every photo keeps its natural aspect and its column once placed. */
export function MasonryGrid({
  images, imgBucket, layoutMode, imageSpacing, cornerStyle, onImageClick, onDownload, onWarmDownload,
  selectMode, selectedIds, onToggleSelect, clientMode, hiddenIds, onToggleHide, watermark,
}: MasonryGridProps) {
  const cols = useColumnCount(layoutMode)
  const { containerRef, containerWidth } = useContainerWidth()
  const { visibleImages, hasMore, sentinelRef } = useProgressiveImages(images)
  const columns = useBalancedColumns(visibleImages, cols)

  const gap = gapForSpacing(imageSpacing)
  const colWidth = containerWidth > 0 ? (containerWidth - gap * (cols - 1)) / cols : 0
  const imgSizes = colWidth > 0 ? `${Math.round(colWidth)}px` : `${Math.round(100 / cols)}vw`

  return (
    <div
      ref={containerRef}
      className={cn('relative flex gap-(--gap) px-(--gap)', layoutMode === '1-col' && 'mx-auto max-w-[900px]')}
      style={{ '--gap': `${gap}px` } as CSSProperties}
    >
      {columns.map((col, ci) => (
        <div key={ci} className="flex min-w-0 flex-1 flex-col gap-(--gap)">
          {col.map(({ img, index }) => (
            <MasonryTile
              key={img.id}
              img={img}
              index={index}
              imgBucket={imgBucket}
              imgSizes={imgSizes}
              fullWidth={cols === 1}
              isAboveFold={index < cols}
              rounded={cornerStyle === 'rounded'}
              selectMode={selectMode}
              isSelected={!!(selectMode && selectedIds?.has(img.id))}
              clientMode={clientMode}
              isHidden={!!hiddenIds?.has(img.id)}
              watermark={watermark}
              onImageClick={onImageClick}
              onToggleSelect={onToggleSelect}
              onToggleHide={onToggleHide}
              onDownload={onDownload}
              onWarmDownload={onWarmDownload}
            />
          ))}
        </div>
      ))}
      {hasMore && (
        <div ref={sentinelRef} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px" />
      )}
    </div>
  )
}
