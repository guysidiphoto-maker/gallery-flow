import { useRef, useState } from 'react'
import { deleteStory, insertStory } from '@/shared/data/stories'
import { removeStorageObjects, uploadStorageObject } from '@/shared/data/storage'
import { trackAction } from '@/shared/lib/sentryContext'
import { readVideoDurationSeconds } from '../../lib/videoDuration'
import { STORY_COLUMNS, type Toast } from '../../types'
import type { EditorSession } from '../useEditorSession'

export const STORY_BUCKET = 'gallery-stories'
const STORY_MAX_BYTES = 100 * 1024 * 1024

// Manual MP4 story upload + delete. Paths follow the desktop renderer layout
// (`{slug}/{galleryId}/story_{style}.mp4`) so existing RLS and RPCs keep working.
export function useStories(deps: {
  session: EditorSession
  businessSlug: string | null
  showToast: Toast
}) {
  const { session, businessSlug, showToast } = deps
  const { editingGallery, stories, setStories, markDirty } = session
  const [storyUploading, setStoryUploading] = useState(false)
  const [storyUploadProgress, setStoryUploadProgress] = useState<{ pct: number; filename: string } | null>(null)
  const [storyMenuOpenId, setStoryMenuOpenId] = useState<string | null>(null)
  const [confirmDeleteStoryId, setConfirmDeleteStoryId] = useState<string | null>(null)
  const storyFileInputRef = useRef<HTMLInputElement>(null)

  function endUpload() {
    setStoryUploading(false)
    setStoryUploadProgress(null)
  }

  async function handleStoryUpload(files: FileList | null) {
    if (!files || files.length === 0 || !editingGallery || !businessSlug) return
    const file = files[0]
    if (files.length > 1) {
      showToast({ kind: 'info', text: `מעלה את הקובץ הראשון בלבד (${file.name}). העלאה מרובה תתווסף עם יצירת הסטוריז האוטומטית.` })
    }
    if (file.type !== 'video/mp4' && !file.name.toLowerCase().endsWith('.mp4')) {
      showToast({ kind: 'error', text: 'יש להעלות קובץ MP4 בלבד.' })
      return
    }
    if (file.size > STORY_MAX_BYTES) {
      showToast({ kind: 'error', text: `הקובץ גדול מדי. המקסימום הוא ${Math.round(STORY_MAX_BYTES / 1024 / 1024)}MB.` })
      return
    }

    trackAction('story', 'generate_request', {
      gallery_id: editingGallery.id,
      file_size: file.size,
      file_type: file.type,
    })

    setStoryUploading(true)
    setStoryUploadProgress({ pct: 0, filename: file.name })

    // Best-effort: the column is nullable and the viewer has a fallback.
    const duration = await readVideoDurationSeconds(file)

    // Unique suffix so two manual uploads don't overwrite each other.
    const stamp = Date.now().toString(36)
    const styleTag = `manual-${stamp}`
    const storagePath = `${businessSlug}/${editingGallery.id}/story_${styleTag}.mp4`

    setStoryUploadProgress({ pct: 30, filename: file.name })
    const { error: uploadErr } = await uploadStorageObject(STORY_BUCKET, storagePath, file, {
      contentType: 'video/mp4', upsert: true, cacheControl: '31536000',
    })
    if (uploadErr) {
      endUpload()
      showToast({ kind: 'error', text: 'שגיאה בהעלאה: ' + uploadErr.message })
      console.warn('[handleStoryUpload]', uploadErr)
      return
    }

    setStoryUploadProgress({ pct: 80, filename: file.name })
    const { data: inserted, error: insertErr } = await insertStory({
      gallery_id: editingGallery.id,
      style: 'manual',
      storage_path: storagePath,
      duration,
    }, STORY_COLUMNS)

    if (insertErr || !inserted) {
      // Remove the orphaned object so retries don't pile up storage.
      await removeStorageObjects(STORY_BUCKET, [storagePath])
      endUpload()
      showToast({ kind: 'error', text: 'שגיאה בשמירת הסטורי: ' + (insertErr?.message ?? 'unknown') })
      console.warn('[story-insert]', insertErr)
      return
    }

    setStories(prev => [...prev, inserted])
    setStoryUploadProgress({ pct: 100, filename: file.name })
    setStoryUploading(false)
    markDirty()
    // Let the 100% bar show briefly before it disappears.
    setTimeout(() => setStoryUploadProgress(null), 600)
    if (storyFileInputRef.current) storyFileInputRef.current.value = ''
  }

  // Optimistic removal with rollback. Storage object first, then the row; the
  // row delete is still attempted if the object remove fails.
  async function handleStoryDelete(storyId: string) {
    const story = stories.find(s => s.id === storyId)
    if (!story) return
    const previous = stories
    setStories(prev => prev.filter(s => s.id !== storyId))
    setStoryMenuOpenId(null)
    setConfirmDeleteStoryId(null)
    markDirty()

    if (story.storage_path) {
      const { error: rmErr } = await removeStorageObjects(STORY_BUCKET, [story.storage_path])
      if (rmErr) console.warn('[story-delete] storage remove failed', rmErr)
    }

    const { error: dbErr } = await deleteStory(storyId)

    if (dbErr) {
      setStories(previous)
      console.warn('[handleStoryDelete]', dbErr)
      showToast({ kind: 'error', text: 'שגיאה במחיקה: ' + dbErr.message })
    }
  }

  return {
    storyUploading, storyUploadProgress, storyFileInputRef,
    storyMenuOpenId, setStoryMenuOpenId,
    confirmDeleteStoryId, setConfirmDeleteStoryId,
    handleStoryUpload, handleStoryDelete,
  }
}

export type StoriesApi = ReturnType<typeof useStories>
