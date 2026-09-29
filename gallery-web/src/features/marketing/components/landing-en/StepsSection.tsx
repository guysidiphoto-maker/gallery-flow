import { cn } from '@/shared/ui'
import { AppMockup } from './AppMockup'
import { BrowserMockup } from './BrowserMockup'
import { card, container, liftOnHover, section, sectionTitle } from './classes'
import type { LandingCopy } from './copy'
import { FadeUp } from './FadeUp'
import { MockGrid } from './MockGrid'

const step = cn(card, 'px-6 py-8', liftOnHover)

/** "How it works": folder → curate → publish, each with a mockup. */
export function StepsSection({ tx }: { tx: LandingCopy }) {
  const steps = [
    { num: tx.step1Num, title: tx.step1Title, desc: tx.step1Desc, visual: <AppMockup /> },
    { num: tx.step2Num, title: tx.step2Title, desc: tx.step2Desc, visual: <AppMockup stars={[1, 4]} /> },
    {
      num: tx.step3Num, title: tx.step3Title, desc: tx.step3Desc,
      visual: <BrowserMockup url="pixflow-ai.com/gallery/your-gallery"><MockGrid /></BrowserMockup>,
    },
  ]
  return (
    <section className={section} id="showcase">
      <FadeUp className={container}>
        <h2 className={sectionTitle}>{tx.howTitle}</h2>
        <div className="mt-12 grid grid-cols-[repeat(3,1fr)] gap-6 px-0 max-lg:grid-cols-[1fr] max-lg:gap-5">
          {steps.map((s, i) => (
            <FadeUp key={s.num} className={step} delay={i * 120}>
              <span className="mb-3 block text-[3.5rem] leading-none font-extrabold text-brand/15">{s.num}</span>
              <h3 className="mb-2 text-[1.2rem] font-bold">{s.title}</h3>
              <p className="mb-5 text-[0.95rem] text-white/50">{s.desc}</p>
              {s.visual}
            </FadeUp>
          ))}
        </div>
      </FadeUp>
    </section>
  )
}
