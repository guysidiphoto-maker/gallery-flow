import { SignedImg } from '@/shared/ui/SignedImg'
import { Icon } from '@/shared/ui/Icon'
import { bgSubtle, textPrimary } from '../../styles'
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
      style={{
        position: 'relative', aspectRatio: '1',
        // Unclip while the menu is open so the popup isn't cut at the tile edge.
        overflow: isMenuOpen ? 'visible' : 'hidden',
        background: bgSubtle,
        cursor: dragEnabled ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
        outline: isSelected
          ? `2px solid ${textPrimary}`
          : (isDropTarget ? `2px solid ${textPrimary}` : 'none'),
        outlineOffset: isSelected || isDropTarget ? -2 : 0,
        opacity: isDragging ? 0.4 : 1,
        // Lift the open menu's tile above its neighbours.
        zIndex: isMenuOpen ? 10 : 'auto',
        transition: 'transform .25s cubic-bezier(.2,.7,.2,1), opacity .15s',
      }}
    >
      {/* Leading-edge bar showing where the dragged image will land. */}
      {isDropTarget && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          insetInlineEnd: -2, width: 3,
          background: textPrimary, zIndex: 4,
          pointerEvents: 'none',
        }} />
      )}
      <SignedImg
        bucket="gallery-images"
        path={img.thumbnail_path || img.storage_path}
        alt="" loading="lazy"
        style={{
          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
          filter: isSelected ? 'brightness(0.55)' : 'none',
          transition: 'filter .15s',
        }}
      />

      {isCover && !selectMode && (
        <div
          aria-label="תמונת השער של הגלריה"
          style={{
            position: 'absolute', bottom: 8, insetInlineStart: 8,
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 999,
            background: 'rgba(0,0,0,.62)', color: '#fff',
            fontSize: 10, fontWeight: 600, letterSpacing: '.04em',
            pointerEvents: 'none', zIndex: 3,
          }}
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
          style={{
            position: 'absolute', top: 8, insetInlineStart: 8,
            width: 26, height: 26, borderRadius: '50%',
            background: img.is_top_pick ? '#fff' : 'rgba(255,255,255,.85)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: textPrimary, padding: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24"
            fill={img.is_top_pick ? textPrimary : 'none'}
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
          style={{
            position: 'absolute', top: 8, insetInlineEnd: 8,
            width: 26, height: 26, borderRadius: '50%',
            background: 'rgba(255,255,255,.85)', border: 'none',
            cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: textPrimary,
          }}
        >
          <Icon name="menu" size={14} strokeWidth={1.85} />
        </button>
      )}

      {selectMode && (
        <div style={{
          position: 'absolute', top: 8, insetInlineEnd: 8,
          width: 22, height: 22, borderRadius: '50%',
          background: isSelected ? textPrimary : 'rgba(255,255,255,.85)',
          border: `1.5px solid ${isSelected ? textPrimary : 'rgba(255,255,255,.95)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .15s',
        }}>
          {isSelected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </div>
      )}

      {isMenuOpen && <PhotoMenu img={img} visibleImages={visibleImages} isCover={isCover} ui={ui} />}
    </div>
  )
}
