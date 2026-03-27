import React, { memo, useState, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ImageFile, Section } from '../types'
import { toLocalURL } from '../utils/imageUtils'
import { SECTION_COLORS } from './SectionsPanel'

interface ImageCardProps {
  image: ImageFile
  isSelected: boolean
  isTopPick: boolean
  thumbnailSize: number
  /** Explicit width from justified layout (overrides thumbnailSize for width) */
  cardWidth?: number
  /** Explicit height from justified layout (overrides thumbnailSize for height) */
  cardHeight?: number
  /** Called with the image's natural aspect ratio once it loads */
  onAspectRatio?: (id: string, ar: number) => void
  onSelect: (id: string, multi: boolean) => void
  onSelectRange: (id: string) => void
  onOpenViewer: (id: string) => void
  onMoveToTop: (id: string) => void
  onMoveToBottom: (id: string) => void
  onDelete: (id: string) => void
  onReveal: (id: string) => void
  onToggleTopPick: (id: string) => void
  isOverlay?: boolean
  // Sections
  sections?: Section[]
  imageSectionIds?: string[]
  selectedIds?: Set<string>
  onAddToSection?: (imageIds: string[], sectionId: string) => void
  onRemoveFromSection?: (imageId: string, sectionId: string) => void
}

export const ImageCard = memo(function ImageCard({
  image,
  isSelected,
  isTopPick,
  thumbnailSize,
  cardWidth,
  cardHeight,
  onAspectRatio,
  onSelect,
  onSelectRange,
  onOpenViewer,
  onMoveToTop,
  onMoveToBottom,
  onDelete,
  onReveal,
  onToggleTopPick,
  isOverlay = false,
  sections = [],
  imageSectionIds = [],
  selectedIds,
  onAddToSection,
  onRemoveFromSection,
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
  const [showSectionSubmenu, setShowSectionSubmenu] = useState(false)

  const w = cardWidth ?? thumbnailSize
  const h = cardHeight ?? thumbnailSize

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    width: w,
    flexShrink: 0,
    zIndex: isDragging ? 999 : 'auto'
  }

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.shiftKey && !e.metaKey && !e.ctrlKey) {
      onSelectRange(image.id)
    } else {
      onSelect(image.id, e.metaKey || e.ctrlKey)
    }
  }, [image.id, onSelect, onSelectRange])

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
    setShowSectionSubmenu(false)
    switch (action) {
      case 'top': onMoveToTop(image.id); break
      case 'bottom': onMoveToBottom(image.id); break
      case 'reveal': onReveal(image.id); break
      case 'delete': onDelete(image.id); break
      case 'pick': onToggleTopPick(image.id); break
    }
  }, [image.id, onMoveToTop, onMoveToBottom, onReveal, onDelete, onToggleTopPick])

  const handleAddToSection = useCallback((sectionId: string) => {
    setShowMenu(false)
    setShowSectionSubmenu(false)
    if (!onAddToSection) return
    // Add all selected images if this image is in the selection, otherwise just this one
    const ids = (selectedIds?.has(image.id) && selectedIds.size > 1)
      ? [...selectedIds]
      : [image.id]
    onAddToSection(ids, sectionId)
  }, [image.id, selectedIds, onAddToSection])

  const handleRemoveFromSection = useCallback((sectionId: string) => {
    setShowMenu(false)
    onRemoveFromSection?.(image.id, sectionId)
  }, [image.id, onRemoveFromSection])

  const imgSrc = toLocalURL(image.path)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`image-card ${isSelected ? 'selected' : ''} ${isTopPick ? 'top-pick' : ''} ${isDragging ? 'dragging' : ''} ${isOverlay ? 'overlay' : ''}`}
      data-image-id={image.id}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      {...attributes}
      {...listeners}
    >
      <div
        className="image-card__thumb"
        style={{ height: h }}
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
            onLoad={(e) => {
              const el = e.currentTarget
              if (el.naturalWidth && el.naturalHeight && onAspectRatio) {
                onAspectRatio(image.id, el.naturalWidth / el.naturalHeight)
              }
            }}
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

        {/* Section dots — always visible, bottom-left */}
        {imageSectionIds.length > 0 && (
          <div className="image-card__section-dots">
            {imageSectionIds.slice(0, 4).map((sid) => {
              const secIdx = sections.findIndex(s => s.id === sid)
              if (secIdx < 0) return null
              const sec = sections[secIdx]
              const color = SECTION_COLORS[secIdx % SECTION_COLORS.length]
              return (
                <span
                  key={sid}
                  className="image-card__section-dot"
                  style={{ background: color }}
                  title={sec.name}
                />
              )
            })}
          </div>
        )}
      </div>

      <div className="image-card__info">
        <span className="image-card__filename" title={image.filename}>
          {image.filename}
        </span>
      </div>

      {/* Context menu */}
      {showMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => { setShowMenu(false); setShowSectionSubmenu(false) }} />
          <div className="context-menu">
            <button onClick={() => handleMenuAction('pick')}>
              {isTopPick ? '★ Remove from Top Picks' : '☆ Mark as Top Pick (T)'}
            </button>

            {sections.length > 0 && onAddToSection && (
              <>
                <div className="context-menu__divider" />
                <div className="context-menu__submenu-trigger" onMouseEnter={() => setShowSectionSubmenu(true)} onMouseLeave={() => setShowSectionSubmenu(false)}>
                  <span>Add to Section ▶</span>
                  {showSectionSubmenu && (
                    <div className="context-menu__submenu">
                      {sections.map((sec, idx) => {
                        const inSection = imageSectionIds.includes(sec.id)
                        const color = SECTION_COLORS[idx % SECTION_COLORS.length]
                        return (
                          <button
                            key={sec.id}
                            onClick={() => inSection ? handleRemoveFromSection(sec.id) : handleAddToSection(sec.id)}
                            className={inSection ? 'active' : ''}
                          >
                            <span className="context-menu__dot" style={{ background: color }} />
                            {sec.name}
                            {inSection && ' ✓'}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

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
