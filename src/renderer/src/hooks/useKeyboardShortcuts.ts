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
      if (e.key === 't' && !meta && !e.shiftKey && selectedIds.size > 0) {
        e.preventDefault()
        toggleTopPickSelected()
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
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    images, selectedIds, topPickIds, viewerImageId,
    openFolder, moveToTop, moveToBottom,
    deleteSelected, undoLastRename, selectAll, deselectAll,
    togglePreviewMode, prepareApplyOrder,
    toggleTopPickSelected, removeTopPickSelected, openStoryModal
  ])
}
