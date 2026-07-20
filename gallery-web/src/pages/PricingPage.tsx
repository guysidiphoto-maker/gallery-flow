// PricingPage (/pricing) — first surface built on the Editorial design system.
// Transparent pricing the marketing site previously lacked. Prices mirror the
// `plans` table (migration 075) + the $150 one-time gallery (076-078).

import { color, text, space, radius, font } from '../theme'
import { Button, Card, Badge, Reveal, Detect } from '../components/ui'
import { ScanHUD } from '../components/ScanHUD'

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
    id: 'pro', name: 'Solo', priceIls: 39,
    tagline: 'לצלם העצמאי',
    photosPerMonth: '2,000 תמונות בחודש', storage: '75GB אחסון',
    features: ['זיהוי פנים כלול', 'ללא ווטרמרק', 'סטוריז', 'מיתוג אישי'],
  },
  {
    id: 'business', name: 'Pro', priceIls: 75,
    tagline: 'לעסק שצומח', highlight: true,
    photosPerMonth: '10,000 תמונות בחודש', storage: '400GB אחסון',
    features: ['כל מה שב-Solo', 'דומיין מותאם אישית', 'גלריות ללא הגבלה', 'תמיכה מועדפת'],
  },
  {
    id: 'agency', name: 'Studio', priceIls: 120,
    tagline: 'לסטודיו ולצוות',
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

export default function PricingPage() {
  return (
    <div dir="rtl" style={{
      minHeight: '100vh', background: color.bg, color: color.ink,
      fontFamily: font.sans, WebkitFontSmoothing: 'antialiased',
    }}>
      <ScanHUD />
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${space[4]}px clamp(20px, 5vw, 56px)`, maxWidth: 1200, margin: '0 auto',
      }}>
        <a href="/" style={{ ...text.h3, fontFamily: font.display, color: color.ink, textDecoration: 'none' }}>
          pixflow
        </a>
        <nav style={{ display: 'flex', gap: space[3], alignItems: 'center' }}>
          <a href="/dashboard" style={{ ...text.small, color: color.inkSoft, textDecoration: 'none' }}>התחברות</a>
          <Button size="sm" onClick={() => { window.location.href = '/dashboard' }}>התחל בחינם</Button>
        </nav>
      </header>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: `${space[7]}px ${space[5]}px ${space[6]}px`, maxWidth: 720, margin: '0 auto' }}>
        <Reveal>
          <h1 style={{ ...text.display, margin: 0 }}>תמחור פשוט ושקוף</h1>
        </Reveal>
        <Reveal delay={90}>
          <p style={{ ...text.body, color: color.inkSoft, fontSize: 17, margin: `${space[4]}px auto 0`, maxWidth: 540 }}>
            המכסה מתחדשת בכל חודש. <strong>זיהוי פנים כלול בכל מנוי בתשלום</strong> — הלקוחות מוצאים את עצמם בשניות.
            בלי כוכביות, בלי שיחת מכירה.
          </p>
        </Reveal>
      </section>

      {/* Subscription tiers */}
      <section style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: space[4],
        maxWidth: 1080, margin: '0 auto', padding: `0 clamp(20px, 5vw, 56px)`, alignItems: 'stretch',
      }}>
        {TIERS.map((tier, i) => (
          <Detect key={tier.id} delay={i * 90} style={{ display: 'flex' }}>
          <Card elevated={tier.highlight} interactive pad={28}
            style={{
              display: 'flex', flexDirection: 'column', position: 'relative', width: '100%',
              border: tier.highlight ? `1.5px solid ${color.accentBorder}` : `1px solid ${color.border}`,
            }}>
            {tier.highlight && (
              <div style={{ position: 'absolute', top: -11, insetInlineStart: 24 }}>
                <Badge tone="accent">הכי משתלם</Badge>
              </div>
            )}
            <div style={{ ...text.label, color: color.textMuted }}>{tier.tagline}</div>
            <div style={{ ...text.h2, fontFamily: font.display, marginTop: space[1] }}>{tier.name}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: `${space[3]}px 0` }}>
              <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em' }}>${tier.priceIls}</span>
              <span style={{ ...text.small, color: color.textMuted }}>/ חודש</span>
            </div>
            <div style={{ ...text.body, fontWeight: 600 }}>{tier.photosPerMonth}</div>
            <div style={{ ...text.small, color: color.textMuted, marginBottom: space[4] }}>{tier.storage}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: space[2], flex: 1 }}>
              {tier.features.map(f => (
                <li key={f} style={{ ...text.small, display: 'flex', alignItems: 'center', gap: space[2], color: color.inkSoft }}>
                  <Check /> {f}
                </li>
              ))}
            </ul>
            <Button variant={tier.highlight ? 'primary' : 'secondary'} fullWidth
              style={{ marginTop: space[5] }}
              onClick={() => { window.location.href = '/dashboard' }}>
              התחל עם {tier.name}
            </Button>
          </Card>
          </Detect>
        ))}
      </section>

      {/* One-time gallery */}
      <section style={{ maxWidth: 1080, margin: `${space[7]}px auto 0`, padding: `0 clamp(20px, 5vw, 56px)` }}>
        <Reveal>
        <Card pad={32} style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
          gap: space[4], background: color.surfaceAlt,
        }}>
          <div style={{ maxWidth: 560 }}>
            <Badge tone="neutral">תשלום חד-פעמי</Badge>
            <h2 style={{ ...text.h2, fontFamily: font.display, margin: `${space[2]}px 0 ${space[2]}px` }}>
              רק גלריה אחת? שלם פעם אחת.
            </h2>
            <p style={{ ...text.body, color: color.inkSoft, margin: 0 }}>
              מושלם לאירוע בודד — הזוג מקבל גלריה מלאה עם זיהוי פנים והורדות, אחסון ל-12 חודש. בלי מנוי מתחדש.
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em' }}>$150</div>
            <div style={{ ...text.small, color: color.textMuted, marginBottom: space[3] }}>לגלריה</div>
            <Button size="lg" onClick={() => { window.location.href = '/dashboard' }}>צור גלריה</Button>
          </div>
        </Card>
        </Reveal>
      </section>

      {/* Free tier note */}
      <p style={{ ...text.small, textAlign: 'center', color: color.textMuted, padding: `${space[6]}px ${space[5]}px ${space[8]}px` }}>
        רוצה להתנסות? כל חשבון חדש מקבל <strong style={{ color: color.ink }}>100 תמונות חינם</strong>. בלי כרטיס אשראי.
      </p>
    </div>
  )
}
