import { cn } from '@/shared/ui'
import { MAX_UPLOAD_BATCH } from '../../lib/uploadPipeline'
import { useEditor } from '../EditorContext'
import { UploadReviewRow } from './UploadReviewRow'

// Pre-upload duplicate summary: exact duplicates are skipped; same-name but
// different files are surfaced for review, never auto-skipped.
export function UploadReviewModal() {
  const { upload } = useEditor()
  const { pendingUpload, confirmPendingUpload, setPendingUpload } = upload
  if (!pendingUpload) return null
  const { newFiles, duplicates, review, droppedOverLimit } = pendingUpload

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="סיכום העלאה"
      className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 p-5 backdrop-blur-[4px] [direction:rtl]"
    >
      <div className="w-full max-w-[440px] rounded-lg bg-surface p-6 shadow-[0_24px_70px_color-mix(in_srgb,var(--color-black)_35%,transparent)]">
        <h2 className="mt-0 mb-1 text-[18px] font-bold text-ink">סיכום לפני העלאה</h2>
        <p className="mt-0 mb-4 text-[12.5px] leading-normal text-muted">
          חלק מהקבצים כבר קיימים בגלריה. כדי לא ליצור כפילויות, נעלה רק את החדשים.
        </p>
        <UploadReviewRow label="חדשות (יועלו)" n={newFiles.length} toneClass="text-ink" />
        <UploadReviewRow label="כבר קיימות (יידולגו)" n={duplicates.length} toneClass="text-muted" />
        {review.length > 0 && <UploadReviewRow label="שם זהה, קובץ שונה — לבדיקה" n={review.length} toneClass="text-pending-ink" />}
        {droppedOverLimit > 0 && <UploadReviewRow label={`מעל המגבלה (${MAX_UPLOAD_BATCH})`} n={droppedOverLimit} toneClass="text-danger-strong" />}
        {review.length > 0 && (
          <p className="mt-3 mb-0 text-[11.5px] leading-normal text-pending-ink">
            קבצים ״לבדיקה״ נושאים שם של תמונה קיימת אך הם קובץ אחר — ייתכן שאלו תמונות שונות. הם לא יידלגו אוטומטית.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {(newFiles.length > 0 || review.length === 0) && (
            <button
              type="button"
              onClick={() => confirmPendingUpload(false)}
              disabled={newFiles.length === 0}
              className={cn(
                'min-w-[120px] flex-1 rounded-md px-4 py-[11px] text-[13.5px] font-semibold text-white',
                newFiles.length === 0 ? 'cursor-default bg-line' : 'cursor-pointer bg-ink',
              )}>
              {newFiles.length > 0 ? `העלה ${newFiles.length} חדשות` : 'אין חדשות להעלאה'}
            </button>
          )}
          {review.length > 0 && (
            <button
              type="button"
              onClick={() => confirmPendingUpload(true)}
              className="min-w-[120px] flex-1 cursor-pointer rounded-md border border-line bg-transparent px-4 py-[11px] text-[13.5px] font-semibold text-ink">
              כלול גם {review.length} לבדיקה
            </button>
          )}
          <button
            type="button"
            onClick={() => setPendingUpload(null)}
            className="cursor-pointer rounded-md border border-line bg-transparent px-4 py-[11px] text-[13.5px] font-medium text-muted">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
