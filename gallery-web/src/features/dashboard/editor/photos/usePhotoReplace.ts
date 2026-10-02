import { useRef, useState } from 'react'
import { clearSignedUrlCache } from '@/shared/lib/signedStorage'
import { replacePhoto, ReplacePhotoError } from '../../lib/replacePhoto'
import { imgUrl } from '../useCover'
import type { Toast } from '../../types'
import type { EditorSession } from '../useEditorSession'

// "Replace photo" from the tile menu: a hidden file input plus the in-flight id
// (tile spinner and double-fire guard).
export function usePhotoReplace(deps: {
  session: EditorSession
  businessSlug: string | null
  updateGallerySettings: (patch: Record<string, unknown>) => Promise<boolean>
  showToast: Toast
}) {
  const { session, businessSlug, updateGallerySettings, showToast } = deps
  const { editingGallery, setGalleryImages, markDirty } = session
  const [replacingImageId, setReplacingImageId] = useState<string | null>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<string | null>(null)

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
        onRepointCover: async (newWebPath) => {
          await updateGallerySettings({
            coverImagePath: newWebPath,
            coverImageUrl: imgUrl(newWebPath),
          })
        },
      })
      setGalleryImages(prev => prev.map(i =>
        i.id === imageId
          ? { ...i, storage_path: res.webPath, thumbnail_path: res.thumbPath, original_path: res.newPath, filename: res.filename }
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

  return { replacingImageId, replaceInputRef, openReplacePicker, handleReplaceFile }
}
