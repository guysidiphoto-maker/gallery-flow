import { useState, useEffect, useRef, type ReactNode } from 'react'
import { signInWithGoogle } from '../lib/auth'

// ── Reveal on scroll ────────────────────────────────────────────────────────
function R({ children, d = 0 }: { children: ReactNode; d?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setTimeout(() => el.classList.add('vis'), d); obs.unobserve(el) }
    }, { threshold: 0.08 })
    obs.observe(el); return () => obs.disconnect()
  }, [d])
  return <div ref={ref} className="rev">{children}</div>
}

// ── FAQ ─────────────────────────────────────────────────────────────────────
function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid #eee' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', padding: '22px 0', background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        color: '#0a0a0a', fontSize: 16, fontWeight: 600, fontFamily: 'inherit', textAlign: 'right',
      }}>
        <span>{q}</span>
        <span style={{ fontSize: 22, transition: 'transform .2s', transform: open ? 'rotate(45deg)' : '', marginLeft: 16, flexShrink: 0, color: '#999' }}>+</span>
      </button>
      <div style={{ maxHeight: open ? 200 : 0, overflow: 'hidden', transition: 'max-height .3s ease' }}>
        <p style={{ fontSize: 15, lineHeight: 1.8, color: '#666', margin: 0, padding: '0 0 20px' }}>{a}</p>
      </div>
    </div>
  )
}

// ── Animated Phone (the "video") ────────────────────────────────────────────
const LINES = ['רגע… מחפשים אותך', 'עוברים על התמונות 👀', 'יש מצב שתפסנו אותך…', 'עוד שנייה ויש לנו את זה']
function wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function HeroPhone() {
  const [step, setStep] = useState(0) // 0=welcome 1=camera 2=flash 3=thinking 4=found
  const [line, setLine] = useState(0)

  useEffect(() => {
    let c = false
    const run = async () => {
      while (!c) {
        setStep(0); setLine(0); await wait(1800)
        if (c) return; setStep(1); await wait(2200) // camera
        if (c) return; setStep(2); await wait(400) // flash
        if (c) return; setStep(3) // thinking
        for (let i = 0; i < LINES.length; i++) { await wait(650); if (c) return; setLine(i + 1) }
        await wait(600); if (c) return
        setStep(4); await wait(3500) // found
      }
    }
    run(); return () => { c = true }
  }, [])

  return (
    <div className="hp">
      <div className="hp-notch" />
      <div className="hp-scr">
        {/* Welcome */}
        <div className="hp-s" style={{ opacity: step === 0 ? 1 : 0 }}>
          <div className="hp-welcome-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#6366f1" strokeWidth="1.5"><circle cx="12" cy="10" r="4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', margin: '0 0 6px' }}>מצא את התמונות שלך</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', margin: 0 }}>צלם סלפי כדי למצוא את כל התמונות שלך מהאירוע</p>
          <div className="hp-start-btn">בואו נתחיל</div>
        </div>

        {/* Camera */}
        <div className="hp-s" style={{ opacity: step === 1 ? 1 : 0 }}>
          <div className="hp-cam">
            <div className="hp-cam-pulse" />
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.2"><circle cx="12" cy="10" r="4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
          </div>
          <div className="hp-shutter" />
        </div>

        {/* Flash */}
        <div className="hp-s" style={{ opacity: step === 2 ? 1 : 0, background: '#fff', transition: 'opacity .15s' }} />

        {/* Thinking */}
        <div className="hp-s" style={{ opacity: step === 3 ? 1 : 0 }}>
          <div className="hp-selfie-ring">
            <div className="hp-selfie-glow" />
            <div className="hp-selfie-inner">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.5"><circle cx="12" cy="10" r="4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
            </div>
          </div>
          <div style={{ direction: 'rtl', marginTop: 8 }}>
            {LINES.map((t, i) => (
              <p key={i} style={{
                fontSize: 10, margin: '2px 0', textAlign: 'center',
                opacity: i < line ? 1 : 0, transform: `translateY(${i < line ? 0 : 6}px)`,
                color: i === line - 1 ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.2)',
                fontWeight: i === line - 1 ? 600 : 400, transition: 'all .5s ease',
              }}>{t}</p>
            ))}
          </div>
        </div>

        {/* Found */}
        <div className="hp-s" style={{ opacity: step === 4 ? 1 : 0 }}>
          <div className="hp-found-check">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '0 0 2px' }}>מצאנו אותך</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', margin: '0 0 10px' }}>47 תמונות נמצאו</p>
          <div className="hp-grid">
            {[0,1,2,3,4,5,6,7,8].map(i => <div key={i} className="hp-thumb" style={{ animationDelay: `${i * .06}s` }} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────
export function LandingPageHe() {
  const [scrolled, setScrolled] = useState(false)
  const [heroScale, setHeroScale] = useState(1)
  const [heroBorderRadius, setHeroBorderRadius] = useState(0)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    const fn = () => {
      const y = window.scrollY
      setScrolled(y > 50)
      // Scale hero down as user scrolls (first 600px of scroll)
      const progress = Math.min(y / 600, 1)
      setHeroScale(1 - progress * 0.25) // 1 → 0.75
      setHeroBorderRadius(progress * 28) // 0 → 28px
    }
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <div className="lp">
      <style>{`
/* Base */
.lp{--acc:#6366f1;min-height:100vh;background:linear-gradient(180deg,#f3e8ff 0%,#fce7f3 35%,#fff 70%);color:#0a0a0a;font-family:'Inter',-apple-system,sans-serif;direction:rtl;overflow-x:hidden;-webkit-font-smoothing:antialiased}
.lp *{box-sizing:border-box}
.lp a{color:inherit}
.w{max-width:1060px;margin:0 auto;padding:0 28px}

/* Reveal */
.rev{opacity:0;transform:translateY(32px);transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .8s cubic-bezier(.16,1,.3,1)}
.vis{opacity:1;transform:none}

/* Nav — floating pill */
.nav{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:100;width:calc(100% - 48px);max-width:720px}
.nav-pill{background:rgba(255,255,255,.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:60px;padding:10px 10px 10px 24px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 20px rgba(0,0,0,.06);border:1px solid rgba(0,0,0,.04)}
.logo{font-size:20px;font-weight:900;text-decoration:none;letter-spacing:-.5px;color:#0a0a0a}
.logo span{color:var(--acc)}
.nav-r{display:flex;gap:4px;align-items:center}
.nav-l{padding:8px 14px;font-size:13px;font-weight:500;color:#666;text-decoration:none;border-radius:20px;transition:color .2s}
.nav-l:hover{color:#0a0a0a}
.nav-cta{padding:10px 24px;border-radius:60px;border:none;cursor:pointer;background:#0a0a0a;color:#fff;font-size:13px;font-weight:600;font-family:inherit;transition:background .2s,transform .15s}
.nav-cta:hover{background:var(--acc);transform:scale(1.03)}
@media(max-width:640px){.nav-r .nav-l{display:none}}

/* Hero */
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:120px 28px 60px;position:relative;text-align:center}
.hero h1{font-size:clamp(36px,7vw,72px);font-weight:900;line-height:.98;margin:0 0 20px;letter-spacing:-2px;color:#0a0a0a}
.hero p{font-size:clamp(16px,2vw,20px);line-height:1.6;color:#555;max-width:460px;margin:0 auto 36px}
.hero-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn-b{padding:16px 44px;border-radius:60px;border:none;cursor:pointer;background:#0a0a0a;color:#fff;font-size:17px;font-weight:700;font-family:inherit;transition:background .2s,transform .15s,box-shadow .15s}
.btn-b:hover{background:var(--acc);transform:translateY(-2px);box-shadow:0 8px 24px rgba(99,102,241,.2)}
.btn-w{padding:16px 44px;border-radius:60px;cursor:pointer;background:#fff;color:#0a0a0a;font-size:17px;font-weight:600;font-family:inherit;border:1px solid #ddd;text-decoration:none;transition:border-color .2s,transform .15s}
.btn-w:hover{border-color:#999;transform:translateY(-2px)}

/* Hero phone container — scales on scroll */
.hero-device{margin-top:48px;transition:border-radius .1s;will-change:transform}

/* Phone mockup */
.hp{width:260px;height:520px;border-radius:44px;background:#111;position:relative;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.18);border:3px solid rgba(0,0,0,.15)}
@media(max-width:640px){.hp{width:200px;height:400px;border-radius:34px}}
.hp-notch{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:80px;height:24px;border-radius:14px;background:#000;z-index:5}
.hp-scr{position:absolute;inset:3px;border-radius:40px;background:radial-gradient(ellipse at center,#141420,#0a0a12);overflow:hidden}
.hp-s{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;transition:opacity .5s ease;padding:28px 20px}
.hp-welcome-icon{width:60px;height:60px;border-radius:50%;background:rgba(99,102,241,.1);border:1.5px solid rgba(99,102,241,.2);display:flex;align-items:center;justify-content:center;margin-bottom:4px}
.hp-start-btn{margin-top:12px;padding:10px 28px;border-radius:60px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:12px;font-weight:700}
.hp-cam{width:110px;height:110px;border-radius:50%;border:2px solid rgba(99,102,241,.2);display:flex;align-items:center;justify-content:center;position:relative}
.hp-cam-pulse{position:absolute;inset:-12px;border-radius:50%;border:1.5px solid rgba(99,102,241,.08);animation:pulse-r 2.5s ease-in-out infinite}
@keyframes pulse-r{0%,100%{transform:scale(1);opacity:.4}50%{transform:scale(1.08);opacity:.8}}
.hp-shutter{width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.9);border:3px solid rgba(99,102,241,.25);margin-top:8px}
.hp-selfie-ring{width:76px;height:76px;border-radius:50%;border:2px solid rgba(99,102,241,.4);display:flex;align-items:center;justify-content:center;position:relative;animation:selfie-pulse 2.5s ease-in-out infinite}
@keyframes selfie-pulse{0%,100%{box-shadow:0 0 20px rgba(99,102,241,.1)}50%{box-shadow:0 0 40px rgba(99,102,241,.25)}}
.hp-selfie-glow{position:absolute;inset:-14px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,.1) 0%,transparent 70%);animation:glow-b 2.5s ease-in-out infinite}
@keyframes glow-b{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.7;transform:scale(1.12)}}
.hp-selfie-inner{width:100%;height:100%;border-radius:50%;background:rgba(99,102,241,.06);display:flex;align-items:center;justify-content:center}
.hp-found-check{width:40px;height:40px;border-radius:50%;background:rgba(34,197,94,.1);border:2px solid rgba(34,197,94,.3);display:flex;align-items:center;justify-content:center;margin-bottom:6px;animation:pop-in .5s cubic-bezier(.16,1,.3,1) both}
@keyframes pop-in{0%{transform:scale(0)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
.hp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;width:120px}
.hp-thumb{aspect-ratio:1;border-radius:5px;background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(168,85,247,.1));animation:t-in .3s ease both}
@keyframes t-in{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1}}

/* Stats */
.stats{display:flex;justify-content:center;gap:60px;padding:80px 28px;flex-wrap:wrap}
@media(max-width:600px){.stats{gap:32px}}
.stat{text-align:center}
.stat-n{font-size:48px;font-weight:900;letter-spacing:-1px;display:block;color:#0a0a0a}
.stat-l{font-size:13px;color:#999;margin-top:4px}

/* Section */
.sec{padding:100px 28px}
.sec-t{font-size:clamp(28px,4vw,44px);font-weight:800;text-align:center;margin:0 0 12px;letter-spacing:-.8px;color:#0a0a0a}
.sec-s{font-size:15px;color:#888;text-align:center;margin:0 auto 48px;max-width:400px;line-height:1.7}

/* Steps */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:860px;margin:0 auto}
@media(max-width:700px){.steps{grid-template-columns:1fr;max-width:400px}}
.step{padding:36px 28px;border-radius:20px;background:#fff;border:1px solid #f0f0f0;transition:transform .25s,box-shadow .25s}
.step:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,.06)}
.step-n{font-size:52px;font-weight:900;color:rgba(99,102,241,.1);line-height:1;margin-bottom:16px}
.step h3{font-size:17px;font-weight:700;margin:0 0 8px;color:#0a0a0a}
.step p{font-size:14px;line-height:1.7;color:#888;margin:0}

/* Features */
.feats{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;max-width:680px;margin:0 auto}
@media(max-width:600px){.feats{grid-template-columns:1fr}}
.feat{padding:28px 24px;border-radius:18px;background:#fff;border:1px solid #f0f0f0;transition:transform .25s,box-shadow .25s}
.feat:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.04)}
.feat h3{font-size:15px;font-weight:700;margin:0 0 6px;color:#0a0a0a;display:flex;align-items:center;gap:10px}
.feat-dot{width:7px;height:7px;border-radius:50%;background:var(--acc);flex-shrink:0}
.feat p{font-size:13px;line-height:1.7;color:#888;margin:0;padding-right:17px}

/* Pricing */
.plans{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:880px;margin:0 auto}
@media(max-width:760px){.plans{grid-template-columns:1fr;max-width:370px}}
.plan{padding:36px 28px;border-radius:20px;background:#fff;border:1px solid #f0f0f0;position:relative;transition:transform .25s,box-shadow .25s}
.plan:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,.06)}
.plan--p{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
.plan-badge{position:absolute;top:-13px;left:50%;transform:translateX(-50%);padding:5px 18px;border-radius:60px;font-size:11px;font-weight:700;background:var(--acc);color:#fff;white-space:nowrap}
.plan h3{font-size:14px;font-weight:600;color:#999;margin:0 0 14px}
.plan-price{font-size:44px;font-weight:900;letter-spacing:-1px;color:#0a0a0a}
.plan-per{font-size:13px;color:#bbb;margin-right:4px}
.plan ul{list-style:none;padding:0;margin:20px 0}
.plan li{font-size:13px;color:#666;padding:6px 0;display:flex;align-items:center;gap:8px}
.plan li::before{content:'✓';color:var(--acc);font-weight:700;font-size:12px}
.plan-b{width:100%;padding:14px;border-radius:60px;border:none;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;transition:transform .15s,box-shadow .15s}
.plan-b:hover{transform:translateY(-1px)}
.plan-bf{background:#0a0a0a;color:#fff}
.plan-bf:hover{background:var(--acc);box-shadow:0 6px 20px rgba(99,102,241,.25)}
.plan-bg{background:#f5f5f5;color:#555}
.plan-bg:hover{background:#eee}

/* Reviews */
.revs{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:880px;margin:0 auto}
@media(max-width:700px){.revs{grid-template-columns:1fr}}
.rev{padding:28px;border-radius:18px;background:#fff;border:1px solid #f0f0f0}
.rev-stars{color:#fbbf24;font-size:12px;letter-spacing:2px;margin-bottom:12px}
.rev-txt{font-size:14px;line-height:1.75;color:#666;margin:0 0 16px}
.rev-a{display:flex;align-items:center;gap:10px}
.rev-av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--acc),#a855f7);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff}
.rev-n{font-size:13px;font-weight:600;color:#0a0a0a}
.rev-r{font-size:11px;color:#bbb}

/* Footer */
.ft{padding:28px;text-align:center;border-top:1px solid #f0f0f0}
.ft-links{display:flex;justify-content:center;gap:28px;margin-bottom:12px}
.ft-links a{font-size:12px;color:#bbb;text-decoration:none}
.ft-links a:hover{color:#666}
.ft-copy{font-size:11px;color:#ddd;margin:0}
      `}</style>

      {/* Nav */}
      <nav className="nav">
        <div className="nav-pill">
          <a href="/" className="logo">Pi<span>x</span>flow</a>
          <div className="nav-r">
            <a href="#how" className="nav-l">איך זה עובד</a>
            <a href="#pricing" className="nav-l">מחירים</a>
            <a href="/demo" className="nav-l">דמו</a>
            <button onClick={signInWithGoogle} className="nav-cta">התחברות</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <R><h1>סלפי אחד.<br />כל התמונות שלהם.</h1></R>
        <R d={80}><p>מעלים תמונות מהאירוע, האורחים עושים סלפי, ותוך שנייה הם מקבלים את כל התמונות שלהם. בלי אפליקציה.</p></R>
        <R d={160}>
          <div className="hero-btns">
            <button onClick={signInWithGoogle} className="btn-b">יאלה, מתחילים</button>
            <a href="/demo" className="btn-w">תנסו דמו חי</a>
          </div>
        </R>
        <R d={240}>
          <div className="hero-device" style={{
            transform: `scale(${heroScale})`,
            borderRadius: heroBorderRadius,
            overflow: 'hidden',
          }}>
            <HeroPhone />
          </div>
        </R>
      </section>

      {/* Stats */}
      <section>
        <R>
          <div className="stats">
            <div className="stat"><span className="stat-n">97%</span><span className="stat-l">דיוק זיהוי</span></div>
            <div className="stat"><span className="stat-n">2 שנ׳</span><span className="stat-l">זמן זיהוי ממוצע</span></div>
            <div className="stat"><span className="stat-n">0</span><span className="stat-l">אפליקציות להורדה</span></div>
          </div>
        </R>
      </section>

      {/* How it works */}
      <section id="how" className="sec">
        <div className="w">
          <R><h2 className="sec-t">שלושה שלבים. זהו.</h2></R>
          <R d={60}><p className="sec-s">פשוט עד שזה כמעט חשוד</p></R>
          <R d={120}>
            <div className="steps">
              <div className="step"><div className="step-n">01</div><h3>תעלו את התמונות</h3><p>סיימתם לצלם? מעלים הכל. אנחנו מטפלים בשאר.</p></div>
              <div className="step"><div className="step-n">02</div><h3>תשלחו לינק</h3><p>QR, ווטסאפ, SMS, מייל. האורחים לוחצים ומגיעים.</p></div>
              <div className="step"><div className="step-n">03</div><h3>סלפי = תמונות</h3><p>סלפי אחד מהטלפון, והמערכת מוצאת להם הכל.</p></div>
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
              { t: 'זיהוי ב-2 שניות', d: 'האורח עושה סלפי ומקבל תוצאות עוד לפני שהוריד את היד.' },
              { t: 'הלוגו שלך, הצבעים שלך', d: 'הגלריה נראית כאילו בנית אותה. הלקוח רואה רק אותך.' },
              { t: 'פרטיות ברמה אחרת', d: 'כל אורח רואה רק את שלו. הסלפי נמחק אחרי חיפוש. GDPR סגור.' },
              { t: 'אפס חיכוך', d: 'בלי אפליקציה, בלי הרשמה. לוחץ, סלפי, מקבל. זהו.' },
            ].map((f, i) => (
              <R key={i} d={i * 60}><div className="feat"><h3><span className="feat-dot" />{f.t}</h3><p>{f.d}</p></div></R>
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
                { n: 'מיכל ש.', r: 'צלמת חתונות · חיפה', t: 'הזיהוי עובד גם בתאורה של DJ בשעה 2 בלילה. ניסיתי שלושה מתחרים, אף אחד לא מתקרב.', i: 'מ' },
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
              <Faq q="כמה מדויק הזיהוי?" a="מעל 97%. עובד גם בתאורה חלשה, עם משקפיים, ובקבוצות גדולות." />
              <Faq q="האורחים צריכים להוריד משהו?" a="שום דבר. לינק, סלפי, תמונות. אפילו סבתא תצליח." />
              <Faq q="כמה תמונות אפשר להעלות?" a="ב-Essential עד 2,000. ב-Premium ו-Exclusive בלי הגבלה." />
              <Faq q="מה עם פרטיות?" a="כל אורח רואה רק את שלו. הסלפי נמחק אחרי הזיהוי. GDPR ✓" />
              <Faq q="אפשר לשים את הלוגו שלי?" a="ב-Premium ומעלה. לוגו, צבעים, טקסטים. הלקוח רואה רק אותך." />
              <Faq q="תוך כמה זמן הגלריה באוויר?" a="1,000 תמונות = 10-15 דקות. מרגע שסיימת להעלות, הגלריה מוכנה." />
            </div>
          </R>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: '60px 28px 100px', textAlign: 'center' }}>
        <R>
          <h2 style={{ fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, margin: '0 0 12px', letterSpacing: -.5 }}>מוכנים לשדרג את האירוע הבא?</h2>
          <p style={{ fontSize: 15, color: '#888', margin: '0 0 32px' }}>תנו לאורחים חוויה שהם ידברו עליה</p>
          <div className="hero-btns" style={{ justifyContent: 'center' }}>
            <button onClick={signInWithGoogle} className="btn-b">יאלה, בואו</button>
            <a href="/demo" className="btn-w">דמו קודם</a>
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
