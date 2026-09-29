import { useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { clearSignedUrlCache } from '@/shared/lib/signedStorage'
import { readCoverConfig } from '@/shared/gallery/coverImage'
import { replacePhoto, ReplacePhotoError } from '../../lib/replacePhoto'
import { purgeStorageForImages } from '../../lib/purgeStorage'
import { moveItem, persistSortOrder } from '../../lib/reorder'
import { downloadImage } from '../../lib/download'
import { orderedSectionImages, sectionImages, type PhotoSort } from '../../lib/photoOrder'
import { imgUrl } from '../useCover'
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
  const { editingGallery, galleryImages, setGalleryImages, activeSectionId, markDirty } = session
  const [selectMode, setSelectMode] = useState(false)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [gridSize, setGridSize] = useState<'regular' | 'large'>('regular')
  const [photoSort, setPhotoSort] = useState<PhotoSort>('order')
  // Lightbox images are snapshotted at open so next/prev stays in that grid.
  const [viewerImages, setViewerImages] = useState<GalleryImage[] | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number>(0)
  // Non-null while a replace is in flight (tile spinner + double-fire guard).
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<string | null>(null)

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedImageIds(new Set())
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
    const { error } = await supabase.from('images').delete().in('id', ids)
    if (error) {
      showToast({ kind: 'error', text: 'שגיאה במחיקה: ' + error.message })
      console.warn('[bulkDelete]', error)
      return
    }
    void purgeStorageForImages(snap)
    setGalleryImages(prev => prev.filter(i => !selectedImageIds.has(i.id)))
    markDirty()
    await supabase.from('galleries')
      .update({ image_count: Math.max(0, galleryImages.length - ids.length) })
      .eq('id', editingGallery.id)
    fetchGalleries()
    exitSelectMode()
  }

  async function bulkToggleTopPick(makeTopPick: boolean) {
    if (!editingGallery || selectedImageIds.size === 0) return
    const ids = Array.from(selectedImageIds)
    const { error } = await supabase.from('images').update({ is_top_pick: makeTopPick }).in('id', ids)
    if (error) {
      showToast({ kind: 'error', text: 'שגיאה: ' + error.message })
      console.warn('[bulkToggleTopPick]', error)
      return
    }
    setGalleryImages(prev => prev.map(i => selectedImageIds.has(i.id) ? { ...i, is_top_pick: makeTopPick } : i))
    markDirty()
    exitSelectMode()
  }

  // Scoped to this gallery's rows; `sections` only holds this gallery's sets.
  async function bulkMoveToSection(sectionId: string) {
    if (!editingGallery || selectedImageIds.size === 0) return
    const ids = Array.from(selectedImageIds)
    const { error } = await supabase.from('images')
      .update({ section_id: sectionId })
      .in('id', ids)
      .eq('gallery_id', editingGallery.id)
    if (error) {
      showToast({ kind: 'error', text: 'העברה נכשלה: ' + error.message })
      console.warn('[bulkMoveToSection]', error)
      return
    }
    setGalleryImages(prev => prev.map(i => selectedImageIds.has(i.id) ? { ...i, section_id: sectionId } : i))
    markDirty()
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
    const { error } = await supabase.from('images').update({ is_top_pick: next }).eq('id', imageId)
    if (error) {
      showToast({ kind: 'error', text: 'שגיאה: ' + error.message })
      console.warn('[toggleSingleTopPick]', error)
      return
    }
    setGalleryImages(prev => prev.map(i => i.id === imageId ? { ...i, is_top_pick: next } : i))
    markDirty()
  }

  async function moveImageToSection(imageId: string, sectionId: string | null) {
    const { error } = await supabase.from('images').update({ section_id: sectionId }).eq('id', imageId)
    if (error) {
      showToast({ kind: 'error', text: 'שגיאה: ' + error.message })
      console.warn('[moveImageToSection]', error)
      return
    }
    setGalleryImages(prev => prev.map(i => i.id === imageId ? { ...i, section_id: sectionId } : i))
    markDirty()
  }

  async function deleteSingleImage(imageId: string) {
    if (!editingGallery) return
    if (!(await confirm({
      title: 'למחוק את התמונה?',
      body: 'פעולה זו לא ניתנת לביטול.',
      confirmLabel: 'מחק',
      danger: true,
    }))) return
    const { error } = await supabase.from('images').delete().eq('id', imageId)
    if (error) {
      showToast({ kind: 'error', text: 'שגיאה במחיקה: ' + error.message })
      console.warn('[deleteSingleImage]', error)
      return
    }
    // Deleting the cover photo clears the cover so the viewer never 404s.
    const deleted = galleryImages.find(i => i.id === imageId)
    const coverCfg = readCoverConfig((editingGallery.delivery_settings ?? {}) as Record<string, unknown>)
    if (deleted && coverCfg.source === 'gallery_asset' && coverCfg.path === deleted.storage_path) {
      void clearCover()
    }
    setGalleryImages(prev => prev.filter(i => i.id !== imageId))
    markDirty()
    await supabase.from('galleries')
      .update({ image_count: Math.max(0, galleryImages.length - 1) })
      .eq('id', editingGallery.id)
    fetchGalleries()
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

  function openReplacePicker(imageId: string) {
    if (replacingImageId) return
    replaceTargetRef.current = imageId
    replaceInputRef.current?.click()
  }

  // Swaps the pixels but keeps the photo's identity (section, order, picks,
  // favourites, cover role). The lib uploads first and deletes the old object
  // last, so any failure leaves the original usable.
  async function handleReplaceFile(file: File) {
    const imageId = replaceTargetRef.current
    replaceTargetRef.current = null
    if (!file || !imageId || !editingGallery || !businessSlug) return
    setReplacingImageId(imageId)
    try {
      const res = await replacePhoto({
        galleryId: editingGallery.id,
        imageId,
        businessSlug,
        file,
        // Re-point a cover to the new pixels before the old object is deleted.
        onRepointCover: async (newPath) => {
          await updateGallerySettings({
            coverImagePath: newPath,
            coverImageUrl: imgUrl(newPath),
          })
        },
      })
      setGalleryImages(prev => prev.map(i =>
        i.id === imageId
          ? { ...i, storage_path: res.newPath, thumbnail_path: res.newPath, original_path: res.newPath, filename: res.filename }
          : i,
      ))
      clearSignedUrlCache()
      markDirty()
      showToast({ kind: 'success', text: 'התמונה הוחלפה' })
    } catch (e) {
      const reason = e instanceof ReplacePhotoError ? e.reason : undefined
      const msg = reason === 'heic' ? 'HEIC אינו נתמך. המירו ל-JPEG'
        : reason === 'too_large' ? 'הקובץ גדול מדי'
        : reason === 'unsupported' ? 'פורמט לא נתמך (JPEG / PNG / WebP בלבד)'
        : 'החלפת התמונה נכשלה. התמונה המקורית נשמרה'
      showToast({ kind: 'error', text: msg })
      console.warn('[handleReplaceFile] replace failed', e)
    } finally {
      setReplacingImageId(null)
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
    const failedIds = await persistSortOrder('images', next.map(i => i.id))
    if (failedIds.length > 0) {
      showToast({ kind: 'error', text: `סידור ${failedIds.length} תמונות לא נשמר. גלריה תרענן.` })
      console.warn('[reorderImage] failed ids', failedIds)
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
