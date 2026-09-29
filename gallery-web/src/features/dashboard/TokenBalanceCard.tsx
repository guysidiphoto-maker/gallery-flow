import { TOKEN_BILLING_ON } from './lib/billing'
import { cn } from '@/shared/ui'

// Sidebar token balance. Clickable (opens the buy modal) only when checkout is live.
export function TokenBalanceCard({ tokenBalance, onBuyTokens }: { tokenBalance: number; onBuyTokens: () => void }) {
  const low = tokenBalance < 50
  return (
    <button
      onClick={TOKEN_BILLING_ON ? onBuyTokens : undefined}
      className={cn(
        'mb-4 rounded-[4px] border border-line bg-surface px-[18px] py-4 text-right text-ink transition-[border-color,background-color] duration-200',
        TOKEN_BILLING_ON ? 'cursor-pointer hover:border-ink' : 'cursor-default',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-medium tracking-label text-muted uppercase">
        <span>Tokens</span>
        {low && <span className="tracking-[0.14em] text-warning">Low</span>}
      </div>
      <div className="mb-2.5 text-[26px] leading-none font-medium tracking-[-0.02em] text-ink">
        {tokenBalance.toLocaleString('he-IL')}
      </div>
      {TOKEN_BILLING_ON && (
        <div className="flex items-center gap-1.5 border-t border-line pt-2.5 text-[11px] font-medium tracking-[0.14em] text-ink-soft uppercase">
          Buy more
          <span className="ms-auto">→</span>
        </div>
      )}
    </button>
  )
}
