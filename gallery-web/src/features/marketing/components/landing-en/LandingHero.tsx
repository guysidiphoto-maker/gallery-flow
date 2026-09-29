import { AppMockup } from './AppMockup'
import { btn } from './classes'
import { DOWNLOAD_URL, type LandingCopy } from './copy'
import { HeroBackdrop } from './HeroBackdrop'

interface Props {
  tx: LandingCopy
  onSeeDemo: () => void
}

const ctaWidth = 'max-sm:w-full max-sm:max-w-[300px]'

export function LandingHero({ tx, onSeeDemo }: Props) {
  return (
    <section className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-6 pt-[120px] pb-[60px] max-md:min-h-[60vh] max-md:px-5 max-md:pt-[100px] max-md:pb-10">
      <HeroBackdrop />
      <div className="relative z-2 max-w-[740px] animate-[mk-lp-hero-entrance_1s_ease-out] text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-[20px] border border-brand/25 bg-brand/12 px-4 py-1.5 text-[0.85rem] font-semibold text-brand-soft">
          <span className="size-2 animate-[mk-lp-pulse_2s_ease-in-out_infinite] rounded-full bg-brand" />
          {tx.heroBadge}
        </span>
        <h1 className="mb-5 bg-(image:--mk-lp-hero-text) bg-clip-text text-[3.2rem] leading-[1.15] font-extrabold tracking-[-0.03em] text-transparent max-lg:text-[2.6rem] max-md:text-[2rem] max-sm:text-[1.7rem]">
          {tx.heroH1.split(' ').map((word, i) => (
            <span
              key={i}
              className="inline-block animate-[mk-lp-word-in_0.5s_ease_forwards] opacity-0 [transform:translateY(20px)]"
              style={{ animationDelay: `${0.3 + i * 0.08}s` }}
            >
              {word}{' '}
            </span>
          ))}
        </h1>
        <p className="mx-auto mb-9 max-w-[540px] text-[1.2rem] text-white/50 max-md:text-[1rem]">{tx.heroSub}</p>
        <div className="mb-12 flex flex-wrap justify-center gap-4 max-sm:flex-col max-sm:items-center">
          <a href={DOWNLOAD_URL} className={btn({ variant: 'primary', lg: true, glow: true, className: `mk-lp-ring ${ctaWidth}` })}>
            {tx.ctaDownload}
          </a>
          <button className={btn({ variant: 'ghost', lg: true, className: ctaWidth })} onClick={onSeeDemo}>
            {tx.ctaDemo}
          </button>
        </div>
        <p className="mt-4 text-[0.8rem] tracking-[0.02em] text-white/35">{tx.heroNote}</p>
        <div className="mx-auto max-w-[480px] animate-[mk-lp-mockup-in_1.2s_ease-out_0.3s_both] max-sm:max-w-[320px]">
          <AppMockup />
        </div>
      </div>
    </section>
  )
}
