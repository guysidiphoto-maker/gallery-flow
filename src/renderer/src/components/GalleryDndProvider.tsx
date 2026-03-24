import React, { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  MeasuringStrategy
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useGallery } from '../store/gallery'
import { useSections } from '../store/sections'
import { DragOverlayCard } from './ImageCard'

interface PendingDrop {
  imageIds: string[]
  sectionId: string
  sectionName: string
}

function SectionDropDialog({
  imageCount,
  sectionName,
  onMove,
  onCopy,
  onCancel
}: {
  imageCount: number
  sectionName: string
  onMove: () => void
  onCopy: () => void
  onCancel: () => void
}) {
  return (
    <div className="section-drop-overlay" onClick={onCancel}>
      <div className="section-drop-dialog" onClick={e => e.stopPropagation()}>
        <p className="section-drop-dialog__title">
          Add {imageCount} image{imageCount !== 1 ? 's' : ''} to &ldquo;{sectionName}&rdquo;?
        </p>
        <div className="section-drop-dialog__actions">
          <button className="btn btn--accent" onClick={onMove}>Move here</button>
          <button className="btn btn--ghost" onClick={onCopy}>Copy here</button>
          <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function GalleryDndProvider({ children }: { children: React.ReactNode }) {
  const { images, selectedIds, thumbnailSize, handleDrop } = useGallery()
  const {
    sections,
    activeSectionFilter,
    addImagesToSection,
    moveImagesToSection,
    reorderSectionImages
  } = useSections()

  const [activeId, setActiveId] = useState<string | null>(null)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)

  const imgMap = new Map(images.map(i => [i.id, i]))
  const activeImage = activeId ? (imgMap.get(activeId) ?? null) : null

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  // Prefer section droppables when pointer is over them; fall back to closestCenter
  const collisionDetection = useCallback((args: Parameters<typeof closestCenter>[0]) => {
    const sectionContainers = args.droppableContainers.filter(c =>
      String(c.id).startsWith('section-drop-')
    )
    if (sectionContainers.length > 0) {
      const sectionHits = pointerWithin({ ...args, droppableContainers: sectionContainers })
      if (sectionHits.length > 0) return sectionHits
    }
    return closestCenter(args)
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const overId = String(over.id)

    // Dropped on a section drop zone
    if (overId.startsWith('section-drop-')) {
      const sectionId = overId.replace('section-drop-', '')
      const sec = sections.find(s => s.id === sectionId)
      if (!sec) return

      const draggedId = String(active.id)
      const imageIds = selectedIds.has(draggedId) && selectedIds.size > 1
        ? Array.from(selectedIds)
        : [draggedId]

      setPendingDrop({ imageIds, sectionId, sectionName: sec.name })
      return
    }

    if (active.id === over.id) return

    if (activeSectionFilter) {
      reorderSectionImages(activeSectionFilter, String(active.id), overId)
    } else {
      await handleDrop(String(active.id), overId)
    }
  }, [sections, selectedIds, activeSectionFilter, reorderSectionImages, handleDrop])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}

      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeImage ? (
          <DragOverlayCard image={activeImage} thumbnailSize={thumbnailSize} />
        ) : null}
      </DragOverlay>

      {pendingDrop && (
        <SectionDropDialog
          imageCount={pendingDrop.imageIds.length}
          sectionName={pendingDrop.sectionName}
          onMove={() => {
            moveImagesToSection(pendingDrop.imageIds, pendingDrop.sectionId)
            setPendingDrop(null)
          }}
          onCopy={() => {
            addImagesToSection(pendingDrop.imageIds, pendingDrop.sectionId)
            setPendingDrop(null)
          }}
          onCancel={() => setPendingDrop(null)}
        />
      )}
    </DndContext>
  )
}
