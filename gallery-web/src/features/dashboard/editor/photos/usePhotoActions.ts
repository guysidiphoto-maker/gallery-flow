import { useEffect, useState } from 'react'
import { deleteImage, deleteImages, updateImage, updateImages } from '@/shared/data/images'
import { updateGallery } from '@/shared/data/galleries'
import { readCoverConfig } from '@/shared/gallery/coverImage'
import { purgeStorageForImages } from '../../lib/purgeStorage'
import { applyServerSortOrder, fetchServerSortOrder, moveItem, persistSortOrder } from '../../lib/reorder'
import { downloadImage } from '../../lib/download'
import { orderedSectionImages, sectionImages, type PhotoSort } from '../../lib/photoOrder'
import { usePhotoReplace } from './usePhotoReplace'
import type { Confirm, GalleryImage, Toast } from '../../types'
import type { EditorSession } from '../useEditorSession'

// Per-photo and bulk (select-mode) operations on the open gallery, plus the
// grid view preferences and the lightbox that persist across tab switches.
export function usePhotoActions(deps: {
  session: EditorSession
  businessSlug: string | null
  updateGallerySettings: (patch: Record<string, unknown>) => Promise<boolean>
  clearCover: () => Promise<boolean>
  fetchGalleries: () => void
  confirm: Confirm
  showToast: Toast
}) {
  const { session, businessSlug, updateGallerySettings, clearCover, fetchGalleries, confirm, showToast } = deps
  const { editingGallery, galleryImages, setGalleryImages, activeSectionId, markDirty, isOpenGallery } = session
  const [selectMode, setSelectMode] = useState(false)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [gridSize, setGridSize] = useState<'regular' | 'large'>('regular')
  const [photoSort, setPhotoSort] = useState<PhotoSort>('order')
  // Lightbox images are snapshotted at open so next/prev stays in that grid.
  const [viewerImages, setViewerImages] = useState<GalleryImage[] | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number>(0)
  const { replacingImageId, replaceInputRef, openReplacePicker, handleReplaceFile } =
    usePhotoReplace({ session, businessSlug, updateGallerySettings, showToast })

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedImageIds(new Set())
  }

  // A selection is per gallery: carried over, a bulk delete would hit the previous gallery's photos.
  const galleryId = editingGallery?.id
  useEffect(() => { exitSelectMode() }, [galleryId])

  // Toasts and logs a failed write; true when there was an error.
  function failed(error: { message: string } | null, logLabel: string, prefix: string): boolean {
    if (!error) return false
    showToast({ kind: 'error', text: prefix + error.message })
    console.warn(logLabel, error)
    return true
  }

  // Local patch of the matching photos after a successful write.
  function patchImages(matches: (id: string) => boolean, patch: Partial<GalleryImage>) {
    setGalleryImages(prev => prev.map(i => matches(i.id) ? { ...i, ...patch } : i))
    markDirty()
  }

  // Keeps galleries.image_count in step after deletes, then refreshes the grid.
  async function syncImageCount(galleryId: string, removed: number) {
    await updateGallery(galleryId, { image_count: Math.max(0, galleryImages.length - removed) })
    fetchGalleries()
  }

  // In select mode a click toggles; emptying the selection leaves select mode.
  function toggleSelected(imageId: string) {
    setSelectedImageIds(prev => {
      const next = new Set(prev)
      if (next.has(imageId)) next.delete(imageId); else next.add(imageId)
      if (next.size === 0) setSelectMode(false)
      return next
    })
  }

  // Only what's visible: sections act as separate galleries, so selecting
  // across them would bulk-delete photos the owner can't see.
  function selectAllImages() {
    setSelectedImageIds(new Set(sectionImages(galleryImages, activeSectionId).map(i => i.id)))
  }

  function openViewer(images: GalleryImage[], imageId: string) {
    const idx = images.findIndex(i => i.id === imageId)
    if (idx >= 0) {
      setViewerImages(images)
      setViewerIndex(idx)
    }
  }

  async function bulkDeleteSelected() {
    if (!editingGallery || selectedImageIds.size === 0) return
    const count = selectedImageIds.size
    if (!(await confirm({
      title: `למחוק ${count} תמונות?`,
      body: 'פעולה זו לא ניתנת לביטול.',
      confirmLabel: 'מחק',
      danger: true,
    }))) return
    const ids = Array.from(selectedImageIds)
    // Snapshot paths before the row delete so storage can still be purged.
    const snap = galleryImages.filter(i => selectedImageIds.has(i.id))
    const { error } = await deleteImages(ids)
    if (failed(error, '[bulkDelete]', 'שגיאה במחיקה: ')) return
    void purgeStorageForImages(snap)
    setGalleryImages(prev => prev.filter(i => !selectedImageIds.has(i.id)))
    markDirty()
    await syncImageCount(editingGallery.id, ids.length)
    exitSelectMode()
  }

  async function bulkToggleTopPick(makeTopPick: boolean) {
    if (!editingGallery || selectedImageIds.size === 0) return
    const ids = Array.from(selectedImageIds)
    const { error } = await updateImages(ids, { is_top_pick: makeTopPick })
    if (failed(error, '[bulkToggleTopPick]', 'שגיאה: ')) return
    patchImages(id => selectedImageIds.has(id), { is_top_pick: makeTopPick })
    exitSelectMode()
  }

  // Scoped to this gallery's rows; `sections` only holds this gallery's sets.
  async function bulkMoveToSection(sectionId: string) {
    if (!editingGallery || selectedImageIds.size === 0) return
    const ids = Array.from(selectedImageIds)
    const { error } = await updateImages(ids, { section_id: sectionId }, editingGallery.id)
    if (failed(error, '[bulkMoveToSection]', 'העברה נכשלה: ')) return
    patchImages(id => selectedImageIds.has(id), { section_id: sectionId })
    exitSelectMode()
    showToast({ kind: 'success', text: `${ids.length} תמונות הועברו` })
  }

  // Sequential with a short gap: browsers drop concurrent programmatic downloads.
  async function bulkDownloadSelected() {
    if (selectedImageIds.size === 0) return
    const snap = galleryImages.filter(i => selectedImageIds.has(i.id))
    for (const img of snap) {
      try {
        await downloadImage(img)
        await new Promise(r => setTimeout(r, 250))
      } catch (e) {
        console.warn('[bulkDownload] failed for', img.id, e)
      }
    }
    showToast({ kind: 'success', text: `הורדת ${snap.length} תמונות החלה` })
  }

  async function toggleSingleTopPick(imageId: string) {
    const img = galleryImages.find(i => i.id === imageId)
    if (!img) return
    const next = !img.is_top_pick
    const { error } = await updateImage(imageId, { is_top_pick: next })
    if (failed(error, '[toggleSingleTopPick]', 'שגיאה: ')) return
    patchImages(id => id === imageId, { is_top_pick: next })
  }

  async function moveImageToSection(imageId: string, sectionId: string | null) {
    const { error } = await updateImage(imageId, { section_id: sectionId })
    if (failed(error, '[moveImageToSection]', 'שגיאה: ')) return
    patchImages(id => id === imageId, { section_id: sectionId })
  }

  async function deleteSingleImage(imageId: string) {
    if (!editingGallery) return
    if (!(await confirm({
      title: 'למחוק את התמונה?',
      body: 'פעולה זו לא ניתנת לביטול.',
      confirmLabel: 'מחק',
      danger: true,
    }))) return
    const { error } = await deleteImage(imageId)
    if (failed(error, '[deleteSingleImage]', 'שגיאה במחיקה: ')) return
    // Deleting the cover photo clears the cover so the viewer never 404s.
    const deleted = galleryImages.find(i => i.id === imageId)
    const coverCfg = readCoverConfig((editingGallery.delivery_settings ?? {}) as Record<string, unknown>)
    if (deleted && coverCfg.source === 'gallery_asset' && coverCfg.path === deleted.storage_path) {
      void clearCover()
    }
    setGalleryImages(prev => prev.filter(i => i.id !== imageId))
    markDirty()
    await syncImageCount(editingGallery.id, 1)
  }

  async function downloadOriginal(imageId: string) {
    const img = galleryImages.find(i => i.id === imageId)
    if (!img) return
    await downloadImage(img)
  }

  async function copyImageFilename(imageId: string) {
    const img = galleryImages.find(i => i.id === imageId)
    if (!img?.filename) return
    try {
      await navigator.clipboard.writeText(img.filename)
      showToast({ kind: 'success', text: 'שם הקובץ הועתק' })
    } catch {
      showToast({ kind: 'error', text: 'ההעתקה נכשלה' })
    }
  }

  // Shared by drag-and-drop and the keyboard Move up/down items so both paths
  // behave identically. Operates on the active section in manual order.
  async function reorderImage(draggedId: string, targetId: string) {
    if (draggedId === targetId) return
    if (!editingGallery) return
    const next = moveItem(orderedSectionImages(galleryImages, activeSectionId), draggedId, targetId)
    if (!next) return
    const idToOrder = new Map<string, number>()
    next.forEach((img, idx) => { idToOrder.set(img.id, idx * 1000) })
    setGalleryImages(prev => prev.map(i =>
      idToOrder.has(i.id) ? { ...i, sort_order: idToOrder.get(i.id)! } : i
    ))
    markDirty()
    const gid = editingGallery.id
    const failedIds = await persistSortOrder('images', next.map(i => i.id))
    if (failedIds.length > 0) {
      console.warn('[reorderImage] failed ids', failedIds)
      const rows = await fetchServerSortOrder('images', gid)
      if (rows && isOpenGallery(gid)) setGalleryImages(prev => applyServerSortOrder(prev, rows))
      showToast({
        kind: 'error',
        text: rows
          ? `סידור ${failedIds.length} תמונות לא נשמר. הוצג הסדר השמור.`
          : `סידור ${failedIds.length} תמונות לא נשמר. רענן את הדף.`,
      })
    }
  }

  async function moveImageStep(imageId: string, direction: 'up' | 'down') {
    const visible = orderedSectionImages(galleryImages, activeSectionId)
    const idx = visible.findIndex(i => i.id === imageId)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= visible.length) return
    await reorderImage(imageId, visible[targetIdx].id)
  }

  return {
    selectMode, setSelectMode, selectedImageIds, toggleSelected, exitSelectMode, selectAllImages,
    gridSize, setGridSize, photoSort, setPhotoSort,
    viewerImages, setViewerImages, viewerIndex, setViewerIndex, openViewer,
    replacingImageId, replaceInputRef, openReplacePicker, handleReplaceFile,
    bulkDeleteSelected, bulkToggleTopPick, bulkMoveToSection, bulkDownloadSelected,
    toggleSingleTopPick, moveImageToSection, deleteSingleImage,
    downloadOriginal, copyImageFilename, reorderImage, moveImageStep,
  }
}

export type PhotoActionsApi = ReturnType<typeof usePhotoActions>
