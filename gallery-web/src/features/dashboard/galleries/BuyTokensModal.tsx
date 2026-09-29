import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { startCheckout, TOKEN_PACKAGES } from '../lib/tokenClient'
import { cn } from '@/shared/ui'
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
    <div onClick={onClose} className="z-[2000] fixed inset-0 flex animate-[dash-overlay-in_.2s_ease_both] items-center justify-center bg-black/78 p-5 backdrop-blur-[10px]">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="buy-tokens-heading"
        onClick={e => e.stopPropagation()}
        className="max-w-[920px] rounded-xl p-9 w-full animate-[dash-modal-in_.3s_ease_both] border border-line bg-canvas shadow-[0_30px_100px] shadow-black/60"
      >
        <div className="mb-2 flex items-start justify-between">
          <h2 id="buy-tokens-heading" className="text-[26px] font-bold tracking-[-0.02em]">
            קנה טוקנים
          </h2>
          <button onClick={onClose} aria-label="סגירה" className="cursor-pointer border-none bg-transparent p-1 text-[22px] leading-none text-muted">×</button>
        </div>
        <p className="mb-6 text-sm leading-normal text-ink-soft">
          טוקן אחד = העלאת תמונה אחת. יתרה נוכחית: <strong className={tokenBalance < 50 ? 'text-danger' : 'text-success'}>{tokenBalance.toLocaleString('he-IL')}</strong>
        </p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {TOKEN_PACKAGES.map(pkg => (
            <button
              key={pkg.planId}
              onClick={() => { void checkout(pkg.planId) }}
              className={cn(
                'relative cursor-pointer rounded-[18px] border p-6 text-right text-ink transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-[0_12px_32px] hover:shadow-success/18',
                pkg.highlight ? 'border-success/40 bg-linear-135 from-success/12 to-success/6' : 'border-line bg-surface',
              )}
            >
              {pkg.highlight && (
                <div className="absolute -top-2.5 right-4 rounded-md bg-linear-135 from-ink to-black px-3 py-1 text-[11px] font-bold tracking-[.04em]">
                  {pkg.highlight}
                </div>
              )}
              <div className="mb-1.5 text-base font-bold">{pkg.name}</div>
              <div className="mb-1 text-[32px] font-extrabold tracking-[-0.02em]">
                {pkg.tokens.toLocaleString('he-IL')}
              </div>
              <div className="mb-3 text-xs text-muted">טוקנים בחודש</div>
              <div className="text-lg font-bold text-success">
                ${pkg.pricePerMonthIls}
                <span className="text-xs font-medium text-muted"> / חודש</span>
              </div>
            </button>
          ))}
        </div>

        <p className="mt-5 text-center text-[11px] leading-normal text-muted">
          חיוב חודשי דרך LemonSqueezy. אפשר לבטל בכל זמן.<br />
          המכסה מתחדשת בתחילת כל חודש (טוקנים שלא נוצלו אינם מצטברים).
        </p>
      </div>
    </div>
  )
}
