import { useState } from 'react'
import { cn } from '@/shared/ui'
import { container, section, sectionTitle } from './classes'
import type { LandingCopy } from './copy'
import { FadeUp } from './FadeUp'
import { PlanCard } from './PlanCard'

/** Monthly/annual toggle + three plans. */
export function PricingSection({ tx }: { tx: LandingCopy }) {
  const [annual, setAnnual] = useState(false)
  return (
    <section className={section} id="pricing">
      <FadeUp className={container}>
        <h2 className={sectionTitle}>{tx.pricingTitle}</h2>
        <div className="mb-12 flex items-center justify-center gap-3 text-[0.95rem] text-white/50">
          <span className={cn(!annual && 'font-semibold text-white')}>{tx.monthly}</span>
          <button
            className={cn(
              'relative h-6 w-11 cursor-pointer rounded-[12px] border border-white/10 p-0 transition-[background] duration-200 ease-[ease]',
              annual ? 'bg-brand' : 'bg-white/12',
            )}
            onClick={() => setAnnual(a => !a)}
            aria-label="Toggle annual"
          >
            <span
              className={cn(
                'absolute top-0.5 right-0.5 size-[18px] rounded-full bg-white transition-transform duration-200 ease-[ease]',
                annual && '[transform:translateX(-20px)]',
              )}
            />
          </button>
          <span className={cn(annual && 'font-semibold text-white')}>
            {tx.annual}{' '}
            <span className="inline-block rounded-[8px] bg-brand/15 px-2 py-0.5 text-[0.75rem] font-semibold text-brand-soft">{tx.save}</span>
          </span>
        </div>
        <div className="grid grid-cols-[repeat(3,1fr)] items-start gap-6 px-0 max-lg:mx-auto max-lg:max-w-[420px] max-lg:grid-cols-[1fr]">
          <PlanCard name={tx.starterName} price={tx.starterPrice} features={tx.starterF} cta={tx.starterCta} />
          <PlanCard
            name={tx.proName} price={annual ? tx.proPriceAnnual : tx.proPrice} per={tx.per}
            features={tx.proF} cta={tx.proCta} cancel={tx.cancel} badge={tx.proBadge}
          />
          <PlanCard
            name={tx.bizName} price={annual ? tx.bizPriceAnnual : tx.bizPrice} per={tx.per}
            features={tx.bizF} cta={tx.bizCta} cancel={tx.cancel}
          />
        </div>
      </FadeUp>
    </section>
  )
}
