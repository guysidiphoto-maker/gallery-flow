import React from 'react'
import {
  SortableContext,
  rectSortingStrategy
} from '@dnd-kit/sortable'
import { useGallery } from '../store/gallery'
import { useSections } from '../store/sections'
import { ImageCard } from './ImageCard'
import type { ImageFile } from '../types'

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

  // Compute the display image list based on active filter
  const imgMap = new Map(images.map(i => [i.id, i]))
  let displayImages: ImageFile[]

  if (activeSectionFilter === null) {
    displayImages = images
  } else {
    const sec = sections.find(s => s.id === activeSectionFilter)
    if (sec) {
      displayImages = sec.imageIds
        .map(id => imgMap.get(id))
        .filter((i): i is ImageFile => !!i)
    } else {
      displayImages = images
    }
  }

  // Compute per-image section membership for badges
  const imageSectionMap = new Map<string, string[]>()
  for (const sec of sections) {
    for (const imgId of sec.imageIds) {
      const existing = imageSectionMap.get(imgId) ?? []
      imageSectionMap.set(imgId, [...existing, sec.id])
    }
  }

  if (images.length === 0 || displayImages.length === 0) {
    return (
      <div className="gallery-empty">
        <div className="gallery-empty__icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
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

  return (
    <SortableContext
      items={displayImages.map(img => img.id)}
      strategy={rectSortingStrategy}
    >
      <div
        className="gallery-grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, ${thumbnailSize}px)`
        }}
      >
        {displayImages.map(image => (
          <ImageCard
            key={image.id}
            image={image}
            isSelected={selectedIds.has(image.id)}
            isTopPick={topPickIds.has(image.id)}
            thumbnailSize={thumbnailSize}
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
    </SortableContext>
  )
}
