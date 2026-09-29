// /pricing — transparent subscription pricing (tiers mirror the `plans` table).
import '../styles/marketing.css'
import { TIERS } from '../lib/pricingTiers'
import { Reveal } from '../components/ui'
import { CreamNav } from '../components/editorial/CreamNav'
import { TierCard } from '../components/editorial/TierCard'
import { ScanHUD } from '../components/ScanHUD'

const toDashboard = () => { window.location.href = '/dashboard' }

export default function PricingPage() {
  return (
    <div dir="rtl" className="mk-root min-h-screen bg-canvas font-(family-name:--mk-font-sans) text-ink antialiased">
      <ScanHUD />
      <CreamNav
        as="header"
        links={[{ href: '/dashboard', label: 'התחברות' }]}
        cta={{ label: 'התחל בחינם', onClick: toDashboard }}
      />

      <section className="mx-auto max-w-[720px] px-6 pt-12 pb-8 text-center">
        <Reveal>
          <h1 className="mk-display m-0">תמחור פשוט ושקוף</h1>
        </Reveal>
        <Reveal delay={90}>
          <p className="mk-body mx-auto mt-4 max-w-[540px] text-[17px] text-(--mk-ink-soft)">
            המכסה מתחדשת בכל חודש. <strong>זיהוי פנים כלול בכל מנוי בתשלום</strong> — הלקוחות מוצאים את עצמם בשניות.
            בלי כוכביות, בלי שיחת מכירה.
          </p>
        </Reveal>
      </section>

      <section className="mx-auto grid max-w-[1080px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-stretch gap-4 px-[clamp(20px,5vw,56px)]">
        {TIERS.map((tier, i) => (
          <TierCard
            key={tier.id}
            tier={tier}
            index={i}
            badge={{ label: 'הכי משתלם', placement: 'corner' }}
            unit="/ חודש"
            ctaLabel={`התחל עם ${tier.name}`}
            onSelect={toDashboard}
            roomy
          />
        ))}
      </section>

      <p className="mk-small px-6 pt-12 pb-16 text-center text-muted">
        רוצה להתנסות? כל חשבון חדש מקבל <strong className="text-ink">100 תמונות חינם</strong>. בלי כרטיס אשראי.
      </p>
    </div>
  )
}
