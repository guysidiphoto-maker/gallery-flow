// HomepageCTA — the final beat. Motion settles: an opaque cream section that
// covers the fixed 3D canvas, with the strong final call to action and the FAQ.
// Shared by both the 3D and static paths.

import { useState } from 'react'
import { Button, Reveal } from '../ui'
import { color, text, font, space, radius } from '../../theme'

interface Props {
  /** Primary CTA — start / open first gallery (Google sign-in). */
  onStart: () => void
}

const CONTACT = 'mailto:support@pixflow-ai.com'

const FAQ: Array<{ q: string; a: string }> = [
  { q: 'האורחים צריכים להוריד אפליקציה?', a: 'לא. פותחים קישור בדפדפן, גם מהטלפון.' },
  { q: 'זה מתאים לאירועים גדולים?', a: 'כן. Pixflow נבנה בדיוק למקרים שבהם יש הרבה תמונות והרבה אנשים שרוצים למצוא את עצמם.' },
  { q: 'זיהוי הפנים באמת עובד?', a: 'כן. בתנאי צילום טובים, זיהוי הפנים של Pixflow עובד בכ־99% מהמקרים ועוזר לאורחים להגיע מהר לתמונות שבהן הם מופיעים.' },
  { q: 'מה קורה אם מישהו לא מצא את עצמו?', a: 'עדיין אפשר לדפדף בגלריה, לחפש ידנית, או לעבור לפי רגעים מהאירוע. הזיהוי נועד לקצר את הדרך, לא לנעול את החוויה.' },
  { q: 'זה מחליף גלריה רגילה?', a: 'כן, אם הגלריה הרגילה שלכם גורמת לאנשים ללכת לאיבוד בין מאות או אלפי תמונות.' },
  { q: 'למי זה מתאים?', a: 'צלמי אירועים, הפקות, כנסים, חברות וכל מי שמוסר הרבה תמונות להרבה אנשים.' },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: `1px solid ${color.border}` }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          width: '100%', padding: '18px 0', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[4],
          color: color.ink, ...text.body, fontWeight: 600, fontFamily: font.sans, textAlign: 'start',
        }}
      >
        <span>{q}</span>
        <span style={{ color: color.accent, fontSize: 20, lineHeight: 1, transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .25s', flexShrink: 0 }}>+</span>
      </button>
      {open && (
        <p style={{ ...text.body, color: color.inkSoft, margin: `0 0 18px`, maxWidth: 620, lineHeight: 1.62 }}>{a}</p>
      )}
    </div>
  )
}

export function HomepageCTA({ onStart }: Props) {
  return (
    <section
      id="start"
      style={{
        position: 'relative', zIndex: 2,
        background: color.bg, // opaque — covers the fixed canvas
        padding: `${space[9]}px clamp(20px, 6vw, 96px) ${space[8]}px`,
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{
            fontFamily: font.display, fontWeight: 800, color: color.ink, margin: 0,
            fontSize: 'clamp(30px, 4.2vw, 52px)', lineHeight: 1.1, letterSpacing: '-0.025em',
            whiteSpace: 'pre-line',
          }}>
            {'צלמתם אירוע גדול?\nתמסרו אותו כמו שצריך.'}
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <p style={{ ...text.body, fontSize: 18, color: color.inkSoft, margin: `${space[4]}px auto 0`, maxWidth: 600, lineHeight: 1.62 }}>
            תנו לאורחים למצוא את עצמם לבד, וללקוחות לקבל גלריה שמרגישה מסודרת, מקצועית ונוחה מהרגע הראשון.
          </p>
        </Reveal>
        <Reveal delay={160}>
          <div style={{ display: 'flex', gap: space[3], justifyContent: 'center', flexWrap: 'wrap', marginTop: space[6] }}>
            <Button size="lg" onClick={onStart} style={{ padding: '15px 36px', fontSize: 16 }}>פתחו גלריה ראשונה</Button>
            <Button variant="secondary" size="lg" onClick={() => { window.location.href = CONTACT }}>דברו איתנו</Button>
          </div>
        </Reveal>
      </div>

      <div style={{ maxWidth: 660, margin: `${space[9]}px auto 0` }}>
        <Reveal>
          <div style={{ ...text.label, color: color.accent, textAlign: 'center', marginBottom: space[5] }}>שאלות נפוצות</div>
        </Reveal>
        <Reveal delay={80}>
          <div style={{ background: color.surface, borderRadius: radius.lg, border: `1px solid ${color.border}`, padding: `${space[2]}px ${space[5]}px` }}>
            {FAQ.map(item => <FaqItem key={item.q} {...item} />)}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
