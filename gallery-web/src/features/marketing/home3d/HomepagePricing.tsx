// Homepage pricing beat: an opaque cream section (covers the fixed 3D canvas) that
// mirrors /pricing. CTAs go to sign-in; no checkout is wired here.

import { Reveal } from '../components/ui'
import { TierCard } from '../components/editorial/TierCard'
import { TIERS } from '../lib/pricingTiers'

export function HomepagePricing({ onStart }: { onStart: () => void }) {
  return (
    <section id="pricing" className="relative z-[2] bg-canvas px-[clamp(20px,6vw,96px)] pt-24 pb-12 text-ink">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-12 text-center">
          <Reveal>
            <div className="mk-label mb-3 text-sage">תמחור</div>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="m-0 font-(family-name:--mk-font-display) text-[clamp(28px,3.8vw,46px)] leading-[1.1] font-extrabold tracking-[-0.025em] text-ink">
              תמחור פשוט ושקוף
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mk-body mx-auto mt-4 max-w-[560px] text-[17px] text-(--mk-ink-soft)">
              מתחילים חינם עם 100 תמונות. משדרגים כשגדלים. בלי כוכביות, בלי שיחת מכירה.
            </p>
          </Reveal>
        </div>

        <div className="flex flex-wrap items-stretch justify-center gap-4">
          {TIERS.map((tier, i) => (
            <TierCard
              key={tier.id}
              tier={tier}
              index={i}
              badge={{ label: 'הכי פופולרי', placement: 'inline' }}
              unit="לחודש"
              ctaLabel={`התחילו עם ${tier.name}`}
              onSelect={onStart}
              className="max-w-[360px] flex-[1_1_300px]"
            />
          ))}
        </div>

        <Reveal>
          <p className="mk-small mx-auto mt-8 text-center text-muted">
            כל חשבון חדש מקבל <strong className="text-ink">100 תמונות חינם</strong>. בלי כרטיס אשראי.{' '}
            <a href="/pricing" className="font-semibold text-sage no-underline">לתמחור המלא ←</a>
          </p>
        </Reveal>
      </div>
    </section>
  )
}
