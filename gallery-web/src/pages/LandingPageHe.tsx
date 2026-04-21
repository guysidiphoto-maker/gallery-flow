import { useState, useEffect, useRef, type ReactNode } from 'react'
import { signInWithGoogle } from '../lib/auth'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// ── Reveal ──────────────────────────────────────────────────────────────────
function R({ children, d = 0 }: { children: ReactNode; d?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    gsap.fromTo(el, { opacity: 0, y: 40 }, {
      opacity: 1, y: 0, duration: .8, delay: d / 1000,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    })
  }, [d])
  return <div ref={ref} style={{ opacity: 0 }}>{children}</div>
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

// ── Animated Phone ──────────────────────────────────────────────────────────
const LINES = ['רגע… מחפשים אותך', 'עוברים על התמונות 👀', 'יש מצב שתפסנו אותך…', 'עוד שנייה ויש לנו את זה']
function wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function HeroPhone() {
  const [step, setStep] = useState(0)
  const [line, setLine] = useState(0)

  useEffect(() => {
    let c = false
    const run = async () => {
      while (!c) {
        setStep(0); setLine(0); await wait(1800)
        if (c) return; setStep(1); await wait(2200)
        if (c) return; setStep(2); await wait(350)
        if (c) return; setStep(3)
        for (let i = 0; i < LINES.length; i++) { await wait(650); if (c) return; setLine(i + 1) }
        await wait(600); if (c) return
        setStep(4); await wait(3500)
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
          <div className="hp-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#6366f1" strokeWidth="1.5"><circle cx="12" cy="10" r="4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg></div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 4px' }}>מצא את התמונות שלך</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', margin: 0 }}>צלם סלפי כדי לקבל את כל התמונות שלך</p>
          <div className="hp-btn">בואו נתחיל</div>
        </div>
        {/* Camera */}
        <div className="hp-s" style={{ opacity: step === 1 ? 1 : 0 }}>
          <div className="hp-cam"><div className="hp-cam-p" /><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="1.2"><circle cx="12" cy="10" r="4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg></div>
          <div className="hp-shutter" />
        </div>
        {/* Flash */}
        <div className="hp-s" style={{ opacity: step === 2 ? 1 : 0, background: '#fff', transition: 'opacity .12s' }} />
        {/* Thinking */}
        <div className="hp-s" style={{ opacity: step === 3 ? 1 : 0 }}>
          <div className="hp-ring"><div className="hp-glow" /><div className="hp-av"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.5"><circle cx="12" cy="10" r="4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg></div></div>
          <div style={{ direction: 'rtl', marginTop: 6 }}>
            {LINES.map((t, i) => (
              <p key={i} style={{ fontSize: 10, margin: '2px 0', textAlign: 'center', opacity: i < line ? 1 : 0, transform: `translateY(${i < line ? 0 : 6}px)`, color: i === line - 1 ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.2)', fontWeight: i === line - 1 ? 600 : 400, transition: 'all .5s ease' }}>{t}</p>
            ))}
          </div>
        </div>
        {/* Found */}
        <div className="hp-s" style={{ opacity: step === 4 ? 1 : 0 }}>
          <div className="hp-check"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg></div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '0 0 2px' }}>מצאנו אותך</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', margin: '0 0 10px' }}>47 תמונות נמצאו</p>
          <div className="hp-grid">{[0,1,2,3,4,5,6,7,8].map(i => <div key={i} className="hp-thumb" style={{ animationDelay: `${i * .06}s` }} />)}</div>
        </div>
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────
export function LandingPageHe() {
  const [menu, setMenu] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)
  const phoneRef = useRef<HTMLDivElement>(null)
  const heroTextRef = useRef<HTMLDivElement>(null)

  // GSAP pinned hero scroll animation
  useEffect(() => {
    const ctx = gsap.context(() => {
      // Pin hero and scale down phone
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: heroRef.current,
          start: 'top top',
          end: '+=800',
          pin: true,
          scrub: 1,
        },
      })

      tl.to(phoneRef.current, {
        scale: 0.6,
        borderRadius: 32,
        y: 20,
        duration: 1,
        ease: 'none',
      }, 0)

      tl.to(heroTextRef.current, {
        opacity: 0,
        y: -60,
        duration: 0.6,
        ease: 'none',
      }, 0)
    })

    return () => ctx.revert()
  }, [])

  return (
    <div className="lp">
      <style>{`
.lp{--a:#6366f1;min-height:100vh;background:linear-gradient(180deg,#f3e8ff 0%,#fce7f3 30%,#fff1f5 55%,#fff 80%);color:#0a0a0a;font-family:'Inter',-apple-system,sans-serif;direction:rtl;overflow-x:hidden;-webkit-font-smoothing:antialiased}
.lp *{box-sizing:border-box}.lp a{color:inherit}
.w{max-width:1060px;margin:0 auto;padding:0 28px}

/* Nav */
.nav{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:100;width:calc(100% - 40px);max-width:700px}
.nav-pill{background:rgba(255,255,255,.8);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:60px;padding:8px 8px 8px 22px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 24px rgba(0,0,0,.05);border:1px solid rgba(0,0,0,.04)}
.logo{font-size:20px;font-weight:900;text-decoration:none;letter-spacing:-.5px;color:#0a0a0a}
.logo span{color:var(--a)}
.nav-r{display:flex;gap:2px;align-items:center}
.nav-l{padding:8px 14px;font-size:13px;font-weight:500;color:#888;text-decoration:none;border-radius:20px;transition:color .2s}
.nav-l:hover{color:#0a0a0a}
.nav-cta{padding:10px 24px;border-radius:60px;border:none;cursor:pointer;background:#0a0a0a;color:#fff;font-size:13px;font-weight:600;font-family:inherit;transition:background .2s,transform .15s}
.nav-cta:hover{background:var(--a);transform:scale(1.03)}
@media(max-width:640px){.nav-r .nav-l{display:none}}

/* Hero — pinned by GSAP */
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:100px 28px 40px;text-align:center;position:relative}
.hero h1{font-size:clamp(38px,7vw,76px);font-weight:900;line-height:.96;margin:0 0 22px;letter-spacing:-2.5px;color:#0a0a0a}
.hero-gr{background:linear-gradient(135deg,#6366f1,#a855f7,#ec4899);background-size:200% 200%;animation:gr 6s ease infinite;-webkit-background-clip:text;-webkit-text-fill-color:transparent}
@keyframes gr{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
.hero p{font-size:clamp(15px,2vw,19px);line-height:1.65;color:#666;max-width:440px;margin:0 auto 32px}
.hero-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:48px}
.btn-b{padding:16px 44px;border-radius:60px;border:none;cursor:pointer;background:#0a0a0a;color:#fff;font-size:17px;font-weight:700;font-family:inherit;transition:all .2s;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.btn-b:hover{background:var(--a);transform:translateY(-2px);box-shadow:0 8px 30px rgba(99,102,241,.25)}
.btn-w{padding:16px 44px;border-radius:60px;cursor:pointer;background:#fff;color:#0a0a0a;font-size:17px;font-weight:600;font-family:inherit;border:1px solid #e0e0e0;text-decoration:none;transition:all .2s}
.btn-w:hover{border-color:#999;transform:translateY(-2px)}

/* Phone */
.hp{width:280px;height:560px;border-radius:48px;background:#111;position:relative;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.2),0 0 0 1px rgba(0,0,0,.08);border:3px solid #222}
@media(max-width:640px){.hp{width:220px;height:440px;border-radius:38px}}
.hp-notch{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:90px;height:26px;border-radius:14px;background:#000;z-index:5}
.hp-scr{position:absolute;inset:3px;border-radius:44px;background:radial-gradient(ellipse at 50% 30%,#161624,#0b0b14);overflow:hidden}
.hp-s{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;transition:opacity .5s ease;padding:32px 24px}
.hp-icon{width:64px;height:64px;border-radius:50%;background:rgba(99,102,241,.08);border:1.5px solid rgba(99,102,241,.15);display:flex;align-items:center;justify-content:center;margin-bottom:8px}
.hp-btn{margin-top:16px;padding:12px 32px;border-radius:60px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:13px;font-weight:700}
.hp-cam{width:120px;height:120px;border-radius:50%;border:2px solid rgba(99,102,241,.2);display:flex;align-items:center;justify-content:center;position:relative}
.hp-cam-p{position:absolute;inset:-14px;border-radius:50%;border:1.5px solid rgba(99,102,241,.06);animation:pp 2.5s ease-in-out infinite}
@keyframes pp{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.1);opacity:.7}}
.hp-shutter{width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.9);border:3px solid rgba(99,102,241,.2);margin-top:12px}
.hp-ring{width:82px;height:82px;border-radius:50%;border:2px solid rgba(99,102,241,.35);display:flex;align-items:center;justify-content:center;position:relative;animation:sp 2.5s ease-in-out infinite}
@keyframes sp{0%,100%{box-shadow:0 0 16px rgba(99,102,241,.08)}50%{box-shadow:0 0 36px rgba(99,102,241,.22)}}
.hp-glow{position:absolute;inset:-16px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,.1) 0%,transparent 70%);animation:gb 2.5s ease-in-out infinite}
@keyframes gb{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.7;transform:scale(1.15)}}
.hp-av{width:100%;height:100%;border-radius:50%;background:rgba(99,102,241,.05);display:flex;align-items:center;justify-content:center}
.hp-check{width:44px;height:44px;border-radius:50%;background:rgba(34,197,94,.08);border:2px solid rgba(34,197,94,.25);display:flex;align-items:center;justify-content:center;margin-bottom:6px;animation:pi .5s cubic-bezier(.16,1,.3,1) both}
@keyframes pi{0%{transform:scale(0)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
.hp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;width:130px}
.hp-thumb{aspect-ratio:1;border-radius:6px;background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(168,85,247,.08));animation:ti .3s ease both}
@keyframes ti{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1}}

/* Stats */
.stats{display:flex;justify-content:center;gap:80px;padding:80px 28px;flex-wrap:wrap}
@media(max-width:500px){.stats{gap:40px}}
.stat{text-align:center}
.stat-n{font-size:52px;font-weight:900;letter-spacing:-1.5px;display:block;color:#0a0a0a}
.stat-l{font-size:13px;color:#aaa;margin-top:4px}

/* Section */
.sec{padding:100px 28px}
.sec-t{font-size:clamp(28px,4.5vw,46px);font-weight:800;text-align:center;margin:0 0 12px;letter-spacing:-1px;color:#0a0a0a}
.sec-s{font-size:15px;color:#999;text-align:center;margin:0 auto 52px;max-width:380px;line-height:1.7}

/* Steps */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:860px;margin:0 auto}
@media(max-width:700px){.steps{grid-template-columns:1fr;max-width:400px}}
.step{padding:40px 28px;border-radius:24px;background:#fff;border:1px solid #f0f0f0;transition:transform .3s,box-shadow .3s}
.step:hover{transform:translateY(-6px);box-shadow:0 16px 40px rgba(0,0,0,.06)}
.step-n{font-size:56px;font-weight:900;background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(168,85,247,.08));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;margin-bottom:18px}
.step h3{font-size:17px;font-weight:700;margin:0 0 8px;color:#0a0a0a}
.step p{font-size:14px;line-height:1.7;color:#999;margin:0}

/* Features */
.feats{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;max-width:700px;margin:0 auto}
@media(max-width:600px){.feats{grid-template-columns:1fr}}
.feat{padding:32px 28px;border-radius:20px;background:#fff;border:1px solid #f0f0f0;transition:transform .3s,box-shadow .3s}
.feat:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,.05)}
.feat h3{font-size:16px;font-weight:700;margin:0 0 8px;color:#0a0a0a;display:flex;align-items:center;gap:10px}
.feat-d{width:8px;height:8px;border-radius:50%;background:var(--a);flex-shrink:0}
.feat p{font-size:14px;line-height:1.7;color:#999;margin:0;padding-right:18px}

/* Pricing */
.plans{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:900px;margin:0 auto}
@media(max-width:760px){.plans{grid-template-columns:1fr;max-width:380px}}
.plan{padding:40px 28px;border-radius:24px;background:#fff;border:1px solid #f0f0f0;position:relative;transition:transform .3s,box-shadow .3s}
.plan:hover{transform:translateY(-6px);box-shadow:0 16px 40px rgba(0,0,0,.06)}
.plan--p{border-color:var(--a);box-shadow:0 0 0 1px var(--a),0 8px 32px rgba(99,102,241,.08)}
.plan-badge{position:absolute;top:-13px;left:50%;transform:translateX(-50%);padding:5px 18px;border-radius:60px;font-size:11px;font-weight:700;background:var(--a);color:#fff;white-space:nowrap}
.plan h3{font-size:14px;font-weight:600;color:#aaa;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px}
.plan-price{font-size:48px;font-weight:900;letter-spacing:-1.5px;color:#0a0a0a}
.plan-per{font-size:14px;color:#ccc;margin-right:4px}
.plan ul{list-style:none;padding:0;margin:24px 0}
.plan li{font-size:14px;color:#666;padding:7px 0;display:flex;align-items:center;gap:10px}
.plan li::before{content:'✓';color:var(--a);font-weight:700;font-size:13px}
.plan-b{width:100%;padding:15px;border-radius:60px;border:none;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;transition:all .2s}
.plan-b:hover{transform:translateY(-1px)}
.plan-bf{background:#0a0a0a;color:#fff}.plan-bf:hover{background:var(--a);box-shadow:0 6px 20px rgba(99,102,241,.2)}
.plan-bg{background:#f5f5f5;color:#555}.plan-bg:hover{background:#eee}

/* Reviews */
.revs{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:900px;margin:0 auto}
@media(max-width:700px){.revs{grid-template-columns:1fr}}
.rev{padding:32px;border-radius:20px;background:#fff;border:1px solid #f0f0f0;transition:transform .3s}
.rev:hover{transform:translateY(-3px)}
.rev-stars{color:#fbbf24;font-size:13px;letter-spacing:2px;margin-bottom:14px}
.rev-txt{font-size:14px;line-height:1.8;color:#666;margin:0 0 18px}
.rev-a{display:flex;align-items:center;gap:10px}
.rev-av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--a),#a855f7);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff}
.rev-n{font-size:13px;font-weight:600;color:#0a0a0a}
.rev-r{font-size:11px;color:#bbb}

/* Footer */
.ft{padding:32px;text-align:center;border-top:1px solid #f0f0f0}
.ft-links{display:flex;justify-content:center;gap:28px;margin-bottom:12px}
.ft-links a{font-size:12px;color:#ccc;text-decoration:none}.ft-links a:hover{color:#666}
.ft-copy{font-size:11px;color:#e0e0e0;margin:0}
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

      {/* Hero — pinned, phone scales down on scroll */}
      <section className="hero" ref={heroRef}>
        <div ref={heroTextRef}>
          <h1>סלפי אחד.<br /><span className="hero-gr">כל התמונות שלהם.</span></h1>
          <p>מעלים תמונות מהאירוע, האורחים עושים סלפי, ותוך שנייה כל התמונות שלהם אצלם. בלי אפליקציה.</p>
          <div className="hero-btns">
            <button onClick={signInWithGoogle} className="btn-b">יאלה, מתחילים</button>
            <a href="/demo" className="btn-w">תנסו דמו חי</a>
          </div>
        </div>
        <div ref={phoneRef}>
          <HeroPhone />
        </div>
      </section>

      {/* Stats */}
      <section>
        <div className="stats">
          {[
            { n: '97%', l: 'דיוק זיהוי' },
            { n: '2 שנ׳', l: 'זמן זיהוי ממוצע' },
            { n: '0', l: 'אפליקציות להורדה' },
          ].map((s, i) => (
            <R key={i} d={i * 100}><div className="stat"><span className="stat-n">{s.n}</span><span className="stat-l">{s.l}</span></div></R>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="sec">
        <div className="w">
          <R><h2 className="sec-t">שלושה שלבים. זהו.</h2></R>
          <R d={60}><p className="sec-s">פשוט עד שזה כמעט חשוד</p></R>
          <div className="steps">
            {[
              { n: '01', t: 'תעלו את התמונות', d: 'סיימתם לצלם? מעלים הכל. אנחנו מטפלים בשאר.' },
              { n: '02', t: 'תשלחו לינק', d: 'QR, ווטסאפ, SMS, מייל. האורחים לוחצים ומגיעים.' },
              { n: '03', t: 'סלפי = תמונות', d: 'סלפי אחד מהטלפון, והמערכת מוצאת להם הכל.' },
            ].map((s, i) => (
              <R key={i} d={i * 100}><div className="step"><div className="step-n">{s.n}</div><h3>{s.t}</h3><p>{s.d}</p></div></R>
            ))}
          </div>
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
              { t: 'פרטיות ברמה אחרת', d: 'כל אורח רואה רק את שלו. הסלפי נמחק אחרי חיפוש.' },
              { t: 'אפס חיכוך', d: 'בלי אפליקציה, בלי הרשמה. לוחץ, סלפי, מקבל. זהו.' },
            ].map((f, i) => (
              <R key={i} d={i * 80}><div className="feat"><h3><span className="feat-d" />{f.t}</h3><p>{f.d}</p></div></R>
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
              <div className="plan"><h3>Essential</h3><div><span className="plan-price">₪599</span><span className="plan-per">/אירוע</span></div><ul><li>עד 2,000 תמונות</li><li>זיהוי פנים AI</li><li>שאלון ללקוח</li><li>שיתוף QR + לינק</li><li>3 חודשי אחסון</li></ul><button onClick={signInWithGoogle} className="plan-b plan-bg">להתחיל</button></div>
              <div className="plan plan--p"><div className="plan-badge">הכי נבחר</div><h3>Premium</h3><div><span className="plan-price">₪799</span><span className="plan-per">/אירוע</span></div><ul><li>ללא הגבלת תמונות</li><li>זיהוי פנים AI</li><li>מיתוג מלא</li><li>SMS + מייל אוטומטי</li><li>שאלון מותאם</li><li>6 חודשי אחסון</li></ul><button onClick={signInWithGoogle} className="plan-b plan-bf">להתחיל</button></div>
              <div className="plan"><h3>Exclusive</h3><div><span className="plan-price">₪1,199</span><span className="plan-per">/אירוע</span></div><ul><li>הכל מ-Premium</li><li>עיצוב גלריה VIP</li><li>מסך לייב באירוע</li><li>שנה אחסון</li><li>תמיכה VIP</li></ul><button onClick={signInWithGoogle} className="plan-b plan-bg">להתחיל</button></div>
            </div>
          </R>
        </div>
      </section>

      {/* Reviews */}
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
                  <div className="rev"><div className="rev-stars">★★★★★</div><p className="rev-txt">{rv.t}</p><div className="rev-a"><div className="rev-av">{rv.i}</div><div><div className="rev-n">{rv.n}</div><div className="rev-r">{rv.r}</div></div></div></div>
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

      {/* CTA */}
      <section style={{ padding: '60px 28px 100px', textAlign: 'center' }}>
        <R>
          <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, margin: '0 0 12px', letterSpacing: -.8 }}>מוכנים לשדרג את האירוע הבא?</h2>
          <p style={{ fontSize: 15, color: '#999', margin: '0 0 32px' }}>תנו לאורחים חוויה שהם ידברו עליה</p>
          <div className="hero-btns" style={{ justifyContent: 'center' }}>
            <button onClick={signInWithGoogle} className="btn-b">יאלה, בואו</button>
            <a href="/demo" className="btn-w">דמו קודם</a>
          </div>
        </R>
      </section>

      {/* Footer */}
      <footer className="ft">
        <div className="ft-links"><a href="/terms">תנאי שימוש</a><a href="/privacy">פרטיות</a><a href="mailto:support@pixflow-ai.com">צור קשר</a></div>
        <p className="ft-copy">Pixflow AI by Eclipse Media &copy; 2026</p>
      </footer>
    </div>
  )
}
