import { useState } from 'react'
import { signInWithGoogle } from '../lib/auth'
import { color, text, space, radius, font, shadow } from '../theme'
import { Button, Card, Badge, Reveal, Detect } from '../components/ui'

/* ═══════════════════════════════════════════════════════════════════════════
   /photographers — dedicated Hebrew landing page for Israeli EVENT PHOTOGRAPHERS
   (wedding / event / bar-bat-mitzvah / corporate / studios).

   Positioning: Pixflow is not "another selfie gallery" — it is a photographer
   DELIVERY platform. מעלים פעם אחת. שולחים קישור אחד. האורחים מוצאים את עצמם לבד.

   Draft for a Vercel Preview. Reuses the editorial cream/sage design system
   (theme tokens + shared UI kit) and real product renders under
   public/assets/pixflow-landing/. No tracking / Pixel / ads. Pricing is a
   PLACEHOLDER pending confirmation (see PRICING section).
   ═══════════════════════════════════════════════════════════════════════════ */

const ASSET = (name: string) => `/assets/pixflow-landing/${name}`

const STEPS = [
  { n: '1', t: 'מעלים את התמונות', d: 'גוררים תיקייה שלמה וסוגרים עניין.', g: 'linear-gradient(150deg,#C8B49E,#A98F76)' },
  { n: '2', t: 'Pixflow מסדר את הגלריה', d: 'גלריה נקייה ומהירה, מוכנה לשיתוף.', g: 'linear-gradient(150deg,#C7A6A6,#A87E7E)' },
  { n: '3', t: 'שולחים קישור אחד', d: 'וואטסאפ, QR או מייל. בלי אפליקציה לאורחים.', g: 'linear-gradient(150deg,#B7A6C7,#8E7EA8)' },
  { n: '4', t: 'האורחים מוצאים את עצמם עם סלפי', d: 'סלפי אחד, וזיהוי הפנים עושה את השאר.', g: 'linear-gradient(150deg,#9FB0A0,#7B8F6E)' },
]

const FAQS = [
  { q: 'האורחים צריכים להוריד אפליקציה?', a: 'לא. פותחים קישור בדפדפן, גם מהטלפון.' },
  { q: 'זה מתאים לאירועים גדולים?', a: 'כן. Pixflow נבנה בדיוק למקרים שבהם יש הרבה תמונות והרבה אנשים שרוצים למצוא את עצמם.' },
  { q: 'מה קורה אם מישהו לא מצא את עצמו?', a: 'עדיין אפשר לדפדף בגלריה. הזיהוי נועד לקצר את הדרך, לא לנעול את החוויה.' },
  { q: 'אפשר להשתמש בזה עם המיתוג שלי?', a: 'כן. המטרה היא שהגלריה תיראה כמו חלק מהמותג של הצלם, לא כמו קישור גנרי.' },
  { q: 'זיהוי הפנים תמיד מושלם?', a: 'לא מבטיחים קסמים. בתנאי צילום טובים Pixflow מגיע עד 99%, אבל איכות הזיהוי תלויה בתאורה, בזוויות ובאיכות התמונות.' },
]

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: `1px solid ${color.border}` }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', padding: '18px 0', background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[3],
        color: color.ink, ...text.body, fontWeight: 600, fontFamily: font.sans, textAlign: 'right',
      }}>
        <span>{q}</span>
        <span style={{ fontSize: 18, color: color.textMuted, transition: 'transform .25s', transform: open ? 'rotate(90deg)' : 'none', marginInlineStart: 10, flexShrink: 0 }}>‹</span>
      </button>
      <div style={{ maxHeight: open ? 240 : 0, overflow: 'hidden', transition: 'max-height .3s ease' }}>
        <p style={{ ...text.small, lineHeight: 1.8, color: color.inkSoft, padding: '0 0 16px' }}>{a}</p>
      </div>
    </div>
  )
}

/* A framed product render — real Pixflow visuals, presented as a premium shot. */
function Shot({ src, alt, eager = false }: { src: string; alt: string; eager?: boolean }) {
  return (
    <div style={{
      borderRadius: radius.xl, overflow: 'hidden', border: `1px solid ${color.border}`,
      boxShadow: shadow.lg, background: color.surface, lineHeight: 0,
    }}>
      <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async"
        style={{ width: '100%', height: 'auto', display: 'block' }} />
    </div>
  )
}

export function PhotographersLanding() {
  const go = () => signInWithGoogle()
  const scrollHow = () => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })

  const eyebrow: React.CSSProperties = {
    ...text.label, color: color.accent, marginBottom: space[3], display: 'inline-block',
  }
  const sectionPad = `${space[8]}px clamp(20px, 5vw, 56px)`

  return (
    <div dir="rtl" style={{
      minHeight: '100vh', background: color.bg, color: color.ink,
      fontFamily: font.sans, WebkitFontSmoothing: 'antialiased', overflowX: 'hidden',
    }}>
      <style>{PAGE_CSS}</style>

      {/* ── Nav ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${space[4]}px clamp(20px, 5vw, 56px)`, maxWidth: 1200, margin: '0 auto',
      }}>
        <a href="/" style={{ ...text.h3, fontFamily: font.display, color: color.ink, textDecoration: 'none' }}>pixflow</a>
        <div style={{ display: 'flex', gap: space[3], alignItems: 'center' }}>
          <a href="#how" style={{ ...text.small, color: color.inkSoft, textDecoration: 'none' }}>איך זה עובד</a>
          <a href="#faq" style={{ ...text.small, color: color.inkSoft, textDecoration: 'none' }}>שאלות נפוצות</a>
          <Button size="sm" onClick={go}>צרו גלריה ראשונה</Button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <header style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: space[7],
        maxWidth: 1160, margin: '0 auto', padding: `${space[7]}px clamp(20px, 5vw, 56px) ${space[8]}px`,
      }}>
        <div style={{ flex: '1 1 440px', maxWidth: 560 }}>
          <Reveal>
            <span style={eyebrow}>לצלמי אירועים</span>
            <h1 style={{ ...text.display, margin: 0 }}>
              הגלריות שלך מעולם<br />לא היו יפות<br />ויעילות כל כך.
            </h1>
          </Reveal>
          <Reveal delay={90}>
            <p style={{ ...text.body, fontSize: 18, color: color.inkSoft, margin: `${space[4]}px 0 ${space[5]}px`, maxWidth: 480 }}>
              Pixflow הופך מסירת תמונות מאירוע לגלריה ממותגת עם זיהוי פנים. פחות הודעות, פחות הסברים, ויותר חוויה ללקוח.
            </p>
          </Reveal>
          <Reveal delay={170}>
            <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
              <Button size="lg" onClick={go}>צרו גלריה ראשונה</Button>
              <Button variant="secondary" size="lg" onClick={scrollHow}>ראו איך זה עובד</Button>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <p style={{ ...text.small, color: color.textMuted, marginTop: space[4], maxWidth: 460, lineHeight: 1.7 }}>
              בלי אפליקציה לאורחים. בלי סיסמאות מסובכות. בלי “איפה התמונות שלי?” בווטסאפ.
            </p>
          </Reveal>
        </div>

        <Reveal delay={120} y={32} style={{ flex: '1 1 380px', maxWidth: 520 }}>
          <Shot src={ASSET('hero-main.webp')} alt="גלריית אירוע ממותגת של Pixflow" eager />
        </Reveal>
      </header>

      {/* ── Pain ── */}
      <section style={{ padding: sectionPad }}>
        <div style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
          <Reveal>
            <h2 style={{ ...text.h1, margin: 0 }}>
              כל אירוע נגמר באותה שאלה:<br />“איפה התמונות שלי?”
            </h2>
          </Reveal>
          <Reveal delay={90}>
            <p style={{ ...text.body, fontSize: 17, color: color.inkSoft, margin: `${space[5]}px auto 0`, maxWidth: 620, lineHeight: 1.8 }}>
              הלקוח קיבל גלריה, אבל האורחים לא באמת יודעים למצוא את עצמם. הם גוללים, מתייאשים, ושולחים הודעות.
              Pixflow נותן להם דרך קצרה וברורה להגיע לרגעים שלהם.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" style={{ maxWidth: 1080, margin: '0 auto', padding: sectionPad }}>
        <Reveal>
          <h2 style={{ ...text.h1, textAlign: 'center', margin: `0 0 ${space[6]}px` }}>איך זה עובד</h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: space[4] }}>
          {STEPS.map((s, i) => (
            <Detect key={s.n} delay={i * 80}>
              <Card interactive pad={26} style={{ display: 'flex', flexDirection: 'column', gap: space[2], height: '100%' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: radius.pill, background: s.g,
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...text.h3, fontWeight: 700, marginBottom: space[1],
                }}>{s.n}</div>
                <h3 style={{ ...text.h3, margin: 0 }}>{s.t}</h3>
                <p style={{ ...text.small, color: color.inkSoft, margin: 0, lineHeight: 1.6 }}>{s.d}</p>
              </Card>
            </Detect>
          ))}
        </div>
      </section>

      {/* ── Face recognition ── */}
      <section style={{ background: color.surfaceAlt }}>
        <div style={{
          maxWidth: 1120, margin: '0 auto', padding: sectionPad,
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[7], justifyContent: 'center',
        }}>
          <div style={{ flex: '1 1 380px', maxWidth: 500 }}>
            <Reveal><Shot src={ASSET('face-recognition.webp')} alt="חיפוש סלפי, זיהוי פנים ב-Pixflow" /></Reveal>
          </div>
          <div style={{ flex: '1 1 380px', maxWidth: 520 }}>
            <Reveal>
              <Badge tone="accent">זיהוי פנים</Badge>
              <h2 style={{ ...text.h1, margin: `${space[3]}px 0 0` }}>סלפי אחד.<br />כל הרגעים שלך.</h2>
            </Reveal>
            <Reveal delay={90}>
              <p style={{ ...text.body, fontSize: 17, color: color.inkSoft, margin: `${space[4]}px 0 0`, maxWidth: 480, lineHeight: 1.8 }}>
                האורח נכנס מהטלפון, מזהה את עצמו, ומגיע לתמונות שבהן הוא מופיע.
                בתנאי צילום טובים, זיהוי הפנים מגיע עד 99%.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Photographer workflow ── */}
      <section style={{
        maxWidth: 1120, margin: '0 auto', padding: sectionPad,
        display: 'flex', flexWrap: 'wrap-reverse', alignItems: 'center', gap: space[7], justifyContent: 'center',
      }}>
        <div style={{ flex: '1 1 380px', maxWidth: 520 }}>
          <Reveal>
            <Badge tone="accent">מסירה ממותגת</Badge>
            <h2 style={{ ...text.h1, margin: `${space[3]}px 0 0` }}>מסירה שנראית כמו<br />חלק מהמותג שלכם.</h2>
          </Reveal>
          <Reveal delay={90}>
            <p style={{ ...text.body, fontSize: 17, color: color.inkSoft, margin: `${space[4]}px 0 0`, maxWidth: 480, lineHeight: 1.8 }}>
              גלריה נקייה, ממותגת ונוחה לפתיחה מכל מכשיר, עם חוויה שמתאימה לצלמים
              שרוצים להיראות מקצועיים גם אחרי שהאירוע נגמר.
            </p>
          </Reveal>
        </div>
        <div style={{ flex: '1 1 380px', maxWidth: 500 }}>
          <Reveal><Shot src={ASSET('dashboard.webp')} alt="ניהול גלריות ממותג ב-Pixflow" /></Reveal>
        </div>
      </section>

      {/* ── Before / After ── */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: sectionPad }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: space[4] }}>
          <Detect>
            <Card pad={30} style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: space[3] }}>
              <span style={{ ...text.label, color: color.textMuted }}>לפני</span>
              <p style={{ ...text.h3, color: color.inkSoft, margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
                תיקיות, לינקים, הודעות, אורחים שמחפשים את עצמם.
              </p>
            </Card>
          </Detect>
          <Detect delay={90}>
            <Card pad={30} style={{
              height: '100%', display: 'flex', flexDirection: 'column', gap: space[3],
              background: color.accentSoft, border: `1px solid ${color.accentBorder}`,
            }}>
              <span style={{ ...text.label, color: color.accent }}>אחרי</span>
              <p style={{ ...text.h3, color: color.ink, margin: 0, lineHeight: 1.5 }}>
                קישור אחד, גלריה אחת, וכל אורח יודע לאן ללכת.
              </p>
            </Card>
          </Detect>
        </div>
      </section>

      {/* ── Pricing preview (PLACEHOLDER — final pricing pending approval) ── */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: `${space[6]}px clamp(20px, 5vw, 56px)` }}>
        <Detect>
          <Card pad={36} style={{
            textAlign: 'center', background: color.surface,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space[3],
          }}>
            <Badge tone="accent">זיהוי פנים כלול בכל מסלול</Badge>
            <h2 style={{ ...text.h1, fontSize: 'clamp(24px,3.5vw,34px)', margin: 0 }}>בחרו מסלול שמתאים לקצב האירועים שלכם</h2>
            <p style={{ ...text.body, color: color.inkSoft, margin: 0, maxWidth: 520, lineHeight: 1.7 }}>
              מסלול לכל היקף עבודה: מאירוע בודד ועד עונת אירועים מלאה.
            </p>
            <div style={{ display: 'flex', gap: space[3], marginTop: space[2], flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button size="lg" onClick={go}>צרו גלריה ראשונה</Button>
            </div>
          </Card>
        </Detect>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ maxWidth: 640, margin: '0 auto', padding: sectionPad }}>
        <Reveal>
          <h2 style={{ ...text.h1, textAlign: 'center', margin: `0 0 ${space[5]}px` }}>שאלות נפוצות</h2>
        </Reveal>
        <Reveal delay={80}>
          <div>{FAQS.map(f => <Faq key={f.q} q={f.q} a={f.a} />)}</div>
        </Reveal>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ textAlign: 'center', padding: `${space[8]}px ${space[5]}px ${space[9]}px` }}>
        <Reveal>
          <h2 style={{ ...text.display, fontSize: 'clamp(30px,5vw,56px)', margin: `0 0 ${space[5]}px` }}>
            האירוע הבא שלכם<br />יכול להימסר אחרת.
          </h2>
          <Button size="lg" onClick={go} style={{ padding: '16px 40px', fontSize: 16 }}>צרו גלריה ראשונה</Button>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: `1px solid ${color.border}`, padding: `${space[5]}px`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space[2],
      }}>
        <div style={{ display: 'flex', gap: space[4] }}>
          <a href="/terms" style={{ ...text.small, color: color.textMuted, textDecoration: 'none' }}>תנאי שימוש</a>
          <a href="/privacy" style={{ ...text.small, color: color.textMuted, textDecoration: 'none' }}>פרטיות</a>
          <a href="mailto:support@pixflow-ai.com" style={{ ...text.small, color: color.textMuted, textDecoration: 'none' }}>צור קשר</a>
        </div>
        <p style={{ ...text.small, color: color.textMuted, margin: 0 }}>Pixflow &copy; 2026</p>
      </footer>
    </div>
  )
}

const PAGE_CSS = `
html{scroll-behavior:smooth}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`
