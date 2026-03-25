import { useEffect } from 'react'
import { useGallery } from '../store/gallery'

export function useKeyboardShortcuts() {
  const {
    images,
    selectedIds,
    openFolder,
    moveToTop,
    moveToBottom,
    deleteSelected,
    undoLastRename,
    selectAll,
    deselectAll,
    selectImage,
    selectRange,
    togglePreviewMode,
    prepareApplyOrder,
    toggleTopPickSelected,
    removeTopPickSelected,
    openStoryModal,
    topPickIds,
    viewerImageId
  } = useGallery()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in inputs
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      // Viewer handles its own navigation shortcuts
      if (viewerImageId !== null) return

      const meta = e.metaKey || e.ctrlKey

      // Cmd+O: Open folder
      if (meta && e.key === 'o') {
        e.preventDefault()
        openFolder()
        return
      }

      // Cmd+Z: Undo last rename
      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoLastRename()
        return
      }

      // Cmd+A: Select all
      if (meta && e.key === 'a') {
        e.preventDefault()
        if (selectedIds.size === images.length) deselectAll()
        else selectAll()
        return
      }

      // Escape: Deselect all
      if (e.key === 'Escape') {
        deselectAll()
        return
      }

      // Cmd+P: Preview mode
      if (meta && e.key === 'p') {
        e.preventDefault()
        togglePreviewMode()
        return
      }

      // Cmd+Enter: Apply order
      if (meta && e.key === 'Enter') {
        e.preventDefault()
        prepareApplyOrder()
        return
      }

      // Delete / Backspace: delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault()
        deleteSelected()
        return
      }

      // Home: Move selected to top
      if (e.key === 'Home' && selectedIds.size === 1) {
        e.preventDefault()
        const [id] = selectedIds
        moveToTop(id)
        return
      }

      // End: Move selected to bottom
      if (e.key === 'End' && selectedIds.size === 1) {
        e.preventDefault()
        const [id] = selectedIds
        moveToBottom(id)
        return
      }

      // T: Add selected image(s) to Top Picks (move to top)
      // Auto-advance selection to the image after the last selected one
      if (e.key === 't' && !meta && !e.shiftKey && selectedIds.size > 0) {
        e.preventDefault()

        // Find the image right after the last selected image in array order
        let nextId: string | null = null
        let lastSelectedIdx = -1
        for (let i = images.length - 1; i >= 0; i--) {
          if (selectedIds.has(images[i].id)) { lastSelectedIdx = i; break }
        }
        if (lastSelectedIdx !== -1 && lastSelectedIdx + 1 < images.length) {
          nextId = images[lastSelectedIdx + 1].id
        }

        const result = toggleTopPickSelected()
        const p = result instanceof Promise ? result : Promise.resolve()
        if (nextId) {
          const id = nextId
          p.then(() => {
            selectImage(id, false)
            requestAnimationFrame(() => {
              document.querySelector(`[data-image-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
            })
          })
        }
        return
      }

      // Shift+T: Remove selected image(s) from Top Picks
      if (e.key === 'T' && !meta && e.shiftKey && selectedIds.size > 0) {
        e.preventDefault()
        removeTopPickSelected()
        return
      }

      // Cmd+S: Open Story modal (when top picks exist)
      if (meta && e.key === 's' && topPickIds.size > 0) {
        e.preventDefault()
        openStoryModal()
        return
      }

      // Arrow keys: navigate between images
      // Right/Left: ±1 (wraps to next/prev row naturally)
      // Down/Up: ±columns (moves one row down/up)
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !meta) {
        if (images.length === 0) return
        if (document.querySelector('.modal-backdrop')) return  // don't interfere with modals

        e.preventDefault()

        // Count grid columns from computed style
        const getCols = (): number => {
          const grid = document.querySelector('.gallery-grid')
          if (!grid) return 1
          const cols = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length
          return Math.max(1, cols)
        }

        // Find first selected image index in array order
        let currentIdx = -1
        for (let i = 0; i < images.length; i++) {
          if (selectedIds.has(images[i].id)) { currentIdx = i; break }
        }

        const scrollTo = (id: string) => {
          requestAnimationFrame(() => {
            document.querySelector(`[data-image-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          })
        }

        if (currentIdx === -1) {
          selectImage(images[0].id, false)
          scrollTo(images[0].id)
          return
        }

        const cols = getCols()
        let newIdx = currentIdx
        if (e.key === 'ArrowRight') newIdx = Math.min(images.length - 1, currentIdx + 1)
        else if (e.key === 'ArrowLeft') newIdx = Math.max(0, currentIdx - 1)
        else if (e.key === 'ArrowDown') newIdx = Math.min(images.length - 1, currentIdx + cols)
        else if (e.key === 'ArrowUp') newIdx = Math.max(0, currentIdx - cols)

        if (newIdx !== currentIdx) {
          if (e.shiftKey) {
            selectRange(images[newIdx].id)
          } else {
            selectImage(images[newIdx].id, false)
          }
          scrollTo(images[newIdx].id)
        }
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    images, selectedIds, topPickIds, viewerImageId,
    openFolder, moveToTop, moveToBottom,
    deleteSelected, undoLastRename, selectAll, deselectAll, selectImage, selectRange,
    togglePreviewMode, prepareApplyOrder,
    toggleTopPickSelected, removeTopPickSelected, openStoryModal
  ])
}
