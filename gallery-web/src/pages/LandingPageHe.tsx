import { useState, useEffect } from 'react'
import { signInWithGoogle } from '../lib/auth'
import { color, text, space, radius, font, shadow } from '../theme'
import { Button, Card, Badge, Reveal } from '../components/ui'

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/* ═══════════════════════════════════════════════════════════════════
   PHONE DEMO — the guest "find your photos" flow. The device itself is
   dark (phones are), which reads as a premium product shot on the warm
   cream background. Self-contained styles live in PHONE_CSS below.
   ═══════════════════════════════════════════════════════════════════ */
function PhoneDemo({ active }: { active: boolean }) {
  const [step, setStep] = useState(0)
  const [line, setLine] = useState(0)
  const [thumbs, setThumbs] = useState(0)
  const MSGS = ['מחפשים אותך…', 'עוברים על התמונות 👀', 'יש מצב שתפסנו אותך…', 'עוד שנייה…']

  useEffect(() => {
    if (!active) { setStep(0); setLine(0); setThumbs(0); return }
    let stop = false
    const run = async () => {
      while (!stop) {
        setStep(0); setLine(0); setThumbs(0); await wait(1800)
        if (stop) return; setStep(1); await wait(2200)
        if (stop) return; setStep(2); await wait(280)
        if (stop) return; setStep(3)
        for (let i = 0; i < 4; i++) { await wait(500); if (stop) return; setLine(i + 1) }
        await wait(350); if (stop) return; setStep(4)
        for (let i = 0; i < 12; i++) { await wait(60); if (stop) return; setThumbs(i + 1) }
        await wait(3200)
      }
    }
    run()
    return () => { stop = true }
  }, [active])

  return (
    <div className="pd">
      <div className="pd-s" style={{ opacity: step === 0 ? 1 : 0 }}>
        <div className="pd-ring">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.2"><circle cx="12" cy="10" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
        </div>
        <p className="pd-t">מצא את התמונות שלך</p>
        <p className="pd-sub2">סלפי אחד וזהו</p>
        <div className="pd-pill">בוא נתחיל</div>
      </div>
      <div className="pd-s" style={{ opacity: step === 1 ? 1 : 0 }}>
        <div className="pd-cam"><div className="pd-cam-p" />
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1"><circle cx="12" cy="10" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
        </div>
        <div className="pd-shutter"><div className="pd-shutter-in" /></div>
      </div>
      <div className="pd-s" style={{ opacity: step === 2 ? 1 : 0, background: 'rgba(255,255,255,.9)', transition: 'opacity .08s' }} />
      <div className="pd-s" style={{ opacity: step === 3 ? 1 : 0 }}>
        <div className="pd-orb">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.3"><circle cx="12" cy="10" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
        </div>
        <div className="pd-lines">{MSGS.map((t, i) => (
          <p key={i} style={{
            opacity: i < line ? 1 : 0, transform: `translateY(${i < line ? 0 : 6}px)`,
            color: i === line - 1 ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.12)',
            fontWeight: i === line - 1 ? 600 : 400, fontSize: 11, margin: 0, textAlign: 'center',
            transition: 'all .45s cubic-bezier(.16,1,.3,1)',
          }}>{t}</p>
        ))}</div>
      </div>
      <div className="pd-s" style={{ opacity: step === 4 ? 1 : 0 }}>
        <div className="pd-ok"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#7B8F6E" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '5px 0 1px' }}>מצאנו אותך</p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', margin: '0 0 8px' }}>47 תמונות</p>
        <div className="pd-grid">{Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="pd-thumb" style={{ opacity: i < thumbs ? 1 : 0, transform: `scale(${i < thumbs ? 1 : 0})`, transitionDelay: `${i * 22}ms` }} />
        ))}</div>
      </div>
    </div>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: `1px solid ${color.border}` }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', padding: '18px 0', background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        color: color.ink, ...text.body, fontWeight: 600, fontFamily: font.sans, textAlign: 'right',
      }}>
        <span>{q}</span>
        <span style={{ fontSize: 18, color: color.textMuted, transition: 'transform .25s', transform: open ? 'rotate(90deg)' : 'none', marginInlineStart: 10 }}>‹</span>
      </button>
      <div style={{ maxHeight: open ? 200 : 0, overflow: 'hidden', transition: 'max-height .3s ease' }}>
        <p style={{ ...text.small, lineHeight: 1.8, color: color.inkSoft, padding: '0 0 16px' }}>{a}</p>
      </div>
    </div>
  )
}

const STEPS = [
  { n: '1', t: 'מעלים תמונות', d: 'גוררים תיקייה וסוגרים עניין.' },
  { n: '2', t: 'שולחים לינק', d: 'וואטסאפ, QR, מה שנוח — בלי אפליקציה ללקוח.' },
  { n: '3', t: 'הם מוצאים את עצמם', d: 'סלפי אחד, וזיהוי הפנים עושה את השאר.' },
]

const FAQS = [
  { q: 'כמה מדויק זיהוי הפנים?', a: 'גבוה מאוד — עובד גם בתאורה חלשה, עם משקפיים ובתמונות קבוצתיות.' },
  { q: 'הלקוחות צריכים אפליקציה?', a: 'לא. לינק, סלפי, תמונות. זהו.' },
  { q: 'איך עובד התמחור?', a: 'מנוי חודשי לפי כמות תמונות (מ-₪79), או תשלום חד-פעמי של ₪590 לגלריית אירוע בודדת.' },
  { q: 'מה עם פרטיות?', a: 'כל אורח רואה רק את עצמו. הסלפי משמש לזיהוי בלבד.' },
]

export function LandingPageHe() {
  const [live, setLive] = useState(false)
  const go = () => signInWithGoogle()

  return (
    <div dir="rtl" style={{
      minHeight: '100vh', background: color.bg, color: color.ink,
      fontFamily: font.sans, WebkitFontSmoothing: 'antialiased', overflowX: 'hidden',
    }}>
      <style>{PHONE_CSS}</style>

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${space[4]}px clamp(20px, 5vw, 56px)`, maxWidth: 1200, margin: '0 auto',
      }}>
        <a href="/" style={{ ...text.h3, fontFamily: font.display, color: color.ink, textDecoration: 'none' }}>pixflow</a>
        <div style={{ display: 'flex', gap: space[3], alignItems: 'center' }}>
          <a href="#how" style={{ ...text.small, color: color.inkSoft, textDecoration: 'none' }}>איך זה עובד</a>
          <a href="/pricing" style={{ ...text.small, color: color.inkSoft, textDecoration: 'none' }}>מחירים</a>
          <a href="/demo" style={{ ...text.small, color: color.inkSoft, textDecoration: 'none' }}>דמו</a>
          <Button size="sm" onClick={go}>התחל בחינם</Button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: space[7],
        maxWidth: 1120, margin: '0 auto', padding: `${space[7]}px clamp(20px, 5vw, 56px) ${space[8]}px`,
      }}>
        <div style={{ flex: '1 1 420px', maxWidth: 540 }}>
          <Reveal>
            <h1 style={{ ...text.display, margin: 0 }}>הגלריה שלך.<br/>הלקוחות מוצאים<br/>את עצמם.</h1>
          </Reveal>
          <Reveal delay={90}>
            <p style={{ ...text.body, fontSize: 18, color: color.inkSoft, margin: `${space[4]}px 0 ${space[5]}px`, maxWidth: 460 }}>
              ענן גלריות לצלמים עם זיהוי פנים. האורחים מצלמים סלפי — וכל התמונות שלהם כבר שם. בלי אפליקציה, בלי חיפוש.
            </p>
          </Reveal>
          <Reveal delay={170}>
            <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
              <Button size="lg" onClick={go}>התחל בחינם</Button>
              <button onClick={() => setLive(v => !v)} style={{
                background: 'none', border: 'none', cursor: 'pointer', ...text.body, fontWeight: 600,
                color: color.accent, fontFamily: font.sans,
              }}>
                {live ? '● רואים את זה חי →' : '▶ תראה לי איך זה עובד'}
              </button>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <div style={{ ...text.small, color: color.textMuted, marginTop: space[4] }}>
              100 תמונות חינם · בלי כרטיס אשראי
            </div>
          </Reveal>
        </div>

        {/* Phone */}
        <Reveal delay={120} y={32} style={{ flex: '0 0 auto' }}>
          <div className={`phone phone-float ${live ? 'phone--live' : ''}`}>
            <div className="phone-notch" />
            <div className="phone-scr"><PhoneDemo active={live} /></div>
          </div>
        </Reveal>
      </section>

      {/* How it works */}
      <section id="how" style={{ maxWidth: 1000, margin: '0 auto', padding: `${space[7]}px clamp(20px, 5vw, 56px)` }}>
        <Reveal>
          <h2 style={{ ...text.h1, textAlign: 'center', margin: `0 0 ${space[6]}px` }}>שלושה שלבים. זהו.</h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: space[4] }}>
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 90}>
              <Card interactive pad={28} style={{ display: 'flex', flexDirection: 'column', gap: space[2], height: '100%' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: radius.pill, background: color.accentSoft,
                  color: color.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...text.h3, fontWeight: 700, marginBottom: space[1],
                }}>{s.n}</div>
                <h3 style={{ ...text.h3, margin: 0 }}>{s.t}</h3>
                <p style={{ ...text.small, color: color.inkSoft, margin: 0 }}>{s.d}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Pricing teaser → full /pricing */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: `${space[6]}px clamp(20px, 5vw, 56px)` }}>
        <Reveal>
        <Card pad={36} style={{
          textAlign: 'center', background: color.surfaceAlt,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: space[3],
        }}>
          <Badge tone="accent">זיהוי פנים כלול בכל מנוי</Badge>
          <h2 style={{ ...text.h1, fontSize: 'clamp(24px,3.5vw,34px)', margin: 0 }}>תמחור פשוט ושקוף</h2>
          <p style={{ ...text.body, color: color.inkSoft, margin: 0, maxWidth: 480 }}>
            מנוי מ-<strong>₪79/חודש</strong>, או <strong>₪590</strong> לגלריית אירוע בודדת. בלי כוכביות, בלי שיחת מכירה.
          </p>
          <div style={{ display: 'flex', gap: space[3], marginTop: space[2], flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button size="lg" onClick={() => { window.location.href = '/pricing' }}>ראה תמחור מלא</Button>
            <Button variant="secondary" size="lg" onClick={go}>התחל בחינם</Button>
          </div>
        </Card>
        </Reveal>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 620, margin: '0 auto', padding: `${space[7]}px clamp(20px, 5vw, 56px)` }}>
        <Reveal>
          <h2 style={{ ...text.h1, textAlign: 'center', margin: `0 0 ${space[5]}px` }}>שאלות נפוצות</h2>
        </Reveal>
        <Reveal delay={80}>
          <div>{FAQS.map(f => <Faq key={f.q} q={f.q} a={f.a} />)}</div>
        </Reveal>
      </section>

      {/* Final CTA */}
      <section style={{ textAlign: 'center', padding: `${space[7]}px ${space[5]}px ${space[8]}px` }}>
        <Reveal>
          <h2 style={{ ...text.display, fontSize: 'clamp(30px,5vw,56px)', margin: `0 0 ${space[5]}px` }}>
            הגלריה הבאה שלך<br/>מוכרת את עצמה.
          </h2>
          <Button size="lg" onClick={go} style={{ padding: '16px 40px', fontSize: 16 }}>יאללה, נרים את זה</Button>
        </Reveal>
      </section>

      {/* Footer */}
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

/* Self-contained styles for the dark phone mockup + its demo animation. */
const PHONE_CSS = `
html{scroll-behavior:smooth}
.phone-float{animation:phonefloat 6s ease-in-out infinite}
@keyframes phonefloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@media(prefers-reduced-motion:reduce){.phone-float{animation:none}html{scroll-behavior:auto}}
.phone{width:clamp(220px,24vw,280px);aspect-ratio:9/19.5;border:2px solid #1a1a1a;border-radius:38px;background:#0E0E10;position:relative;overflow:hidden;box-shadow:${shadow.lg};transition:border-color .5s,box-shadow .5s}
.phone--live{border-color:#7B8F6E;box-shadow:0 0 50px rgba(123,143,110,.18),${shadow.lg}}
.phone-notch{position:absolute;top:0;left:50%;transform:translateX(-50%);width:70px;height:18px;background:#0E0E10;border-radius:0 0 10px 10px;z-index:5}
.phone-scr{position:absolute;inset:3px;border-radius:34px;overflow:hidden;background:#0E0E10}
.pd{position:absolute;inset:0}
.pd-s{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;transition:opacity .45s ease;padding:14px}
.pd-ring{width:55px;height:55px;border-radius:50%;border:1.5px solid rgba(123,143,110,.3);display:flex;align-items:center;justify-content:center}
.pd-t{font-size:13px;font-weight:700;color:#fff}
.pd-sub2{font-size:9px;color:rgba(255,255,255,.3)}
.pd-pill{margin-top:6px;padding:8px 22px;border-radius:60px;background:#7B8F6E;color:#fff;font-size:11px;font-weight:700}
.pd-cam{width:80px;height:80px;border-radius:50%;border:1.5px solid rgba(123,143,110,.2);display:flex;align-items:center;justify-content:center;position:relative}
.pd-cam-p{position:absolute;inset:-10px;border-radius:50%;border:1px solid rgba(123,143,110,.08);animation:vfp 3s ease-in-out infinite}
@keyframes vfp{0%,100%{transform:scale(1);opacity:.15}50%{transform:scale(1.05);opacity:.5}}
.pd-shutter{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;margin-top:10px}
.pd-shutter-in{width:30px;height:30px;border-radius:50%;background:#fff}
.pd-orb{width:60px;height:60px;border-radius:50%;border:1.5px solid rgba(123,143,110,.3);display:flex;align-items:center;justify-content:center;animation:orb 3s ease-in-out infinite}
@keyframes orb{0%,100%{box-shadow:0 0 10px rgba(123,143,110,.05)}50%{box-shadow:0 0 30px rgba(123,143,110,.15)}}
.pd-lines{margin-top:8px;display:flex;flex-direction:column;align-items:center;gap:1px}
.pd-ok{width:34px;height:34px;border-radius:50%;background:rgba(123,143,110,.08);border:1.5px solid rgba(123,143,110,.3);display:flex;align-items:center;justify-content:center}
.pd-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;width:130px}
.pd-thumb{aspect-ratio:1;border-radius:4px;background:linear-gradient(135deg,rgba(123,143,110,.25),rgba(123,143,110,.1));transition:all .25s cubic-bezier(.16,1,.3,1)}
`
