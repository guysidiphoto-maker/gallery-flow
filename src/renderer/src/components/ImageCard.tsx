import React, { memo, useState, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ImageFile } from '../types'
import { toLocalURL } from '../utils/imageUtils'

interface ImageCardProps {
  image: ImageFile
  isSelected: boolean
  isTopPick: boolean
  thumbnailSize: number
  onSelect: (id: string, multi: boolean) => void
  onOpenViewer: (id: string) => void
  onMoveToTop: (id: string) => void
  onMoveToBottom: (id: string) => void
  onDelete: (id: string) => void
  onReveal: (id: string) => void
  onToggleTopPick: (id: string) => void
  isOverlay?: boolean
}

export const ImageCard = memo(function ImageCard({
  image,
  isSelected,
  isTopPick,
  thumbnailSize,
  onSelect,
  onOpenViewer,
  onMoveToTop,
  onMoveToBottom,
  onDelete,
  onReveal,
  onToggleTopPick,
  isOverlay = false
}: ImageCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: image.id, disabled: isOverlay })

  const [imgError, setImgError] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    width: thumbnailSize,
    zIndex: isDragging ? 999 : 'auto'
  }

  const handleClick = useCallback((e: React.MouseEvent) => {
    onSelect(image.id, e.metaKey || e.ctrlKey || e.shiftKey)
  }, [image.id, onSelect])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onOpenViewer(image.id)
  }, [image.id, onOpenViewer])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setShowMenu(true)
  }, [])

  const handleMenuAction = useCallback((action: string) => {
    setShowMenu(false)
    switch (action) {
      case 'top': onMoveToTop(image.id); break
      case 'bottom': onMoveToBottom(image.id); break
      case 'reveal': onReveal(image.id); break
      case 'delete': onDelete(image.id); break
      case 'pick': onToggleTopPick(image.id); break
    }
  }, [image.id, onMoveToTop, onMoveToBottom, onReveal, onDelete, onToggleTopPick])

  const imgSrc = toLocalURL(image.path)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`image-card ${isSelected ? 'selected' : ''} ${isTopPick ? 'top-pick' : ''} ${isDragging ? 'dragging' : ''} ${isOverlay ? 'overlay' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      {...attributes}
      {...listeners}
    >
      <div
        className="image-card__thumb"
        style={{ height: thumbnailSize }}
      >
        {imgError ? (
          <div className="image-card__error">
            <span>?</span>
          </div>
        ) : (
          <img
            src={imgSrc}
            alt={image.filename}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setImgError(true)}
          />
        )}

        {/* Selection indicator */}
        <div className="image-card__select-dot" onClick={(e) => { e.stopPropagation(); onSelect(image.id, true) }}>
          <div className={`image-card__dot ${isSelected ? 'active' : ''}`} />
        </div>

        {/* Top Pick star badge */}
        <div
          className={`image-card__pick-badge ${isTopPick ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleTopPick(image.id) }}
          title={isTopPick ? 'Remove from Top Picks (T)' : 'Mark as Top Pick (T)'}
        >
          ★
        </div>
      </div>

      <div className="image-card__info">
        <span className="image-card__filename" title={image.filename}>
          {image.filename}
        </span>
      </div>

      {/* Context menu */}
      {showMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setShowMenu(false)} />
          <div className="context-menu">
            <button onClick={() => handleMenuAction('pick')}>
              {isTopPick ? '★ Remove from Top Picks' : '☆ Mark as Top Pick (T)'}
            </button>
            <div className="context-menu__divider" />
            <button onClick={() => handleMenuAction('top')}>Move to Top ↑</button>
            <button onClick={() => handleMenuAction('bottom')}>Move to Bottom ↓</button>
            <div className="context-menu__divider" />
            <button onClick={() => handleMenuAction('reveal')}>Reveal in Finder</button>
            <div className="context-menu__divider" />
            <button className="destructive" onClick={() => handleMenuAction('delete')}>Move to Trash</button>
          </div>
        </>
      )}
    </div>
  )
})

/** Lightweight overlay card shown while dragging */
export const DragOverlayCard = memo(function DragOverlayCard({
  image,
  thumbnailSize
}: { image: ImageFile; thumbnailSize: number }) {
  return (
    <div
      className="image-card overlay"
      style={{ width: thumbnailSize }}
    >
      <div className="image-card__thumb" style={{ height: thumbnailSize }}>
        <img
          src={toLocalURL(image.path)}
          alt={image.filename}
          draggable={false}
        />
      </div>
      <div className="image-card__info">
        <span className="image-card__filename">{image.filename}</span>
      </div>
    </div>
  )
})
