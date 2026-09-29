import { cn } from '@/shared/ui'
import { Reveal } from '../ui'
import { StepCard, type Step } from './StepCard'

interface Props {
  title: string
  steps: Step[]
  /** Width + padding of the section. */
  className: string
  /** Grid column min-width class, e.g. `grid-cols-[repeat(auto-fit,minmax(240px,1fr))]`. */
  cols: string
  stagger: number
  cardPad: string
  descLeading?: string
}

/** The #how section: heading plus a responsive grid of step cards. */
export function StepsSection({ title, steps, className, cols, stagger, cardPad, descLeading }: Props) {
  return (
    <section id="how" className={cn('mx-auto', className)}>
      <Reveal>
        <h2 className="mk-h1 mb-8 text-center">{title}</h2>
      </Reveal>
      <div className={cn('grid gap-4 px-0', cols)}>
        {steps.map((s, i) => (
          <StepCard key={s.n} step={s} delay={i * stagger} pad={cardPad} descLeading={descLeading} />
        ))}
      </div>
    </section>
  )
}
