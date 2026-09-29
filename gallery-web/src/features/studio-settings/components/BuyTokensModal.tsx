import { Modal, cn } from '@/shared/ui'
import { startCheckout, TOKEN_PACKAGES, type PlanId } from '@/features/dashboard/lib/tokenClient'

const LOW_BALANCE = 50

async function checkout(planId: PlanId) {
  const url = await startCheckout(planId)
  if (url) window.location.href = url
  else alert('שגיאה בפתיחת תשלום. נסה שוב.')
}

export function BuyTokensModal({ open, onClose, balance }: {
  open: boolean
  onClose: () => void
  balance: number
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      dir="rtl"
      className="max-w-[920px] rounded-xl bg-canvas p-9 shadow-[0_30px_100px_color-mix(in_srgb,var(--color-black)_60%,transparent)]"
    >
      <div className="mb-2 flex items-start justify-between">
        <h2 className="text-[26px] font-bold tracking-[-0.02em]">קנה טוקנים</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגירה"
          className="bg-transparent p-1 text-[22px] leading-none text-muted"
        >×</button>
      </div>
      <p className="mb-6 text-sm leading-normal text-ink-soft">
        טוקן אחד = העלאת תמונה אחת. יתרה נוכחית:{' '}
        <strong className={balance < LOW_BALANCE ? 'text-amber' : 'text-sage'}>
          {balance.toLocaleString('he-IL')}
        </strong>
      </p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {TOKEN_PACKAGES.map(pkg => (
          <button
            key={pkg.planId}
            type="button"
            onClick={() => void checkout(pkg.planId)}
            className={cn(
              'relative rounded-[18px] border p-6 text-right text-ink transition-all duration-200',
              'hover:-translate-y-0.5 hover:shadow-[0_12px_32px_color-mix(in_srgb,var(--color-ink)_8%,transparent)]',
              pkg.highlight ? 'border-sage/45 bg-linear-135 from-sage/14 to-sage/4' : 'border-line bg-surface',
            )}
          >
            {pkg.highlight && (
              <div className="absolute -top-2.5 right-4 rounded-md bg-linear-135 from-ink to-black px-3 py-1 text-[11px] font-bold tracking-[.04em] text-white">
                {pkg.highlight}
              </div>
            )}
            <div className="mb-1.5 text-base font-bold">{pkg.name}</div>
            <div className="mb-1 text-[32px] font-extrabold tracking-[-0.02em]">{pkg.tokens.toLocaleString('he-IL')}</div>
            <div className="mb-3 text-xs text-muted">טוקנים בחודש</div>
            <div className="text-lg font-bold text-sage">
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
    </Modal>
  )
}
