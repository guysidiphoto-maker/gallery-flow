import { border, textMuted, textPrimary } from '../../styles'
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
    <div role="dialog" aria-modal="true" aria-label="סיכום העלאה" style={{
      position: 'fixed', inset: 0, zIndex: 4000, direction: 'rtl',
      background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#FBFAF8', borderRadius: 16, padding: 24, boxShadow: '0 24px 70px rgba(0,0,0,.35)' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: textPrimary }}>סיכום לפני העלאה</h2>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: textMuted, lineHeight: 1.5 }}>
          חלק מהקבצים כבר קיימים בגלריה. כדי לא ליצור כפילויות, נעלה רק את החדשים.
        </p>
        <UploadReviewRow label="חדשות (יועלו)" n={newFiles.length} tone={textPrimary} />
        <UploadReviewRow label="כבר קיימות (יידולגו)" n={duplicates.length} tone={textMuted} />
        {review.length > 0 && <UploadReviewRow label="שם זהה, קובץ שונה — לבדיקה" n={review.length} tone="#b45309" />}
        {droppedOverLimit > 0 && <UploadReviewRow label={`מעל המגבלה (${MAX_UPLOAD_BATCH})`} n={droppedOverLimit} tone="#dc2626" />}
        {review.length > 0 && (
          <p style={{ margin: '12px 0 0', fontSize: 11.5, color: '#b45309', lineHeight: 1.5 }}>
            קבצים ״לבדיקה״ נושאים שם של תמונה קיימת אך הם קובץ אחר — ייתכן שאלו תמונות שונות. הם לא יידלגו אוטומטית.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          {(newFiles.length > 0 || review.length === 0) && (
            <button
              type="button"
              onClick={() => confirmPendingUpload(false)}
              disabled={newFiles.length === 0}
              style={{
                flex: 1, minWidth: 120, padding: '11px 16px', borderRadius: 10, border: 'none',
                cursor: newFiles.length === 0 ? 'default' : 'pointer', fontFamily: 'inherit',
                fontSize: 13.5, fontWeight: 600, color: '#fff',
                background: newFiles.length === 0 ? '#cfcdc9' : textPrimary,
              }}>
              {newFiles.length > 0 ? `העלה ${newFiles.length} חדשות` : 'אין חדשות להעלאה'}
            </button>
          )}
          {review.length > 0 && (
            <button
              type="button"
              onClick={() => confirmPendingUpload(true)}
              style={{
                flex: 1, minWidth: 120, padding: '11px 16px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${border}`, background: 'transparent', color: textPrimary,
                fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
              }}>
              כלול גם {review.length} לבדיקה
            </button>
          )}
          <button
            type="button"
            onClick={() => setPendingUpload(null)}
            style={{
              padding: '11px 16px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${border}`, background: 'transparent', color: textMuted,
              fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500,
            }}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
