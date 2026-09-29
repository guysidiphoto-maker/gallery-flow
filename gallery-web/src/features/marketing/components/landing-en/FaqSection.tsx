import { container, section, sectionTitle } from './classes'
import type { LandingCopy } from './copy'
import { FadeUp } from './FadeUp'
import { FaqItem } from './FaqItem'

export function FaqSection({ tx }: { tx: LandingCopy }) {
  return (
    <section className={section} id="faq">
      <FadeUp className={container}>
        <h2 className={sectionTitle}>{tx.faqTitle}</h2>
        <div className="mx-auto mt-12 max-w-[720px]">
          {tx.faq.map((item, i) => <FaqItem key={i} q={item.q} a={item.a} />)}
        </div>
      </FadeUp>
    </section>
  )
}
