import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { bgSubtle, border, textMuted, textPrimary, textSecondary } from '../styles'

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
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(20,20,19,.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'overlayIn .2s ease both',
      }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="face-confirm-heading"
        onClick={(e) => e.stopPropagation()}
        className="dash-mobile-modal"
        style={{
          background: '#fff', width: 'calc(100vw - 40px)', maxWidth: 460,
          padding: '36px 40px 32px',
          border: `1px solid ${border}`,
          animation: 'modalIn .25s ease both',
        }}>
        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
          color: textMuted, textTransform: 'uppercase', marginBottom: 14,
        }}>
          Heads up
        </div>
        <h3 id="face-confirm-heading" style={{
          fontSize: 22, fontWeight: 500, margin: '0 0 14px',
          color: textPrimary, letterSpacing: '-0.015em', lineHeight: 1.15,
        }}>
          זיהוי פנים — איך זה עובד
        </h3>
        <p style={{
          color: textSecondary, fontSize: 14, lineHeight: 1.65, margin: '0 0 14px',
        }}>
          כל תמונה שתעלה לגלריה זו תאונדקס במנוע זיהוי פנים. אורחים יצלמו סלפי וימצאו את התמונות שלהם תוך שניות.
        </p>
        <p style={{
          color: textSecondary, fontSize: 14, lineHeight: 1.65, margin: '0 0 24px',
        }}>
          <strong style={{ color: textPrimary, fontWeight: 600 }}>עלות:</strong>{' '}
          ללא תוספת טוקנים — נשאר <strong style={{ color: textPrimary }}>1 טוקן לתמונה</strong>. יתרת הטוקנים שלך כרגע: <strong style={{ color: textPrimary }}>{tokenBalance.toLocaleString('he-IL')}</strong>.
        </p>
        <div style={{
          padding: '12px 14px', background: bgSubtle,
          border: `1px solid ${border}`, marginBottom: 24,
          fontSize: 12, color: textSecondary, lineHeight: 1.55,
        }}>
          ההעלאה תהיה איטית מעט יותר כי כל תמונה עוברת אינדוקס. אפשר להפעיל ולהשבית בכל רגע.
        </div>
        <div className="dash-modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent', color: textPrimary,
              border: `1px solid ${border}`,
              borderRadius: 2, padding: '11px 22px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 500,
            }}
          >Cancel</button>
          <button
            onClick={onEnable}
            style={{
              background: textPrimary, color: '#fff',
              border: `1px solid ${textPrimary}`,
              borderRadius: 2, padding: '11px 26px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 500,
              letterSpacing: '0.18em', textTransform: 'uppercase',
            }}
          >Enable</button>
        </div>
      </div>
    </div>
  )
}
