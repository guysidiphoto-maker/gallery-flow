import { cn } from '@/shared/ui'
import { Badge, Button, Card, Detect } from '../ui'

export interface Plan {
  name: string
  price: string
  audience: string
  storage: string
  perks: string[]
  popular: boolean
}

interface Props {
  plan: Plan
  delay: number
  onStart: () => void
}

/** Storage-framed plan card of the photographers page. */
export function PlanCard({ plan: p, delay, onStart }: Props) {
  return (
    <Detect delay={delay}>
      <Card elevated className={cn('flex h-full flex-col gap-3 p-[30px]', p.popular && 'border-sage/40 bg-sage/14')}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="mk-h3 m-0">{p.name}</h3>
          {p.popular && <Badge>הכי פופולרי</Badge>}
        </div>
        <p className="mk-small m-0 text-muted">{p.audience}</p>
        <div className="flex items-baseline gap-1.5">
          <span className="mk-display text-[clamp(34px,5vw,46px)] leading-none">${p.price}</span>
          <span className="mk-small text-muted">/ לחודש</span>
        </div>
        <p className="mk-small m-0 font-semibold text-(--mk-ink-soft)">{p.storage}</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {p.perks.map(perk => (
            <li key={perk} className="mk-small flex gap-2 leading-[1.5] text-(--mk-ink-soft)">
              <span className="shrink-0 font-bold text-sage">✓</span>{perk}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-3">
          <Button size="lg" fullWidth variant={p.popular ? 'primary' : 'secondary'} onClick={onStart}>
            צרו גלריה ראשונה
          </Button>
        </div>
      </Card>
    </Detect>
  )
}
