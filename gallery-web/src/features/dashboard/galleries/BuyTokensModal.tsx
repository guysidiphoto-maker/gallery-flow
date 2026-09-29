import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { startCheckout, TOKEN_PACKAGES } from '../lib/tokenClient'
import { accent, accentLight, bg, border, card, textMuted, textPrimary, textSecondary } from '../styles'
import type { Toast } from '../types'

// Token subscription packages. Only mounted when checkout is live.
export function BuyTokensModal({ tokenBalance, onClose, showToast }: {
  tokenBalance: number
  onClose: () => void
  showToast: Toast
}) {
  const ref = useFocusTrap<HTMLDivElement>(true, onClose)

  async function checkout(planId: (typeof TOKEN_PACKAGES)[number]['planId']) {
    const url = await startCheckout(planId)
    if (url) { window.location.href = url }
    else {
      console.warn('[startCheckout] no url returned', { planId })
      showToast({ kind: 'error', text: 'שגיאה בפתיחת תשלום. נסה שוב.' })
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'overlayIn .2s ease both',
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="buy-tokens-heading"
        onClick={e => e.stopPropagation()}
        style={{
          background: bg, width: '100%', maxWidth: 920,
          borderRadius: 24, padding: 36,
          border: `1px solid ${border}`,
          animation: 'modalIn .3s ease both',
          boxShadow: '0 30px 100px rgba(0,0,0,.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <h2 id="buy-tokens-heading" style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            קנה טוקנים
          </h2>
          <button onClick={onClose} aria-label="סגירה" style={{
            background: 'transparent', border: 'none', color: textMuted, fontSize: 22,
            cursor: 'pointer', lineHeight: 1, padding: 4,
          }}>×</button>
        </div>
        <p style={{ fontSize: 14, color: textSecondary, margin: '0 0 24px', lineHeight: 1.5 }}>
          טוקן אחד = העלאת תמונה אחת. יתרה נוכחית: <strong style={{ color: tokenBalance < 50 ? '#fca5a5' : '#16a274' }}>{tokenBalance.toLocaleString('he-IL')}</strong>
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {TOKEN_PACKAGES.map(pkg => (
            <button
              key={pkg.planId}
              onClick={() => { void checkout(pkg.planId) }}
              style={{
                position: 'relative',
                background: pkg.highlight
                  ? `linear-gradient(135deg, rgba(45,196,121,.12), rgba(61,214,139,.06))`
                  : card,
                border: `1px solid ${pkg.highlight ? 'rgba(45,196,121,.4)' : border}`,
                borderRadius: 18, padding: 24, textAlign: 'right' as const,
                cursor: 'pointer', transition: 'all .2s',
                color: textPrimary, fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 32px rgba(45,196,121,.18)` }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
            >
              {pkg.highlight && (
                <div style={{
                  position: 'absolute', top: -10, right: 16,
                  padding: '4px 12px', borderRadius: 10,
                  background: `linear-gradient(135deg, ${accent}, ${accentLight})`,
                  fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
                }}>
                  {pkg.highlight}
                </div>
              )}
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{pkg.name}</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 4, letterSpacing: '-0.02em' }}>
                {pkg.tokens.toLocaleString('he-IL')}
              </div>
              <div style={{ fontSize: 12, color: textMuted, marginBottom: 12 }}>טוקנים בחודש</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#16a274' }}>
                ${pkg.pricePerMonthIls}
                <span style={{ fontSize: 12, fontWeight: 500, color: textMuted }}> / חודש</span>
              </div>
            </button>
          ))}
        </div>

        <p style={{ fontSize: 11, color: textMuted, margin: '20px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
          חיוב חודשי דרך LemonSqueezy. אפשר לבטל בכל זמן.<br />
          המכסה מתחדשת בתחילת כל חודש (טוקנים שלא נוצלו אינם מצטברים).
        </p>
      </div>
    </div>
  )
}
