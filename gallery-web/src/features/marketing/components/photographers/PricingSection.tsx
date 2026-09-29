import { Reveal } from '../ui'
import { PlanCard, type Plan } from './PlanCard'
import { SECTION_PAD } from './Shot'

// Framed by total storage (how the market sells and what photographers understand),
// laddered by customer profile. Caps match the plans table (75GB/400GB/1.5TB).
const PLANS: Plan[] = [
  {
    name: 'Solo',
    price: '39',
    audience: 'לצלם עצמאי',
    storage: '75GB אחסון',
    perks: ['זיהוי פנים כלול', 'מיתוג הגלריה בלוגו שלכם', 'שיתוף בקישור אחד'],
    popular: false,
  },
  {
    name: 'Pro',
    price: '75',
    audience: 'לעסק עם אירועים שוטפים',
    storage: '400GB אחסון',
    perks: ['כל מה שב-Solo', 'מיתוג מלא בצבעים שלכם', 'עדיפות בעיבוד התמונות'],
    popular: true,
  },
  {
    name: 'Studio',
    price: '120',
    audience: 'לסוכנות וצוותי צלמים',
    storage: '1.5TB אחסון',
    perks: ['כל מה שב-Pro', 'מתאים לצוות מרובה-צלמים', 'עדיפות בתמיכה'],
    popular: false,
  },
]

export function PricingSection({ onStart }: { onStart: () => void }) {
  return (
    <section id="pricing" className={`mx-auto max-w-[1080px] ${SECTION_PAD}`}>
      <Reveal>
        <div className="mb-8 text-center">
          <span className="mk-label mb-3 inline-block text-sage">תמחור</span>
          <h2 className="mk-h1 m-0">תמחור שגדל עם קצב האירועים שלכם</h2>
          <p className="mk-body mx-auto mt-3 max-w-[520px] text-[17px] leading-[1.7] text-(--mk-ink-soft)">
            מתחילים חינם, ומשדרגים כשהעבודה גדלה. זיהוי פנים כלול בכל המסלולים.
          </p>
        </div>
      </Reveal>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-stretch gap-4 px-0">
        {PLANS.map((p, i) => <PlanCard key={p.name} plan={p} delay={i * 80} onStart={onStart} />)}
      </div>
      <Reveal delay={120}>
        <p className="mk-small mx-auto mt-6 max-w-[560px] text-center leading-[1.7] text-muted">
          מתחילים חינם עם 100 תמונות. משדרגים כשגדלים, בלי כוכביות ובלי שיחת מכירה.
        </p>
      </Reveal>
    </section>
  )
}
