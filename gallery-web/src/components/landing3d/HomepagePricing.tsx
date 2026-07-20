// HomepagePricing — the pricing beat the homepage was missing. An opaque cream
// section (covers the fixed 3D canvas) that mirrors the /pricing page: three
// subscription tiers, the one-time event gallery, and the free-tier note. CTAs
// route to sign-in (onStart) or the full /pricing page. No live checkout is
// wired here — payment state is owned elsewhere and untouched.
//
// Numbers mirror src/pages/PricingPage.tsx (plans table, migration 075 + the
// $150 one-time, 076-078). Keep the two in sync if pricing changes.

import { Button, Card, Badge, Reveal, Detect } from '../ui'
import { color, text, font, space } from '../../theme'

interface Props {
  onStart: () => void
}

interface Tier {
  id: string
  name: string
  priceIls: number
  tagline: string
  photosPerMonth: string
  storage: string
  features: string[]
  highlight?: boolean
}

const TIERS: Tier[] = [
  {
    id: 'pro', name: 'Solo', priceIls: 39, tagline: 'לצלם העצמאי',
    photosPerMonth: '2,000 תמונות בחודש', storage: '75GB אחסון',
    features: ['זיהוי פנים כלול', 'ללא ווטרמרק', 'סטוריז', 'מיתוג אישי'],
  },
  {
    id: 'business', name: 'Pro', priceIls: 75, tagline: 'לעסק שצומח', highlight: true,
    photosPerMonth: '10,000 תמונות בחודש', storage: '400GB אחסון',
    features: ['כל מה שב-Solo', 'דומיין מותאם אישית', 'גלריות ללא הגבלה', 'תמיכה מועדפת'],
  },
  {
    id: 'agency', name: 'Studio', priceIls: 120, tagline: 'לסטודיו ולצוות',
    photosPerMonth: '30,000 תמונות בחודש', storage: '1.5TB אחסון',
    features: ['כל מה שב-Pro', 'כלי ה-AI לסושיאל', 'ניהול מספר צלמים', 'ליווי אישי'],
  },
]

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color.accent} strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function HomepagePricing({ onStart }: Props) {
  return (
    <section
      id="pricing"
      style={{
        position: 'relative', zIndex: 2,
        background: color.bg, // opaque — covers the fixed canvas
        color: color.ink,     // base near-black so tier names/prices inherit it
        padding: `${space[9]}px clamp(20px, 6vw, 96px) ${space[7]}px`,
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: space[7] }}>
          <Reveal>
            <div style={{ ...text.label, color: color.accent, marginBottom: space[3] }}>תמחור</div>
          </Reveal>
          <Reveal delay={80}>
            <h2 style={{
              fontFamily: font.display, fontWeight: 800, color: color.ink, margin: 0,
              fontSize: 'clamp(28px, 3.8vw, 46px)', lineHeight: 1.1, letterSpacing: '-0.025em',
            }}>
              תמחור פשוט ושקוף
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p style={{ ...text.body, fontSize: 17, color: color.inkSoft, margin: `${space[4]}px auto 0`, maxWidth: 560, lineHeight: 1.6 }}>
              מתחילים חינם עם 100 תמונות. משדרגים כשגדלים. בלי כוכביות, בלי שיחת מכירה.
            </p>
          </Reveal>
        </div>

        {/* Subscription tiers */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[4], justifyContent: 'center', alignItems: 'stretch' }}>
          {TIERS.map((tier, i) => (
            <Detect key={tier.id} delay={i * 90} style={{ display: 'flex', flex: '1 1 300px', maxWidth: 360 }}>
              <Card
                elevated={tier.highlight}
                interactive
                pad={28}
                style={{
                  display: 'flex', flexDirection: 'column', width: '100%',
                  border: tier.highlight ? `1.5px solid ${color.accentBorder}` : `1px solid ${color.border}`,
                }}
              >
                {tier.highlight && (
                  <div style={{ marginBottom: space[2] }}>
                    <Badge tone="accent">הכי פופולרי</Badge>
                  </div>
                )}
                <div style={{ ...text.label, color: color.textMuted }}>{tier.tagline}</div>
                <div style={{ ...text.h2, fontFamily: font.display, marginTop: space[1] }}>{tier.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: `${space[3]}px 0 ${space[2]}px` }}>
                  <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em' }}>${tier.priceIls}</span>
                  <span style={{ ...text.small, color: color.textMuted }}>לחודש</span>
                </div>
                <div style={{ ...text.body, fontWeight: 600 }}>{tier.photosPerMonth}</div>
                <div style={{ ...text.small, color: color.textMuted, marginBottom: space[4] }}>{tier.storage}</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: space[2], flex: 1 }}>
                  {tier.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: space[2], ...text.small, color: color.inkSoft }}>
                      <Check />{f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={tier.highlight ? 'primary' : 'secondary'}
                  fullWidth
                  style={{ marginTop: space[5] }}
                  onClick={onStart}
                >
                  התחילו עם {tier.name}
                </Button>
              </Card>
            </Detect>
          ))}
        </div>

        {/* One-time event gallery */}
        <Reveal>
          <Card pad={32} style={{
            marginTop: space[5], display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            justifyContent: 'space-between', gap: space[4], background: color.surfaceAlt,
          }}>
            <div style={{ maxWidth: 600 }}>
              <Badge tone="neutral">תשלום חד-פעמי</Badge>
              <h3 style={{ ...text.h2, fontFamily: font.display, margin: `${space[2]}px 0` }}>
                רק גלריה אחת? שלמו פעם אחת.
              </h3>
              <p style={{ ...text.body, color: color.inkSoft, margin: 0, lineHeight: 1.6 }}>
                מושלם לאירוע בודד. הזוג מקבל גלריה מלאה עם זיהוי פנים והורדות, אחסון ל-12 חודשים. בלי מנוי מתחדש.
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', color: color.ink }}>$150</div>
              <div style={{ ...text.small, color: color.textMuted, marginBottom: space[3] }}>לגלריה</div>
              <Button size="lg" onClick={onStart}>צרו גלריה</Button>
            </div>
          </Card>
        </Reveal>

        {/* Free tier note + link to the full pricing page */}
        <Reveal>
          <p style={{ ...text.small, textAlign: 'center', color: color.textMuted, margin: `${space[6]}px auto 0` }}>
            כל חשבון חדש מקבל <strong style={{ color: color.ink }}>100 תמונות חינם</strong>. בלי כרטיס אשראי.{' '}
            <a href="/pricing" style={{ color: color.accent, textDecoration: 'none', fontWeight: 600 }}>לתמחור המלא ←</a>
          </p>
        </Reveal>
      </div>
    </section>
  )
}
