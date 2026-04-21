import { useState, useEffect, useRef, type ReactNode } from 'react'
import { signInWithGoogle } from '../lib/auth'

// ─── Reveal on scroll ───────────────────────────────────────────────────────

function R({ children, d = 0, cls = '' }: { children: ReactNode; d?: number; cls?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setTimeout(() => el.classList.add('v'), d); obs.unobserve(el) }
    }, { threshold: 0.06 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [d])
  return <div ref={ref} className={`rv ${cls}`}>{children}</div>
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', padding: '20px 0', background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        color: '#fff', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', textAlign: 'right',
      }}>
        <span>{q}</span>
        <span style={{ color: '#6366f1', fontSize: 20, transition: 'transform .2s', transform: open ? 'rotate(45deg)' : '', marginLeft: 16, flexShrink: 0 }}>+</span>
      </button>
      <div style={{ maxHeight: open ? 200 : 0, overflow: 'hidden', transition: 'max-height .3s ease' }}>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: 'rgba(255,255,255,.4)', margin: 0, padding: '0 0 20px' }}>{a}</p>
      </div>
    </div>
  )
}

// ─── Animated Phone Mockup ──────────────────────────────────────────────────

function PhoneMockup() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 2000),
      setTimeout(() => setStep(2), 4000),
      setTimeout(() => setStep(3), 5500),
      setTimeout(() => setStep(0), 8000),
    ]
    const loop = setInterval(() => {
      setTimeout(() => setStep(1), 100)
      setTimeout(() => setStep(2), 2100)
      setTimeout(() => setStep(3), 3600)
      setTimeout(() => setStep(0), 6100)
    }, 8000)
    return () => { timers.forEach(clearTimeout); clearInterval(loop) }
  }, [])

  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-screen">
        {/* Step 0: Selfie screen */}
        <div className="phone-step" style={{ opacity: step === 0 ? 1 : 0 }}>
          <div className="phone-cam">
            <div className="phone-cam-ring" />
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6 20c0-3 3-5 6-5s6 2 6 5" />
            </svg>
          </div>
          <p className="phone-text">צלם סלפי</p>
        </div>
        {/* Step 1: Scanning */}
        <div className="phone-step" style={{ opacity: step === 1 ? 1 : 0 }}>
          <div className="phone-scan">
            <div className="phone-scan-line" />
          </div>
          <p className="phone-text">מזהה פנים...</p>
        </div>
        {/* Step 2: Loading dots */}
        <div className="phone-step" style={{ opacity: step === 2 ? 1 : 0 }}>
          <div className="phone-dots">
            <span /><span /><span />
          </div>
          <p className="phone-text">מחפש תמונות</p>
        </div>
        {/* Step 3: Results */}
        <div className="phone-step" style={{ opacity: step === 3 ? 1 : 0 }}>
          <div className="phone-results">
            <div className="phone-thumb" style={{ animationDelay: '0s' }} />
            <div className="phone-thumb" style={{ animationDelay: '.1s' }} />
            <div className="phone-thumb" style={{ animationDelay: '.2s' }} />
            <div className="phone-thumb" style={{ animationDelay: '.3s' }} />
            <div className="phone-thumb" style={{ animationDelay: '.4s' }} />
            <div className="phone-thumb" style={{ animationDelay: '.5s' }} />
          </div>
          <p className="phone-text" style={{ color: '#22c55e' }}>נמצאו 47 תמונות!</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function LandingPageHe() {
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <div className="lp" style={{ direction: 'rtl' }}>
      <style>{`
/* ── Reset & Base ── */
.lp{--a:#6366f1;--bg:#07070d;--card:#0d0d16;--b:rgba(255,255,255,.06);min-height:100vh;background:var(--bg);color:#fff;font-family:'Inter',-apple-system,sans-serif;overflow-x:hidden;-webkit-font-smoothing:antialiased}
.lp *,.lp *::before,.lp *::after{box-sizing:border-box}
.lp a{color:inherit}
.w{max-width:1060px;margin:0 auto;padding:0 28px}

/* ── Reveal ── */
.rv{opacity:0;transform:translateY(30px);transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .8s cubic-bezier(.16,1,.3,1)}
.v{opacity:1;transform:translateY(0)}

/* ── Nav ── */
.nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:16px 0;transition:all .3s}
.nav--s{background:rgba(7,7,13,.9);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--b);padding:10px 0}
.nav-i{max-width:1060px;margin:0 auto;padding:0 28px;display:flex;align-items:center;justify-content:space-between}
.logo{font-size:24px;font-weight:900;text-decoration:none;letter-spacing:-.7px}
.logo span{color:var(--a)}
.nav-r{display:flex;gap:4px;align-items:center}
.nav-l{padding:10px 16px;font-size:13px;font-weight:500;color:rgba(255,255,255,.45);text-decoration:none;border-radius:8px;transition:color .2s}
.nav-l:hover{color:#fff}
.cta{padding:10px 22px;border-radius:10px;border:none;cursor:pointer;background:var(--a);color:#fff;font-size:13px;font-weight:700;font-family:inherit;transition:transform .15s,box-shadow .15s}
.cta:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(99,102,241,.3)}
@media(max-width:680px){.nav-r{display:none}.mob-b{display:flex!important}}
.mob-b{display:none;width:36px;height:36px;border-radius:8px;border:1px solid var(--b);background:0;color:rgba(255,255,255,.5);cursor:pointer;align-items:center;justify-content:center;font-size:18px}
.mob-menu{padding:12px 28px 16px;display:flex;flex-direction:column;gap:4px;background:rgba(7,7,13,.97);border-top:1px solid var(--b)}
.mob-menu .cta{margin-top:8px}

/* ── Hero ── */
.hero{padding:160px 28px 80px;display:flex;align-items:center;justify-content:center;gap:60px;position:relative;min-height:85vh}
@media(max-width:860px){.hero{flex-direction:column;text-align:center;padding:140px 20px 60px;gap:40px}}
.hero-txt{flex:1;max-width:480px}
.hero-badge{display:inline-block;padding:6px 16px;border-radius:100px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.12);font-size:12px;font-weight:600;color:#818cf8;margin-bottom:24px;letter-spacing:.3px}
.hero h1{font-size:clamp(32px,5vw,48px);font-weight:900;line-height:1.08;margin:0 0 20px;letter-spacing:-1.2px}
.hero-gr{background:linear-gradient(135deg,#818cf8,#c084fc,#818cf8);background-size:200% 200%;animation:gr 5s ease infinite;-webkit-background-clip:text;-webkit-text-fill-color:transparent}
@keyframes gr{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
.hero p{font-size:16px;line-height:1.7;color:rgba(255,255,255,.4);margin:0 0 36px}
.hero-btns{display:flex;gap:12px;flex-wrap:wrap}
@media(max-width:860px){.hero-btns{justify-content:center}}
.btn-p{padding:15px 36px;border-radius:12px;border:none;cursor:pointer;background:var(--a);color:#fff;font-size:16px;font-weight:700;font-family:inherit;transition:transform .15s,box-shadow .15s;box-shadow:0 4px 20px rgba(99,102,241,.2)}
.btn-p:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(99,102,241,.35)}
.btn-g{padding:15px 36px;border-radius:12px;cursor:pointer;background:0;color:#fff;font-size:16px;font-weight:600;font-family:inherit;border:1px solid rgba(255,255,255,.1);text-decoration:none;transition:border-color .2s}
.btn-g:hover{border-color:rgba(255,255,255,.25)}
.hero-glow{position:absolute;border-radius:50%;filter:blur(100px);pointer-events:none;animation:breathe 8s ease-in-out infinite}
@keyframes breathe{0%,100%{opacity:.08}50%{opacity:.18}}

/* ── Phone ── */
.phone{width:220px;height:440px;border-radius:36px;border:2px solid rgba(255,255,255,.1);background:#111;position:relative;overflow:hidden;flex-shrink:0;box-shadow:0 20px 60px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.04),inset 0 1px 0 rgba(255,255,255,.06)}
.phone-notch{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:60px;height:20px;border-radius:10px;background:#000;z-index:5}
.phone-screen{position:absolute;inset:2px;border-radius:34px;background:linear-gradient(180deg,#0a0a14,#0e0e1a);overflow:hidden}
.phone-step{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;transition:opacity .5s ease;padding:20px}
.phone-text{font-size:13px;color:rgba(255,255,255,.5);margin:0;font-weight:500}
.phone-cam{width:100px;height:100px;border-radius:50%;border:3px solid rgba(99,102,241,.3);display:flex;align-items:center;justify-content:center;position:relative}
.phone-cam-ring{position:absolute;inset:-8px;border-radius:50%;border:2px solid rgba(99,102,241,.1);animation:cam-pulse 2s ease-in-out infinite}
@keyframes cam-pulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.08);opacity:1}}
.phone-scan{width:100px;height:100px;border-radius:50%;border:2px solid var(--a);position:relative;overflow:hidden}
.phone-scan-line{position:absolute;top:0;left:0;right:0;height:3px;background:var(--a);box-shadow:0 0 12px var(--a);animation:scan 1.2s ease-in-out infinite}
@keyframes scan{0%{top:0}50%{top:calc(100% - 3px)}100%{top:0}}
.phone-dots{display:flex;gap:10px}
.phone-dots span{width:10px;height:10px;border-radius:50%;background:var(--a);animation:dot-bounce .6s ease-in-out infinite alternate}
.phone-dots span:nth-child(2){animation-delay:.15s}
.phone-dots span:nth-child(3){animation-delay:.3s}
@keyframes dot-bounce{0%{transform:translateY(0);opacity:.3}100%{transform:translateY(-8px);opacity:1}}
.phone-results{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;width:140px}
.phone-thumb{aspect-ratio:1;border-radius:6px;background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(168,85,247,.15));animation:thumb-in .4s ease both}
@keyframes thumb-in{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1}}

/* ── Ticker ── */
.ticker{padding:40px 0;overflow:hidden;border-top:1px solid var(--b);border-bottom:1px solid var(--b)}
.ticker-track{display:flex;gap:48px;animation:ticker-scroll 20s linear infinite;white-space:nowrap;width:max-content}
@keyframes ticker-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.ticker-item{font-size:14px;font-weight:600;color:rgba(255,255,255,.12);letter-spacing:2px;text-transform:uppercase}

/* ── Section ── */
.sec{padding:100px 28px}
.sec-t{font-size:28px;font-weight:800;text-align:center;margin:0 0 10px;letter-spacing:-.5px}
.sec-s{font-size:14px;color:rgba(255,255,255,.35);text-align:center;margin:0 auto 48px;max-width:380px;line-height:1.7}

/* ── Steps ── */
.steps{display:flex;gap:0;max-width:860px;margin:0 auto;border-radius:20px;overflow:hidden;border:1px solid var(--b)}
@media(max-width:700px){.steps{flex-direction:column}}
.step{flex:1;padding:40px 28px;background:var(--card);border-left:1px solid var(--b);position:relative}
.step:first-child{border-left:none}
@media(max-width:700px){.step{border-left:none;border-top:1px solid var(--b)}.step:first-child{border-top:none}}
.step-n{font-size:52px;font-weight:900;color:rgba(99,102,241,.08);line-height:1;margin-bottom:20px}
.step h3{font-size:16px;font-weight:700;margin:0 0 10px}
.step p{font-size:13px;line-height:1.7;color:rgba(255,255,255,.35);margin:0}
.step::after{content:'';position:absolute;bottom:0;right:28px;left:28px;height:2px;background:linear-gradient(90deg,transparent,var(--a),transparent);opacity:0;transition:opacity .3s}
.step:hover::after{opacity:.3}

/* ── Features ── */
.feats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:660px;margin:0 auto}
@media(max-width:600px){.feats{grid-template-columns:1fr}}
.feat{padding:24px;border-radius:14px;background:var(--card);border:1px solid var(--b);transition:border-color .25s,transform .25s}
.feat:hover{border-color:rgba(99,102,241,.15);transform:translateY(-2px)}
.feat h3{font-size:14px;font-weight:700;margin:0 0 6px;display:flex;align-items:center;gap:10px}
.feat-d{width:6px;height:6px;border-radius:50%;background:var(--a);flex-shrink:0}
.feat p{font-size:13px;line-height:1.7;color:rgba(255,255,255,.35);margin:0;padding-right:16px}

/* ── Pricing ── */
.plans{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:860px;margin:0 auto}
@media(max-width:760px){.plans{grid-template-columns:1fr;max-width:360px}}
.plan{padding:32px 24px;border-radius:18px;background:var(--card);border:1px solid var(--b);transition:transform .25s;position:relative}
.plan:hover{transform:translateY(-3px)}
.plan--p{border-color:var(--a);background:rgba(99,102,241,.03)}
.plan-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);padding:4px 16px;border-radius:100px;font-size:11px;font-weight:700;background:var(--a);color:#fff;white-space:nowrap}
.plan h3{font-size:14px;font-weight:600;color:rgba(255,255,255,.4);margin:0 0 14px}
.plan-price{font-size:40px;font-weight:900;letter-spacing:-1px}
.plan-per{font-size:13px;color:rgba(255,255,255,.2);margin-right:4px}
.plan ul{list-style:none;padding:0;margin:20px 0}
.plan li{font-size:13px;color:rgba(255,255,255,.4);padding:6px 0;display:flex;align-items:center;gap:8px}
.plan li::before{content:'✓';color:var(--a);font-weight:700;font-size:12px}
.plan-b{width:100%;padding:13px;border-radius:10px;border:none;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;transition:transform .15s,box-shadow .15s}
.plan-b:hover{transform:translateY(-1px)}
.plan-bf{background:var(--a);color:#fff;box-shadow:0 4px 16px rgba(99,102,241,.2)}
.plan-bf:hover{box-shadow:0 6px 24px rgba(99,102,241,.35)}
.plan-bg{background:rgba(255,255,255,.04);color:rgba(255,255,255,.5);border:1px solid var(--b)}

/* ── Reviews ── */
.revs{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:860px;margin:0 auto}
@media(max-width:700px){.revs{grid-template-columns:1fr}}
.rev{padding:24px;border-radius:14px;background:var(--card);border:1px solid var(--b)}
.rev-stars{color:#fbbf24;font-size:12px;letter-spacing:2px;margin-bottom:12px}
.rev-txt{font-size:13px;line-height:1.75;color:rgba(255,255,255,.4);margin:0 0 16px}
.rev-a{display:flex;align-items:center;gap:10px}
.rev-av{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--a),#a855f7);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.rev-n{font-size:12px;font-weight:600}
.rev-r{font-size:11px;color:rgba(255,255,255,.2)}

/* ── Footer ── */
.ft{padding:28px;border-top:1px solid var(--b);text-align:center}
.ft-links{display:flex;justify-content:center;gap:28px;margin-bottom:12px}
.ft-links a{font-size:12px;color:rgba(255,255,255,.15);text-decoration:none}
.ft-links a:hover{color:rgba(255,255,255,.3)}
.ft-copy{font-size:11px;color:rgba(255,255,255,.08);margin:0}
      `}</style>

      {/* Nav */}
      <nav className={`nav ${scrolled ? 'nav--s' : ''}`}>
        <div className="nav-i">
          <a href="/" className="logo">Pi<span>x</span>flow</a>
          <div className="nav-r">
            <a href="#how" className="nav-l">איך זה עובד</a>
            <a href="#pricing" className="nav-l">מחירים</a>
            <a href="/demo" className="nav-l">דמו חי</a>
            <button onClick={signInWithGoogle} className="cta">התחברות</button>
          </div>
          <button className="mob-b" onClick={() => setMenu(!menu)}>☰</button>
        </div>
        {menu && (
          <div className="mob-menu">
            <a href="#how" className="nav-l" onClick={() => setMenu(false)}>איך זה עובד</a>
            <a href="#pricing" className="nav-l" onClick={() => setMenu(false)}>מחירים</a>
            <a href="/demo" className="nav-l" onClick={() => setMenu(false)}>דמו חי</a>
            <button onClick={() => { setMenu(false); signInWithGoogle() }} className="cta">התחברות</button>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-glow" style={{ width: 500, height: 500, top: '5%', right: '8%', background: '#6366f1' }} />
        <div className="hero-glow" style={{ width: 350, height: 350, bottom: '10%', left: '5%', background: '#a855f7', animationDelay: '3s' }} />

        <div className="hero-txt" style={{ position: 'relative', zIndex: 1 }}>
          <R><div className="hero-badge">זיהוי פנים לאירועים</div></R>
          <R d={80}><h1>סלפי אחד —<br /><span className="hero-gr">כל התמונות שלהם</span></h1></R>
          <R d={160}><p>מעלים תמונות מהאירוע, האורח עושה סלפי, ותוך שנייה הוא מקבל את כל התמונות שלו. בלי אפליקציה.</p></R>
          <R d={240}>
            <div className="hero-btns">
              <button onClick={signInWithGoogle} className="btn-p">יאלה, מתחילים</button>
              <a href="/demo" className="btn-g">תנסו דמו חי</a>
            </div>
          </R>
        </div>

        <R d={300}>
          <PhoneMockup />
        </R>
      </section>

      {/* Ticker */}
      <div className="ticker">
        <div className="ticker-track">
          {[...Array(2)].map((_, r) => (
            <span key={r} style={{ display: 'contents' }}>
              {['חתונות', 'בר מצוות', 'כנסים', 'ימי גיבוש', 'אירועי חברה', 'פסטיבלים', 'חגיגות', 'השקות'].map((t, i) => (
                <span key={`${r}-${i}`} className="ticker-item">{t}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* How it works */}
      <section id="how" className="sec">
        <div className="w">
          <R><h2 className="sec-t">שלושה שלבים. זהו.</h2></R>
          <R d={60}><p className="sec-s">פשוט עד שזה כמעט חשוד</p></R>
          <R d={120}>
            <div className="steps">
              <div className="step">
                <div className="step-n">01</div>
                <h3>תעלו את התמונות</h3>
                <p>סיימתם לצלם? מעלים הכל. אנחנו מטפלים בשאר.</p>
              </div>
              <div className="step">
                <div className="step-n">02</div>
                <h3>תשלחו לינק</h3>
                <p>QR, ווטסאפ, SMS, מייל — מה שבא לכם. האורחים לוחצים ומגיעים.</p>
              </div>
              <div className="step">
                <div className="step-n">03</div>
                <h3>סלפי = תמונות</h3>
                <p>סלפי אחד מהטלפון, והמערכת מוצאת להם הכל. נקודה.</p>
              </div>
            </div>
          </R>
        </div>
      </section>

      {/* Features */}
      <section className="sec">
        <div className="w">
          <R><h2 className="sec-t">למה צלמים עוברים אלינו</h2></R>
          <R d={60}><p className="sec-s">לא סתם עוד גלריה אונליין</p></R>
          <div className="feats">
            {[
              { t: 'זיהוי ב-2 שניות', d: 'לא דקות. לא "מעבד". האורח עושה סלפי ומקבל תוצאות עוד לפני שהוריד את היד.' },
              { t: 'הלוגו שלך, הצבעים שלך', d: 'הגלריה נראית כאילו בנית אותה. הלקוח לא רואה Pixflow — הוא רואה אותך.' },
              { t: 'פרטיות ברמה אחרת', d: 'כל אורח רואה רק את שלו. הסלפי נמחק אוטומטית. GDPR? סגור.' },
              { t: 'אפס חיכוך', d: 'בלי אפליקציה, בלי הרשמה, בלי "הכנס קוד". לוחץ, סלפי, מקבל. זהו.' },
            ].map((f, i) => (
              <R key={i} d={i * 60}><div className="feat"><h3><span className="feat-d" />{f.t}</h3><p>{f.d}</p></div></R>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="sec">
        <div className="w">
          <R><h2 className="sec-t">תמחור</h2></R>
          <R d={60}><p className="sec-s">חד פעמי. בלי מנויים, בלי קאצ'.</p></R>
          <R d={120}>
            <div className="plans">
              <div className="plan">
                <h3>Essential</h3>
                <div><span className="plan-price">₪599</span><span className="plan-per">/אירוע</span></div>
                <ul><li>עד 2,000 תמונות</li><li>זיהוי פנים AI</li><li>שאלון ללקוח</li><li>שיתוף QR + לינק</li><li>3 חודשי אחסון</li></ul>
                <button onClick={signInWithGoogle} className="plan-b plan-bg">להתחיל</button>
              </div>
              <div className="plan plan--p">
                <div className="plan-badge">הכי נבחר</div>
                <h3>Premium</h3>
                <div><span className="plan-price">₪799</span><span className="plan-per">/אירוע</span></div>
                <ul><li>ללא הגבלת תמונות</li><li>זיהוי פנים AI</li><li>מיתוג מלא</li><li>SMS + מייל אוטומטי</li><li>שאלון מותאם</li><li>6 חודשי אחסון</li></ul>
                <button onClick={signInWithGoogle} className="plan-b plan-bf">להתחיל</button>
              </div>
              <div className="plan">
                <h3>Exclusive</h3>
                <div><span className="plan-price">₪1,199</span><span className="plan-per">/אירוע</span></div>
                <ul><li>הכל מ-Premium</li><li>עיצוב גלריה VIP</li><li>מסך לייב באירוע</li><li>שנה אחסון</li><li>תמיכה VIP</li></ul>
                <button onClick={signInWithGoogle} className="plan-b plan-bg">להתחיל</button>
              </div>
            </div>
          </R>
        </div>
      </section>

      {/* Testimonials */}
      <section className="sec">
        <div className="w">
          <R><h2 className="sec-t">צלמים מדברים</h2></R>
          <R d={80}>
            <div className="revs">
              {[
                { n: 'דניאל כ.', r: 'צלם אירועים · ת״א', t: 'האורחים מקבלים תמונות עוד באירוע ושולחים סטוריז. שיווק חינם שאי אפשר לקנות בכסף.', i: 'ד' },
                { n: 'מיכל ש.', r: 'צלמת חתונות · חיפה', t: 'הזיהוי עובד גם בתאורה של DJ בשעה 2 בלילה. ניסיתי שלושה מתחרים — אף אחד לא מתקרב.', i: 'מ' },
                { n: 'עומר א.', r: 'מפיק אירועים · י-ם', t: 'הלקוחות שלי לא מורידים אפליקציות. נקודה. Pixflow עובד מהדפדפן ובזה סגרו אותי.', i: 'ע' },
              ].map((rv, i) => (
                <R key={i} d={i * 80}>
                  <div className="rev">
                    <div className="rev-stars">★★★★★</div>
                    <p className="rev-txt">{rv.t}</p>
                    <div className="rev-a"><div className="rev-av">{rv.i}</div><div><div className="rev-n">{rv.n}</div><div className="rev-r">{rv.r}</div></div></div>
                  </div>
                </R>
              ))}
            </div>
          </R>
        </div>
      </section>

      {/* FAQ */}
      <section className="sec">
        <div className="w" style={{ maxWidth: 600 }}>
          <R><h2 className="sec-t">שאלות נפוצות</h2></R>
          <R d={60}>
            <div>
              <Faq q="כמה מדויק הזיהוי?" a="מעל 97%. עובד גם בתאורה חלשה, עם משקפיים, ובקבוצות גדולות. משתמשים ב-AWS Rekognition." />
              <Faq q="האורחים צריכים להוריד משהו?" a="שום דבר. לינק → סלפי → תמונות. אפילו סבתא תצליח." />
              <Faq q="כמה תמונות אפשר להעלות?" a="ב-Essential עד 2,000. ב-Premium ו-Exclusive — כמה שבא לך." />
              <Faq q="מה עם פרטיות?" a="כל אורח רואה רק את שלו. הסלפי נמחק אחרי הזיהוי. GDPR ✓ חוק הגנת הפרטיות ✓" />
              <Faq q="אפשר לשים את הלוגו שלי?" a="ב-Premium ומעלה — לוגו, צבעים, טקסטים. הלקוח שלך רואה רק אותך." />
              <Faq q="תוך כמה זמן הגלריה באוויר?" a="1,000 תמונות = בערך 10-15 דקות. מרגע שסיימת להעלות — הגלריה מוכנה." />
            </div>
          </R>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: '60px 28px 100px', textAlign: 'center' }}>
        <R>
          <h2 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px', letterSpacing: -.5 }}>מוכנים לשדרג את האירוע הבא?</h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.35)', margin: '0 0 32px' }}>תנו לאורחים חוויה שהם ידברו עליה</p>
          <div className="hero-btns" style={{ justifyContent: 'center' }}>
            <button onClick={signInWithGoogle} className="btn-p">יאלה, בואו</button>
            <a href="/demo" className="btn-g">דמו קודם</a>
          </div>
        </R>
      </section>

      {/* Footer */}
      <footer className="ft">
        <div className="ft-links">
          <a href="/terms">תנאי שימוש</a>
          <a href="/privacy">פרטיות</a>
          <a href="mailto:support@pixflow-ai.com">צור קשר</a>
        </div>
        <p className="ft-copy">Pixflow AI by Eclipse Media &copy; 2026</p>
      </footer>
    </div>
  )
}
