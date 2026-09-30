import { useEffect, useState } from 'react'
import { storageUrl } from '@/shared/lib/supabase'
import { readCoverConfig, coverPathBelongsToGallery } from '@/shared/gallery/coverImage'
import { getBrandKit } from '@/features/brand-kit/brandKit'
import { uploadCoverImage, deleteCoverObject, CoverUploadError, type CoverUploadPhase } from '../lib/coverUpload'
import type { Gallery, GalleryImage, Toast } from '../types'

export const imgUrl = (path: string) => storageUrl('gallery-images', path)

const COVER_CLEARED = {
  coverEnabled: false,
  coverSource: 'none',
  coverImagePath: null,
  coverImageUrl: null,
  coverImageId: null,
}

// Cover image (Design → Cover + photo menu): pick a gallery photo, upload a
// cover-only file, or remove it. Also the Brand Kit branding reset.
export function useCover(deps: {
  editingGallery: Gallery | null
  galleryImages: GalleryImage[]
  businessId: string | null
  businessSlug: string | null
  updateGallerySettings: (patch: Record<string, unknown>) => Promise<boolean>
  showToast: Toast
}) {
  const { editingGallery, galleryImages, businessId, businessSlug, updateGallerySettings, showToast } = deps
  const [coverMode, setCoverMode] = useState<'gallery' | 'upload'>('gallery')
  const [coverUploading, setCoverUploading] = useState(false)
  const [coverUploadPhase, setCoverUploadPhase] = useState<CoverUploadPhase | null>(null)
  const [coverDragOver, setCoverDragOver] = useState(false)

  // Open the cover editor on the tab matching the current source per gallery.
  useEffect(() => {
    if (!editingGallery) return
    const src = readCoverConfig((editingGallery.delivery_settings ?? {}) as Record<string, unknown>).source
    setCoverMode(src === 'custom_upload' ? 'upload' : 'gallery')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingGallery?.id])

  // Cover-only upload: no images row, no token. Replacing a previous custom
  // upload deletes that object so it isn't orphaned.
  async function handleCoverFile(file: File | null | undefined) {
    if (!file || !editingGallery || !businessSlug) return
    if (coverUploading) return
    const prev = (editingGallery.delivery_settings ?? {}) as Record<string, unknown>
    const prevPath = prev.coverImagePath as string | null | undefined
    const prevSource = readCoverConfig(prev).source
    setCoverUploading(true)
    setCoverUploadPhase('validating')
    try {
      const res = await uploadCoverImage(file, {
        galleryId: editingGallery.id,
        businessSlug,
        onPhase: setCoverUploadPhase,
      })
      const saved = await updateGallerySettings({
        coverEnabled: true,
        coverSource: 'custom_upload',
        coverImagePath: res.path,
        coverImageUrl: res.url,
        coverImageId: null,
      })
      // On failure the settings rolled back to the previous cover (and toasted): keep its file.
      if (!saved) return
      if (prevSource === 'custom_upload' && prevPath && prevPath !== res.path) {
        void deleteCoverObject(prevPath)
      }
      showToast({ kind: 'success', text: 'תמונת השער עודכנה' })
    } catch (e) {
      const reason = e instanceof CoverUploadError ? e.reason : 'upload_failed'
      const msg =
        reason === 'too_large' ? 'הקובץ גדול מדי (עד 40MB)'
        : reason === 'heic' ? 'קובץ HEIC אינו נתמך. המירו ל-JPG'
        : reason === 'unsupported' ? 'סוג קובץ לא נתמך (JPG / PNG / WebP בלבד)'
        : reason === 'empty' ? 'הקובץ ריק'
        : reason === 'decode_failed' ? 'לא ניתן לקרוא את התמונה'
        : 'העלאת השער נכשלה. נסו שוב'
      showToast({ kind: 'error', text: msg })
    } finally {
      setCoverUploading(false)
      setCoverUploadPhase(null)
      setCoverDragOver(false)
    }
  }

  // Deletes the storage object only for a custom upload; a gallery photo used
  // as the cover is left untouched.
  async function handleCoverRemove() {
    if (!editingGallery) return
    const prev = (editingGallery.delivery_settings ?? {}) as Record<string, unknown>
    const cfg = readCoverConfig(prev)
    const cleared = await updateGallerySettings(COVER_CLEARED)
    if (cleared && cfg.source === 'custom_upload' && cfg.path) void deleteCoverObject(cfg.path)
  }

  // Only a currently-loaded photo of this gallery may become the cover (the
  // RPC is owner-checked too); the path check is defense in depth.
  async function selectGalleryCover(img: GalleryImage): Promise<boolean> {
    if (!editingGallery) return false
    if (!galleryImages.some(i => i.id === img.id)) {
      console.warn('[selectGalleryCover] image not in current gallery — refused', img.id)
      return false
    }
    if (!coverPathBelongsToGallery(img.storage_path, editingGallery.id)) {
      console.warn('[selectGalleryCover] cover path outside gallery — refused', img.storage_path)
      return false
    }
    const prevCfg = readCoverConfig((editingGallery.delivery_settings ?? {}) as Record<string, unknown>)
    const ok = await updateGallerySettings({
      coverEnabled: true,
      coverSource: 'gallery_asset',
      coverImagePath: img.storage_path,
      coverImageUrl: imgUrl(img.storage_path),
      coverImageId: img.id,
    })
    if (ok && prevCfg.source === 'custom_upload' && prevCfg.path && prevCfg.path !== img.storage_path) {
      void deleteCoverObject(prevCfg.path)
    }
    return ok
  }

  // Fonts map to the Brand Kit typography; the accent palette is per-gallery,
  // so it resets to the app default. Identity (name / logo) is left alone.
  async function resetGalleryBrandingToBrand() {
    if (!editingGallery || !businessId) return
    const brand = await getBrandKit(businessId)
    const ok = await updateGallerySettings({
      themeColor: null,
      appearance: null,
      headingFont: brand?.typography?.heading_family ?? null,
      bodyFont: brand?.typography?.body_family ?? null,
    })
    if (ok) showToast({ kind: 'success', text: 'העיצוב אופס לברירת מותג' })
  }

  return {
    coverMode, setCoverMode,
    coverUploading, coverUploadPhase,
    coverDragOver, setCoverDragOver,
    handleCoverFile, handleCoverRemove, selectGalleryCover, resetGalleryBrandingToBrand,
    clearCover: () => updateGallerySettings(COVER_CLEARED),
  }
}

export type CoverApi = ReturnType<typeof useCover>
