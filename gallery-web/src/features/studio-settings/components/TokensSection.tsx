import { Button, Panel } from '@/shared/ui'
import { primaryAction } from './settingsStyles'

/** Balance card; the buy CTA only renders when checkout is live (billing flag). */
export function TokensSection({ balance, onBuy }: { balance: number; onBuy?: () => void }) {
  return (
    <Panel eyebrow="טוקנים" className="pb-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-1.5 text-[10px] font-medium tracking-label text-muted uppercase">Balance</div>
          <div className="text-4xl leading-none font-medium tracking-[-0.02em] text-ink">
            {balance.toLocaleString('he-IL')}
          </div>
          <div className="mt-1.5 text-xs text-muted">טוקן אחד = העלאת תמונה אחת</div>
        </div>
        {onBuy && (
          <Button onClick={onBuy} className={`${primaryAction} px-[22px] py-3`}>
            קנו עוד
          </Button>
        )}
      </div>
    </Panel>
  )
}
