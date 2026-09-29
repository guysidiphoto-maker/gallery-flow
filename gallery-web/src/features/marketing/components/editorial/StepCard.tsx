import { cn } from '@/shared/ui'
import { Card, Detect } from '../ui'

export interface Step {
  n: string
  t: string
  d: string
  /** Background class for the number badge, e.g. `bg-(image:--mk-swatch-tan)`. */
  swatch: string
}

interface Props {
  step: Step
  delay: number
  /** Card padding class. */
  pad: string
  /** Description line-height class (defaults to the small-text 1.5). */
  descLeading?: string
}

/** Numbered "how it works" card with a swatch badge. */
export function StepCard({ step, delay, pad, descLeading }: Props) {
  return (
    <Detect delay={delay}>
      <Card interactive className={cn('flex h-full flex-col gap-2', pad)}>
        <div className={cn('mk-h3 mb-1 flex size-10 items-center justify-center rounded-full font-bold text-white', step.swatch)}>
          {step.n}
        </div>
        <h3 className="mk-h3 m-0">{step.t}</h3>
        <p className={cn('mk-small m-0 text-(--mk-ink-soft)', descLeading)}>{step.d}</p>
      </Card>
    </Detect>
  )
}
