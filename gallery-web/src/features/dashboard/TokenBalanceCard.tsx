import type { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { TOKEN_BILLING_ON } from './lib/billing'
import { cn } from '@/shared/ui'
import { Icon } from '@/shared/ui/Icon'

type OwnerT = ReturnType<typeof useOwnerLocale>['t']

// Sidebar token balance. Clickable (opens the buy modal) only when checkout is live.
export function TokenBalanceCard({ tokenBalance, onBuyTokens, ownerT }: {
  tokenBalance: number
  onBuyTokens: () => void
  ownerT: OwnerT
}) {
  const low = tokenBalance < 50
  return (
    <button
      onClick={TOKEN_BILLING_ON ? onBuyTokens : undefined}
      className={cn(
        'mb-4 rounded-[4px] border border-line bg-surface px-[18px] py-4 text-start text-ink transition-[border-color,background-color] duration-200',
        TOKEN_BILLING_ON ? 'cursor-pointer hover:border-ink' : 'cursor-default',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium text-muted">
        <span>{ownerT('tokens.label')}</span>
        {low && <span className="text-warning">{ownerT('tokens.low')}</span>}
      </div>
      <div className="mb-2.5 text-[26px] leading-none font-medium tracking-[-0.02em] text-ink">
        {tokenBalance.toLocaleString('he-IL')}
      </div>
      {TOKEN_BILLING_ON && (
        <div className="flex items-center gap-1.5 border-t border-line pt-2.5 text-xs font-medium text-ink-soft">
          {ownerT('tokens.buyMore')}
          {/* Points "forward" in the reading direction (left in RTL). */}
          <Icon name="arrow-out" size={13} strokeWidth={1.85} className="ms-auto rtl:-scale-x-100" />
        </div>
      )}
    </button>
  )
}
