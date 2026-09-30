import { useState } from 'react'
import type React from 'react'
import { deleteGallery as deleteGalleryRow, duplicateGallery as duplicateGalleryRpc, findGallery } from '@/shared/data/galleries'
import { warmGalleryCache } from '@/shared/lib/warmCache'
import { purgeStorageForGallery } from '../lib/purgeStorage'
import { galleryShareUrl } from '../lib/shareUrl'
import { GALLERY_COLUMNS, type Confirm, type Gallery, type Toast } from '../types'

// Gallery-level actions shared by the grid cards and the editor's More menu.
export function useGalleryActions(deps: {
  businessSlug: string | null
  galleries: Gallery[]
  setGalleries: React.Dispatch<React.SetStateAction<Gallery[]>>
  fetchGalleries: () => Promise<void>
  editingGallery: Gallery | null
  setEditingGallery: (g: Gallery | null) => void
  openGalleryEditor: (g: Gallery) => void
  showToast: Toast
  confirm: Confirm
}) {
  const {
    businessSlug, galleries, setGalleries, fetchGalleries,
    editingGallery, setEditingGallery, openGalleryEditor, showToast, confirm,
  } = deps
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [copiedGalleryId, setCopiedGalleryId] = useState<string | null>(null)

  const shareUrl = (g: { id: string; slug?: string | null }) => galleryShareUrl(businessSlug, g)

  // Sections + images cascade via FK; storage is purged in the background.
  async function deleteGallery(g: Gallery) {
    const photoCountTxt = (g.image_count ?? 0).toLocaleString('he-IL')
    if (!(await confirm({
      title: `למחוק את הגלריה "${g.name}"?`,
      body: (g.image_count ?? 0) > 0
        ? `${photoCountTxt} תמונות יימחקו לצמיתות. לא ניתן לבטל.`
        : 'לא ניתן לבטל.',
      confirmLabel: 'מחק את הגלריה',
      danger: true,
    }))) return
    // Starts listing image paths before the row delete cascades them away;
    // not awaited because huge galleries take minutes to wipe.
    void purgeStorageForGallery(g.id)
    const { error } = await deleteGalleryRow(g.id)
    if (error) {
      showToast({ kind: 'error', text: 'מחיקת הגלריה נכשלה. נסה שוב.' })
      console.warn('[deleteGallery]', error)
      return
    }
    setGalleries(prev => prev.filter(x => x.id !== g.id))
    if (editingGallery?.id === g.id) setEditingGallery(null)
    showToast({ kind: 'success', text: `הגלריה "${g.name}" נמחקה.` })
  }

  // Clones settings + sections (not photos) into a new draft, then opens it.
  async function duplicateGallery(source: Gallery) {
    const proposed = window.prompt(
      'שם הגלריה החדשה',
      `${source.name} (עותק)`,
    )
    if (proposed === null) return
    const trimmed = proposed.trim()
    if (!trimmed) {
      showToast({ kind: 'error', text: 'יש להזין שם לגלריה החדשה' })
      return
    }
    setDuplicatingId(source.id)
    const { data, error } = await duplicateGalleryRpc(source.id, trimmed)
    setDuplicatingId(null)
    if (error) {
      console.error('[duplicate-gallery] rpc failed', error)
      showToast({ kind: 'error', text: 'שכפול הגלריה נכשל. נסו שוב.' })
      return
    }
    const newId = typeof data === 'string' ? data : null
    showToast({ kind: 'success', text: `הגלריה "${trimmed}" נוצרה` })
    await fetchGalleries()
    if (newId) {
      // Re-read so we get the slug + settings the RPC and slug trigger produced.
      const { data: fresh } = await findGallery(newId, GALLERY_COLUMNS)
      if (fresh) openGalleryEditor(fresh as Gallery)
    }
  }

  function copyGalleryLink(galleryId: string, e: React.MouseEvent) {
    e.stopPropagation()
    const g = galleries.find(x => x.id === galleryId)
    const url = g ? shareUrl(g) : `${window.location.origin}/gallery/${galleryId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedGalleryId(galleryId)
      setTimeout(() => setCopiedGalleryId(prev => prev === galleryId ? null : prev), 1800)
    })
    // Warm the edge right as the link is about to be sent.
    void warmGalleryCache(galleryId)
  }

  return { shareUrl, deleteGallery, duplicateGallery, duplicatingId, copyGalleryLink, copiedGalleryId }
}

export type GalleryActions = ReturnType<typeof useGalleryActions>
