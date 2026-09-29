import { cn } from '@/shared/ui'
import { btn, container, sectionSub, sectionTitle } from './classes'
import { DOWNLOAD_URL, type LandingCopy } from './copy'
import { FadeUp } from './FadeUp'

export function FinalCtaSection({ tx }: { tx: LandingCopy }) {
  return (
    <section className="relative overflow-hidden pt-[110px] pb-20 text-center max-md:pt-20">
      <div className="pointer-events-none absolute top-1/2 left-1/2 z-0 size-[600px] -translate-1/2 bg-(image:--mk-lp-final-glow)" />
      <FadeUp className={cn(container, 'relative z-1 text-center')}>
        <h2 className={cn(sectionTitle, 'mb-8')}>{tx.finalCta}</h2>
        <p className={sectionSub}>{tx.finalSub}</p>
        <a
          href={DOWNLOAD_URL}
          className={btn({ variant: 'primary', glow: true, className: 'mk-lp-sparkle relative overflow-hidden px-12 py-5 text-[1.2rem]' })}
        >
          {tx.finalCtaBtn}
        </a>
      </FadeUp>
    </section>
  )
}
