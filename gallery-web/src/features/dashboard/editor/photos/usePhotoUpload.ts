import { useRef, useState } from 'react'
import { captureException } from '@sentry/react'
import { trackAction } from '@/shared/lib/sentryContext'
import { fetchAllGalleryImages } from '@/shared/gallery/fetchAllImages'
import { uploadMany, partitionUploadFiles, MAX_UPLOAD_BATCH, type UploadRejectReason } from '../../lib/uploadPipeline'
import { classifyForUpload, extractExistingKeys, type ExistingImageRef } from '../../lib/dedupeUpload'
import { requestFaceIndex } from '../../lib/faceIndex'
import { TOKEN_BILLING_ON } from '../../lib/billing'
import { IMAGE_COLUMNS, type GalleryImage, type Toast } from '../../types'
import type { EditorSession } from '../useEditorSession'

export interface PendingUpload {
  newFiles: File[]
  duplicates: File[]
  review: File[]
  selectedTotal: number
  droppedOverLimit: number
}

interface UploadMeta { selectedTotal: number; droppedOverLimit: number; skipped: number }

// Photo upload: validation, duplicate review, token check, batched upload, and
// a trustworthy summary toast.
export function usePhotoUpload(deps: {
  session: EditorSession
  businessId: string | null
  businessSlug: string | null
  tokenBalance: number
  fetchTokenBalance: () => void
  openBuyTokens: () => void
  ensureUploadSection: () => Promise<string | null>
  fetchGalleries: () => void
  showToast: Toast
}) {
  const {
    session, businessId, businessSlug, tokenBalance, fetchTokenBalance,
    openBuyTokens, ensureUploadSection, fetchGalleries, showToast,
  } = deps
  const { editingGallery, galleryImages, setGalleryImages, markDirty } = session
  const [uploading, setUploading] = useState(false)
  const [uploadBatch, setUploadBatch] = useState<{ completed: number; total: number; failed: number; current?: string } | null>(null)
  // Shown when a (re)upload contains files already in the gallery.
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileUpload(files: FileList | null) {
    if (!files || !editingGallery || !businessId || !businessSlug) return
    const selectedTotal = files.length

    // Gate bad files before the token check; drag-and-drop bypasses accept=.
    const { valid, rejected, truncated } = partitionUploadFiles(Array.from(files))
    if (rejected.length > 0 || truncated) {
      const msgs: string[] = []
      const has = (r: UploadRejectReason) => rejected.some(x => x.reason === r)
      if (has('heic')) msgs.push('קבצי HEIC לא נתמכים — ייצא כ-JPEG')
      if (has('unsupported')) msgs.push('רק JPEG, PNG או WebP')
      if (has('too_large')) msgs.push('קובץ גדול מ-40MB')
      if (has('empty')) msgs.push('קובץ ריק')
      if (truncated) msgs.push(`עד ${MAX_UPLOAD_BATCH} בכל פעם — הראשונים הועלו`)
      showToast({ kind: 'error', text: `חלק מהקבצים נדחו: ${msgs.join(' · ')}` })
    }
    if (valid.length === 0) return

    const droppedOverLimit = truncated ? selectedTotal - valid.length : 0

    // Re-uploads restore only missing files; same-name-different-content files
    // go to review instead of being silently skipped.
    const cls = classifyForUpload(
      valid,
      editingGallery.id,
      extractExistingKeys(galleryImages as ExistingImageRef[]),
    )
    if (cls.duplicates.length === 0 && cls.review.length === 0) {
      await runUpload(cls.newFiles, { selectedTotal, droppedOverLimit, skipped: 0 })
      return
    }
    setPendingUpload({ ...cls, selectedTotal, droppedOverLimit })
  }

  // Uploads a resolved (post-dedup) file list.
  async function runUpload(filesToUpload: File[], meta: UploadMeta) {
    if (!editingGallery || !businessSlug) return
    if (filesToUpload.length === 0) {
      const parts = [`נבחרו ${meta.selectedTotal}`]
      if (meta.skipped > 0) parts.push(`${meta.skipped} כבר קיימות (דולגו)`)
      if (meta.droppedOverLimit > 0) parts.push(`מעל המגבלה ${meta.droppedOverLimit}`)
      showToast({ kind: 'info', text: `אין קבצים חדשים להעלאה · ${parts.join(' · ')}` })
      return
    }

    if (tokenBalance < filesToUpload.length) {
      const wanted = filesToUpload.length
      const have = tokenBalance
      showToast({ kind: 'error', text: `אין מספיק טוקנים. צריך ${wanted}, יש לך ${have}.` })
      if (TOKEN_BILLING_ON) openBuyTokens()
      return
    }
    const targetSectionId = await ensureUploadSection()
    setUploading(true)
    setUploadBatch({ completed: 0, total: filesToUpload.length, failed: 0 })
    const result = await uploadMany(
      filesToUpload,
      {
        galleryId: editingGallery.id,
        businessSlug,
        sectionId: targetSectionId,
        sortOrder: galleryImages.length,
      },
      (b) => setUploadBatch(b),
      8,
    )
    if (result.failed.length > 0) {
      const insufficient = result.failed.find(f => f.error.includes('insufficient_tokens'))
      if (insufficient) {
        showToast({ kind: 'error', text: 'הטוקנים נגמרו באמצע ההעלאה.' })
        if (TOKEN_BILLING_ON) openBuyTokens()
      } else {
        showToast({ kind: 'error', text: `${result.failed.length} תמונות נכשלו. השאר עלו בהצלחה.` })
        // Only genuinely unexpected failures go to Sentry (no PII).
        const unexpected = result.failed.filter(
          f => !['heic', 'unsupported', 'empty', 'too_large', 'insufficient_tokens'].some(k => f.error.includes(k)),
        )
        if (unexpected.length > 0) {
          captureException(new Error('photo_upload_failed'), {
            tags: { area: 'upload' },
            extra: {
              gallery_id: editingGallery.id,
              failed_count: unexpected.length,
              total: filesToUpload.length,
              sample_errors: unexpected.slice(0, 5).map(f => f.error),
            },
          })
        }
      }
    }
    // Paginated refresh so counts stay right past 1000 images.
    fetchTokenBalance()
    const refreshed = await fetchAllGalleryImages<GalleryImage>(editingGallery.id, IMAGE_COLUMNS).catch(() => null)
    if (refreshed) setGalleryImages(refreshed)
    setUploading(false)
    setUploadBatch(null)
    if (result.ok.length > 0) markDirty()

    // Never report "done" while files were dropped / failed / skipped.
    {
      const okN = result.ok.length
      const failN = result.failed.length
      const droppedN = meta.droppedOverLimit
      const skipN = meta.skipped
      if (failN === 0 && droppedN === 0 && skipN === 0) {
        showToast({ kind: 'success', text: `הועלו ${okN} תמונות בהצלחה` })
      } else {
        const parts = [`נבחרו ${meta.selectedTotal}`, `הועלו ${okN}`]
        if (skipN > 0) parts.push(`${skipN} כבר קיימות (דולגו)`)
        if (failN > 0) parts.push(`נכשלו ${failN}`)
        if (droppedN > 0) parts.push(`מעל המגבלה ${droppedN} (העלו שוב)`)
        showToast({ kind: failN > 0 || droppedN > 0 ? 'error' : 'info', text: parts.join(' · ') })
      }
    }

    trackAction('upload', 'photo', {
      count: filesToUpload.length,
      ok: result.ok.length,
      failed: result.failed.length,
      gallery_id: editingGallery.id,
    })

    // Photos added after publish must be indexed too, or FaceFinder misses them.
    const needsReindex =
      editingGallery.status === 'live' &&
      (editingGallery.delivery_settings as { faceIndexEnabled?: boolean } | null)?.faceIndexEnabled === true
    if (needsReindex && result.ok.length > 0) requestFaceIndex(editingGallery.id)

    fetchGalleries()
  }

  // Resolves the duplicate-review dialog: upload new files, optionally plus
  // the same-name-different-content ones.
  function confirmPendingUpload(includeReview: boolean) {
    if (!pendingUpload) return
    const { newFiles, duplicates, review, selectedTotal, droppedOverLimit } = pendingUpload
    const filesToUpload = includeReview ? [...newFiles, ...review] : newFiles
    const skipped = includeReview ? duplicates.length : duplicates.length + review.length
    setPendingUpload(null)
    void runUpload(filesToUpload, { selectedTotal, droppedOverLimit, skipped })
  }

  return {
    uploading, uploadBatch, fileInputRef,
    pendingUpload, setPendingUpload, confirmPendingUpload,
    handleFileUpload,
  }
}

export type PhotoUploadApi = ReturnType<typeof usePhotoUpload>
