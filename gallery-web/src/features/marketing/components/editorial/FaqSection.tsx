import { cn } from '@/shared/ui'
import { Reveal } from '../ui'
import { ChevronFaq } from './ChevronFaq'

interface Props {
  faqs: Array<{ q: string; a: string }>
  id?: string
  openHeight?: 200 | 240
  /** Width + padding of the section. */
  className: string
}

/** "שאלות נפוצות" block of the cream pages. */
export function FaqSection({ faqs, id, openHeight, className }: Props) {
  return (
    <section id={id} className={cn('mx-auto', className)}>
      <Reveal>
        <h2 className="mk-h1 mb-6 text-center">שאלות נפוצות</h2>
      </Reveal>
      <Reveal delay={80}>
        <div>{faqs.map(f => <ChevronFaq key={f.q} q={f.q} a={f.a} openHeight={openHeight} />)}</div>
      </Reveal>
    </section>
  )
}
