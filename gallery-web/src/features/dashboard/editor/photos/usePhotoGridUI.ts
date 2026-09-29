import { useCallback, useEffect, useRef, useState } from 'react'
import { useDismiss } from '@/shared/lib/useDismiss'

// Transient photo-grid UI: hover, the per-tile "…" menu, and drag-to-reorder.
export function usePhotoGridUI(deps: { activeSectionId: string | null; selectMode: boolean; galleryId: string | undefined }) {
  const { activeSectionId, selectMode, galleryId } = deps
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null)
  const [imageMenuOpenId, setImageMenuOpenId] = useState<string | null>(null)
  // Flip the menu above its trigger when there isn't room below.
  const [menuOpenUpward, setMenuOpenUpward] = useState(false)
  // Only meaningful when sorting manually; dragOverId is the drop target.
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  // Touch devices have no hover, so tile affordances must show persistently.
  const [coarsePointer, setCoarsePointer] = useState(false)
  // The tile whose menu is open, so focus can return to it on close.
  const photoMenuAnchorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(hover: none), (pointer: coarse)')
    const update = () => setCoarsePointer(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])

  const closePhotoMenu = useCallback(() => {
    // Return focus to the photo only for keyboard dismissal from inside the
    // menu; an outside click keeps focus where the user put it.
    const active = document.activeElement as HTMLElement | null
    const fromKeyboard = !!active?.closest('[role="menu"]')
    setImageMenuOpenId(null)
    if (fromKeyboard) {
      const el = photoMenuAnchorRef.current
      if (el) requestAnimationFrame(() => { try { el.focus({ preventScroll: true }) } catch { /* ignore */ } })
    }
  }, [])

  const photoMenuRef = useDismiss<HTMLDivElement>(imageMenuOpenId !== null, closePhotoMenu)

  // Close the menu when the context shifts out from under it.
  useEffect(() => {
    setImageMenuOpenId(null)
  }, [activeSectionId, selectMode, galleryId])

  // Move focus to the first item when the menu opens (keyboard users).
  useEffect(() => {
    if (imageMenuOpenId === null) return
    const el = photoMenuRef.current
    if (!el) return
    const first = el.querySelector<HTMLButtonElement>('button')
    requestAnimationFrame(() => { try { first?.focus({ preventScroll: true }) } catch { /* ignore */ } })
  }, [imageMenuOpenId, photoMenuRef])

  return {
    hoveredImageId, setHoveredImageId,
    imageMenuOpenId, setImageMenuOpenId,
    menuOpenUpward, setMenuOpenUpward,
    draggedImageId, setDraggedImageId,
    dragOverId, setDragOverId,
    coarsePointer,
    photoMenuAnchorRef, photoMenuRef, closePhotoMenu,
  }
}

export type PhotoGridUI = ReturnType<typeof usePhotoGridUI>
