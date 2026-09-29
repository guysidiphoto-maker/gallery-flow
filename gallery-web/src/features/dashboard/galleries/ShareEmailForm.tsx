import type { ShareGalleryState } from '../hooks/useShareGallery'
import { cn } from '@/shared/ui'

const fieldLabel = 'mb-1.5 block text-xs font-semibold text-muted'
const field = 'w-full rounded-md border border-line bg-black/3 px-3.5 py-[11px] text-sm text-ink outline-none'

// Recipient / subject / message fields, preview link, cancel + send.
export function ShareEmailForm({ share }: { share: ShareGalleryState }) {
  const { shareEmail, shareSubject, shareMessage, shareSending, previewLoading } = share
  return (
    <>
      <label className="mb-3.5 block">
        <span className={fieldLabel}>
          כתובת מייל של הלקוח
        </span>
        <input
          type="email"
          value={shareEmail}
          onChange={e => share.setShareEmail(e.target.value)}
          placeholder="client@example.com"
          className={cn(field, 'text-left [direction:ltr]')}
        />
      </label>
      <label className="mb-3.5 block">
        <span className={fieldLabel}>
          נושא
        </span>
        <input
          type="text"
          value={shareSubject}
          onChange={e => share.setShareSubject(e.target.value)}
          className={field}
        />
      </label>
      <label className="mb-6 block">
        <span className={fieldLabel}>
          הודעה אישית (אופציונלי)
        </span>
        <textarea
          value={shareMessage}
          onChange={e => share.setShareMessage(e.target.value)}
          rows={3}
          placeholder="תודה רבה על האירוע! תהנו מהתמונות..."
          className={cn(field, 'min-h-20 resize-y')}
        />
      </label>
      <div className="mb-3 flex justify-start">
        <button
          type="button"
          onClick={share.previewShareEmail}
          disabled={shareSending || previewLoading}
          className={cn(
            'border-none bg-transparent p-0 text-[13px] font-semibold text-ink-soft underline underline-offset-4',
            previewLoading ? 'cursor-wait' : 'cursor-pointer',
            shareSending && 'opacity-50',
          )}
        >
          {previewLoading ? 'טוען…' : 'תצוגה מקדימה'}
        </button>
      </div>
      <div className="flex gap-2.5">
        <button
          onClick={() => share.setShareGallery(null)}
          disabled={shareSending}
          className={cn(
            'flex-1 rounded-[12px] border border-line bg-transparent py-3 text-sm font-semibold text-ink-soft',
            shareSending ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          )}
        >
          ביטול
        </button>
        <button
          onClick={share.sendShareEmail}
          disabled={shareSending || !shareEmail}
          className={cn(
            'flex-1 rounded-[12px] border-none py-3 text-sm font-bold text-white transition-all duration-150',
            shareSending || !shareEmail ? 'cursor-not-allowed bg-success/40' : 'cursor-pointer bg-linear-135 from-ink to-black',
          )}
        >
          {shareSending ? 'שולח...' : 'שלח'}
        </button>
      </div>
    </>
  )
}
