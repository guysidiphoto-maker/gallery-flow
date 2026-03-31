import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable, useDndContext } from '@dnd-kit/core'
import { useGallery } from '../store/gallery'
import { useSections } from '../store/sections'
import { ImageCard } from './ImageCard'
import type { ImageFile } from '../types'

export const FIRST_POSITION_DROP_ID = 'gallery-first-position'

const GAP = 4 // px between images

interface JustifiedRow {
  imgs: ImageFile[]
  height: number
  widths: number[]
}

function buildJustifiedRows(
  images: ImageFile[],
  arMap: Record<string, number>,
  containerWidth: number,
  targetHeight: number
): JustifiedRow[] {
  if (containerWidth <= 0 || images.length === 0) return []

  const rows: JustifiedRow[] = []
  let rowImgs: ImageFile[] = []
  let sumAR = 0

  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const ar = arMap[img.id] ?? 1.5
    rowImgs.push(img)
    sumAR += ar

    const naturalRowWidth = sumAR * targetHeight + (rowImgs.length - 1) * GAP
    const isLast = i === images.length - 1

    if (naturalRowWidth >= containerWidth || isLast) {
      const avail = containerWidth - (rowImgs.length - 1) * GAP

      const rawH = (isLast && naturalRowWidth < containerWidth)
        ? targetHeight
        : avail / sumAR

      // Clamp tightly: rows stay between 65%–130% of target height.
      // This prevents extreme outlier rows and keeps the grid visually stable.
      const minH = Math.round(targetHeight * 0.65)
      const maxH = Math.round(targetHeight * 1.30)
      const h = Math.max(minH, Math.min(Math.round(rawH), maxH))

      rows.push({
        imgs: rowImgs,
        height: Math.round(h),
        widths: rowImgs.map(img => Math.round(h * (arMap[img.id] ?? 1.5)))
      })

      rowImgs = []
      sumAR = 0
    }
  }

  return rows
}

export function GalleryGrid() {
  const {
    images,
    selectedIds,
    topPickIds,
    thumbnailSize,
    moveToTop,
    moveToBottom,
    selectImage,
    selectRange,
    deleteImage,
    revealInFinder,
    toggleTopPick,
    openViewer
  } = useGallery()

  const {
    sections,
    activeSectionFilter,
    addImagesToSection,
    removeImageFromSection
  } = useSections()

  // ── Container width tracking ────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width))
    })
    ro.observe(containerRef.current)
    // Initial measurement
    setContainerWidth(Math.floor(containerRef.current.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])

  // ── Aspect ratio map (populated from img onLoad) ────────────────────────────
  const [arMap, setArMap] = useState<Record<string, number>>({})

  const handleAspectRatio = useCallback((id: string, ar: number) => {
    setArMap(prev => (prev[id] === ar ? prev : { ...prev, [id]: ar }))
  }, [])

  // ── Filtered image list ─────────────────────────────────────────────────────
  const imgMap = new Map(images.map(i => [i.id, i]))
  let displayImages: ImageFile[]

  if (activeSectionFilter === null) {
    displayImages = images
  } else {
    const sec = sections.find(s => s.id === activeSectionFilter)
    displayImages = sec
      ? sec.imageIds.map(id => imgMap.get(id)).filter((i): i is ImageFile => !!i)
      : images
  }

  // ── Section membership map ──────────────────────────────────────────────────
  const imageSectionMap = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const sec of sections) {
      for (const imgId of sec.imageIds) {
        m.set(imgId, [...(m.get(imgId) ?? []), sec.id])
      }
    }
    return m
  }, [sections])

  // ── Justified rows ──────────────────────────────────────────────────────────
  const rows = useMemo(
    () => buildJustifiedRows(displayImages, arMap, containerWidth, thumbnailSize),
    [displayImages, arMap, containerWidth, thumbnailSize]
  )

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (images.length === 0 || displayImages.length === 0) {
    return (
      <div className="gallery-empty">
        <div className="gallery-empty__icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
        <p className="gallery-empty__title">No images loaded</p>
        <p className="gallery-empty__sub">Open a folder to get started</p>
      </div>
    )
  }

  const { active: dndActive } = useDndContext()
  const isDragging = dndActive !== null
  const { setNodeRef: setFirstZoneRef, isOver: isOverFirstZone } = useDroppable({ id: FIRST_POSITION_DROP_ID })

  return (
    <SortableContext items={displayImages.map(img => img.id)} strategy={rectSortingStrategy}>
      <div ref={containerRef} className="gallery-justified">

        {/* Drop zone: drag here to place image at position 1 */}
        <div
          ref={setFirstZoneRef}
          className={`gallery-first-drop ${isDragging ? 'gallery-first-drop--visible' : ''} ${isOverFirstZone ? 'gallery-first-drop--active' : ''}`}
        >
          {isOverFirstZone && <span className="gallery-first-drop__label">Move to first</span>}
        </div>

        {rows.map((row, ri) => (
          <div key={ri} className="gallery-row" style={{ gap: GAP }}>
            {row.imgs.map((image, ii) => (
              <ImageCard
                key={image.id}
                image={image}
                isSelected={selectedIds.has(image.id)}
                isTopPick={topPickIds.has(image.id)}
                thumbnailSize={thumbnailSize}
                cardWidth={row.widths[ii]}
                cardHeight={row.height}
                onAspectRatio={handleAspectRatio}
                onSelect={selectImage}
                onSelectRange={selectRange}
                onOpenViewer={openViewer}
                onMoveToTop={moveToTop}
                onMoveToBottom={moveToBottom}
                onDelete={deleteImage}
                onReveal={revealInFinder}
                onToggleTopPick={toggleTopPick}
                sections={sections}
                imageSectionIds={imageSectionMap.get(image.id) ?? []}
                selectedIds={selectedIds}
                onAddToSection={addImagesToSection}
                onRemoveFromSection={removeImageFromSection}
              />
            ))}
          </div>
        ))}
      </div>
    </SortableContext>
  )
}
