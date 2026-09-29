import { SignedImg } from '@/shared/ui/SignedImg'
import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'
import { orderedSectionImages } from '../../lib/photoOrder'
import type { GalleryImage } from '../../types'
import { useEditor } from '../EditorContext'
import { PhotoMenu } from './PhotoMenu'
import type { PhotoGridUI } from './usePhotoGridUI'

// One square grid tile: drag-to-reorder, top-pick star, cover badge, select
// chip, and the "…" action menu.
export function PhotoTile({ img, visibleImages, currentCoverPath, ui }: {
  img: GalleryImage
  visibleImages: GalleryImage[]
  currentCoverPath: string | null
  ui: PhotoGridUI
}) {
  const { session, photos } = useEditor()
  const { selectMode, selectedImageIds, photoSort } = photos
  const {
    hoveredImageId, setHoveredImageId, imageMenuOpenId, setImageMenuOpenId, setMenuOpenUpward,
    draggedImageId, setDraggedImageId, dragOverId, setDragOverId, coarsePointer,
    photoMenuAnchorRef, closePhotoMenu,
  } = ui
  const isSelected = selectedImageIds.has(img.id)
  const isHovered = hoveredImageId === img.id
  const isMenuOpen = imageMenuOpenId === img.id
  const isCover = currentCoverPath != null && currentCoverPath === img.storage_path
  // Per-tile actions hide in select mode; coarse pointers (no hover) show them persistently.
  const showHoverOverlay = (isHovered || coarsePointer) && !selectMode
  // Drag only under manual sort so the visible order matches what's persisted.
  const dragEnabled = photoSort === 'order' && !selectMode
  const isDragging = draggedImageId === img.id
  const isDropTarget = dragOverId === img.id && draggedImageId && draggedImageId !== img.id

  return (
    <div
      ref={isMenuOpen ? photoMenuAnchorRef : undefined}
      tabIndex={isMenuOpen ? -1 : undefined}
      data-photo-tile={img.id}
      draggable={dragEnabled}
      onDragStart={(e) => {
        if (!dragEnabled) return
        setDraggedImageId(img.id)
        e.dataTransfer.effectAllowed = 'move'
        try { e.dataTransfer.setData('text/plain', img.id) } catch { /* ignore */ }
      }}
      onDragOver={(e) => {
        if (!dragEnabled || !draggedImageId || draggedImageId === img.id) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (dragOverId !== img.id) setDragOverId(img.id)
      }}
      onDragLeave={() => {
        if (dragOverId === img.id) setDragOverId(null)
      }}
      onDrop={(e) => {
        if (!dragEnabled || !draggedImageId) return
        e.preventDefault()
        e.stopPropagation()
        const src = draggedImageId
        setDraggedImageId(null); setDragOverId(null)
        if (src && src !== img.id) photos.reorderImage(src, img.id)
      }}
      onDragEnd={() => { setDraggedImageId(null); setDragOverId(null) }}
      onMouseEnter={() => setHoveredImageId(img.id)}
      onMouseLeave={() => { setHoveredImageId(null) }}
      onClick={(e) => {
        e.stopPropagation()
        if (selectMode) {
          photos.toggleSelected(img.id)
          return
        }
        // Lightbox navigates within the active section in manual order.
        photos.openViewer(orderedSectionImages(session.galleryImages, session.activeSectionId), img.id)
      }}
      className={cn(
        'relative aspect-square bg-surface [transition:transform_.25s_cubic-bezier(.2,.7,.2,1),opacity_.15s]',
        // Unclip and lift while the menu is open so the popup isn't cut or covered.
        isMenuOpen ? 'z-10 overflow-visible' : 'z-auto overflow-hidden',
        dragEnabled ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer',
        isSelected || isDropTarget ? 'outline-2 -outline-offset-2 outline-ink' : 'outline-none',
        isDragging ? 'opacity-40' : 'opacity-100',
      )}
    >
      {/* Leading-edge bar showing where the dragged image will land. */}
      {isDropTarget && (
        <div className="pointer-events-none absolute inset-y-0 -end-0.5 z-[4] w-[3px] bg-ink" />
      )}
      <SignedImg
        bucket="gallery-images"
        path={img.thumbnail_path || img.storage_path}
        alt="" loading="lazy"
        className={cn(
          'block size-full object-cover transition-[filter] duration-150',
          isSelected ? 'brightness-[0.55]' : 'filter-none',
        )}
      />

      {isCover && !selectMode && (
        <div
          aria-label="תמונת השער של הגלריה"
          className="pointer-events-none absolute start-2 bottom-2 z-[3] flex items-center gap-1 rounded-full bg-black/62 px-2 py-[3px] text-[10px] font-semibold tracking-[.04em] text-white"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.6" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span>קאבר</span>
        </div>
      )}

      {/* Star: always shown when pinned, otherwise on hover. */}
      {(img.is_top_pick || showHoverOverlay) && (
        <button
          onClick={(e) => { e.stopPropagation(); photos.toggleSingleTopPick(img.id) }}
          aria-label={img.is_top_pick ? 'הסר מן המועדפים' : 'הוסף למועדפים'}
          className={cn(
            'absolute start-2 top-2 flex size-[26px] cursor-pointer items-center justify-center rounded-full p-0 text-ink',
            img.is_top_pick ? 'bg-white' : 'bg-white/85',
          )}
        >
          <svg width="13" height="13" viewBox="0 0 24 24"
            fill={img.is_top_pick ? 'currentColor' : 'none'}
            stroke="currentColor" strokeWidth="1.85"
            strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      )}

      {showHoverOverlay && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            // Toggle; when opening, flip upward if there's little room below.
            if (isMenuOpen) { closePhotoMenu(); return }
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setMenuOpenUpward(window.innerHeight - r.bottom < 240)
            setImageMenuOpenId(img.id)
          }}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-label="תפריט תמונה"
          className="absolute end-2 top-2 flex size-[26px] cursor-pointer items-center justify-center rounded-full bg-white/85 p-0 text-ink"
        >
          <Icon name="menu" size={14} strokeWidth={1.85} />
        </button>
      )}

      {selectMode && (
        <div
          className={cn(
            'absolute end-2 top-2 flex size-[22px] items-center justify-center rounded-full border-[1.5px] transition-all duration-150',
            isSelected ? 'border-ink bg-ink' : 'border-white/95 bg-white/85',
          )}
        >
          {isSelected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-white">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </div>
      )}

      {isMenuOpen && <PhotoMenu img={img} visibleImages={visibleImages} isCover={isCover} ui={ui} />}
    </div>
  )
}
