import { cn } from '@/shared/ui'
import type { Tier } from '../../lib/pricingTiers'
import { Badge, Button, Card, Detect } from '../ui'
import { CheckIcon } from './CheckIcon'

interface Props {
  tier: Tier
  index: number
  /** Highlight badge copy; `corner` pins it over the top edge (the /pricing look). */
  badge: { label: string; placement: 'inline' | 'corner' }
  unit: string
  ctaLabel: string
  onSelect: () => void
  className?: string
  /** /pricing uses a slightly wider price row with symmetric margins. */
  roomy?: boolean
}

/** One subscription tier card, shared by the homepage pricing beat and /pricing. */
export function TierCard({ tier, index, badge, unit, ctaLabel, onSelect, className, roomy }: Props) {
  const hl = tier.highlight
  return (
    <Detect delay={index * 90} className={cn('flex', className)}>
      <Card
        elevated={hl}
        interactive
        className={cn(
          'flex w-full flex-col p-7',
          badge.placement === 'corner' && 'relative',
          hl && 'border-[1.5px] border-sage/40',
        )}
      >
        {hl && (
          <div className={badge.placement === 'corner' ? 'absolute -top-[11px] start-6' : 'mb-2'}>
            <Badge>{badge.label}</Badge>
          </div>
        )}
        <div className="mk-label text-muted">{tier.tagline}</div>
        <div className="mk-h2 mt-1 font-(family-name:--mk-font-display)">{tier.name}</div>
        <div className={cn('flex items-baseline', roomy ? 'my-3 gap-1.5' : 'mt-3 mb-2 gap-1')}>
          <span className="text-[40px] font-extrabold tracking-[-0.03em]">${tier.priceIls}</span>
          <span className="mk-small text-muted">{unit}</span>
        </div>
        <div className="mk-body font-semibold">{tier.photosPerMonth}</div>
        <div className="mk-small mb-4 text-muted">{tier.storage}</div>
        <ul className="m-0 flex flex-1 list-none flex-col gap-2 p-0">
          {tier.features.map(f => (
            <li key={f} className="mk-small flex items-center gap-2 text-(--mk-ink-soft)">
              <CheckIcon />{f}
            </li>
          ))}
        </ul>
        <Button variant={hl ? 'primary' : 'secondary'} fullWidth className="mt-6" onClick={onSelect}>
          {ctaLabel}
        </Button>
      </Card>
    </Detect>
  )
}
