import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { Button, Eyebrow } from '@/shared/ui'

// Explains face recognition before it is switched on. Stops click-through so
// dismissing it returns to the create-gallery form.
export function FaceConfirmDialog({ tokenBalance, onCancel, onEnable }: {
  tokenBalance: number
  onCancel: () => void
  onEnable: () => void
}) {
  const ref = useFocusTrap<HTMLDivElement>(true, onCancel)
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onCancel() }}
      className="fixed inset-0 z-[1100] flex animate-[dash-overlay-in_.2s_ease_both] items-center justify-center bg-ink/55 backdrop-blur-[6px]"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="face-confirm-heading"
        onClick={(e) => e.stopPropagation()}
        className="dash-mobile-modal w-[calc(100vw-40px)] max-w-[460px] animate-[dash-modal-in_.25s_ease_both] border border-line bg-raised px-10 pt-9 pb-8"
      >
        <Eyebrow className="mb-3.5 block font-medium">Heads up</Eyebrow>
        <h3 id="face-confirm-heading" className="mb-3.5 text-[22px] leading-[1.15] font-medium tracking-[-0.015em] text-ink">
          זיהוי פנים — איך זה עובד
        </h3>
        <p className="mb-3.5 text-sm leading-[1.65] text-ink-soft">
          כל תמונה שתעלה לגלריה זו תאונדקס במנוע זיהוי פנים. אורחים יצלמו סלפי וימצאו את התמונות שלהם תוך שניות.
        </p>
        <p className="mb-6 text-sm leading-[1.65] text-ink-soft">
          <strong className="font-semibold text-ink">עלות:</strong>{' '}
          ללא תוספת טוקנים — נשאר <strong className="text-ink">1 טוקן לתמונה</strong>. יתרת הטוקנים שלך כרגע: <strong className="text-ink">{tokenBalance.toLocaleString('he-IL')}</strong>.
        </p>
        <div className="mb-6 border border-line bg-surface px-3.5 py-3 text-xs leading-[1.55] text-ink-soft">
          ההעלאה תהיה איטית מעט יותר כי כל תמונה עוברת אינדוקס. אפשר להפעיל ולהשבית בכל רגע.
        </div>
        <div className="dash-modal-actions flex justify-end gap-2.5">
          <Button variant="ghost" onClick={onCancel} className="px-[22px] py-[11px]">Cancel</Button>
          <Button onClick={onEnable} className="px-[26px] py-[11px]">Enable</Button>
        </div>
      </div>
    </div>
  )
}
