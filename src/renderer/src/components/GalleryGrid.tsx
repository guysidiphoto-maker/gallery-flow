import React, { useCallback, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  MeasuringStrategy
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy
} from '@dnd-kit/sortable'
import { useGallery } from '../store/gallery'
import { ImageCard, DragOverlayCard } from './ImageCard'

export function GalleryGrid() {
  const {
    images,
    selectedIds,
    topPickIds,
    thumbnailSize,
    handleDrop,
    moveToTop,
    moveToBottom,
    selectImage,
    deleteImage,
    revealInFinder,
    toggleTopPick,
    openViewer
  } = useGallery()

  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Require 5px movement before activating drag (allows clicks to register)
        distance: 5
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (over && active.id !== over.id) {
      await handleDrop(String(active.id), String(over.id))
    }
  }, [handleDrop])

  const activeImage = activeId ? images.find(img => img.id === activeId) : null

  if (images.length === 0) {
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={images.map(img => img.id)}
        strategy={rectSortingStrategy}
      >
        <div
          className="gallery-grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, ${thumbnailSize}px)`
          }}
        >
          {images.map(image => (
            <ImageCard
              key={image.id}
              image={image}
              isSelected={selectedIds.has(image.id)}
              isTopPick={topPickIds.has(image.id)}
              thumbnailSize={thumbnailSize}
              onSelect={selectImage}
              onOpenViewer={openViewer}
              onMoveToTop={moveToTop}
              onMoveToBottom={moveToBottom}
              onDelete={deleteImage}
              onReveal={revealInFinder}
              onToggleTopPick={toggleTopPick}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={{
        duration: 200,
        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)'
      }}>
        {activeImage ? (
          <DragOverlayCard image={activeImage} thumbnailSize={thumbnailSize} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
