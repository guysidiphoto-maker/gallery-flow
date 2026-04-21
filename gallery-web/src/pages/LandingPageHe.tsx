import { useState, useEffect, useRef, type ReactNode } from 'react'
import { signInWithGoogle } from '../lib/auth'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// ── Reveal ──
function R({ children, d = 0 }: { children: ReactNode; d?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    gsap.fromTo(el, { opacity: 0, y: 36 }, {
      opacity: 1, y: 0, duration: .9, delay: d / 1000, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    })
  }, [d])
  return <div ref={ref} style={{ opacity: 0 }}>{children}</div>
}

// ── FAQ ──
function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid #eee' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', padding: '22px 0', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#0a0a0a', fontSize: 16, fontWeight: 600, fontFamily: 'inherit', textAlign: 'right' }}>
        <span>{q}</span>
        <span className={`faq-chev ${open ? 'faq-chev--open' : ''}`}>‹</span>
      </button>
      <div style={{ maxHeight: open ? 200 : 0, overflow: 'hidden', transition: 'max-height .3s ease' }}>
        <p style={{ fontSize: 15, lineHeight: 1.8, color: '#777', margin: 0, padding: '0 0 20px' }}>{a}</p>
      </div>
    </div>
  )
}

// ── Hero "Video" — Full-screen animated demo ──
const LINES = ['רגע… מחפשים אותך', 'עוברים על התמונות 👀', 'יש מצב שתפסנו אותך…', 'עוד שנייה ויש לנו את זה']
function w(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function HeroDemo() {
  const [step, setStep] = useState(0) // 0=welcome 1=cam 2=flash 3=think 4=found
  const [line, setLine] = useState(0)
  const [thumbs, setThumbs] = useState(0)

  useEffect(() => {
    let c = false
    const run = async () => {
      while (!c) {
        setStep(0); setLine(0); setThumbs(0); await w(2000)
        if (c) return; setStep(1); await w(2500)
        if (c) return; setStep(2); await w(300)
        if (c) return; setStep(3)
        for (let i = 0; i < 4; i++) { await w(600); if (c) return; setLine(i + 1) }
        await w(500); if (c) return
        setStep(4)
        for (let i = 0; i < 12; i++) { await w(80); if (c) return; setThumbs(i + 1) }
        await w(3000)
      }
    }
    run(); return () => { c = true }
  }, [])

  return (
    <div className="demo">
      {/* Welcome */}
      <div className="demo-s" style={{ opacity: step === 0 ? 1 : 0 }}>
        <div className="demo-face-ring">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1.2"><circle cx="12" cy="10" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
        </div>
        <p className="demo-title">מצא את התמונות שלך</p>
        <p className="demo-sub">צלם סלפי וקבל את כל התמונות שלך מהאירוע</p>
        <div className="demo-cta-pill">בואו נתחיל</div>
      </div>

      {/* Camera */}
      <div className="demo-s" style={{ opacity: step === 1 ? 1 : 0 }}>
        <div className="demo-viewfinder">
          <div className="demo-vf-pulse" />
          <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1"><circle cx="12" cy="10" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
        </div>
        <div className="demo-shutter"><div className="demo-shutter-inner" /></div>
        <p className="demo-hint">צלם סלפי</p>
      </div>

      {/* Flash */}
      <div className="demo-s" style={{ opacity: step === 2 ? 1 : 0, background: 'rgba(255,255,255,.95)', transition: 'opacity .1s' }} />

      {/* Thinking */}
      <div className="demo-s" style={{ opacity: step === 3 ? 1 : 0 }}>
        <div className="demo-selfie-orb">
          <div className="demo-selfie-glow" />
          <div className="demo-selfie-face">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.3"><circle cx="12" cy="10" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
          </div>
        </div>
        <div className="demo-lines">
          {LINES.map((t, i) => (
            <p key={i} className="demo-line" style={{
              opacity: i < line ? 1 : 0,
              transform: `translateY(${i < line ? 0 : 10}px)`,
              color: i === line - 1 ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.25)',
              fontWeight: i === line - 1 ? 600 : 400,
            }}>{t}</p>
          ))}
        </div>
      </div>

      {/* Found */}
      <div className="demo-s" style={{ opacity: step === 4 ? 1 : 0 }}>
        <div className="demo-success">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p className="demo-found-title">מצאנו אותך</p>
        <p className="demo-found-count">47 תמונות נמצאו</p>
        <div className="demo-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="demo-thumb" style={{
              opacity: i < thumbs ? 1 : 0,
              transform: `scale(${i < thumbs ? 1 : 0})`,
              transitionDelay: `${i * 30}ms`,
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main ──
export function LandingPageHe() {
  const [menu, setMenu] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mm = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mm.matches) return

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: heroRef.current,
          start: 'top top',
          end: '+=150%',
          pin: true,
          scrub: 1.2,
        },
      })
      tl.to(videoRef.current, { scale: 0.45, borderRadius: 28, duration: 1, ease: 'none' }, 0)
      tl.to(overlayRef.current, { opacity: 0, duration: .5, ease: 'none' }, 0)
    })
    return () => ctx.revert()
  }, [])

  return (
    <div className="lp">
      <style>{`
.lp{--a:#6366f1;min-height:100vh;color:#0a0a0a;font-family:'Heebo','Rubik','Assistant','Arial Hebrew',Arial,sans-serif;direction:rtl;overflow-x:hidden;-webkit-font-smoothing:antialiased}
.lp *{box-sizing:border-box}.lp a{color:inherit}
.wr{max-width:1060px;margin:0 auto;padding:0 28px}
.num{unicode-bidi:isolate;direction:ltr;display:inline-block}

/* Nav */
.nv{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:200;width:calc(100% - 40px);max-width:680px}
.nv-p{background:rgba(255,255,255,.78);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-radius:60px;padding:8px 24px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 20px rgba(0,0,0,.06);border:1px solid rgba(0,0,0,.04)}
.nv-logo{font-size:19px;font-weight:800;text-decoration:none;letter-spacing:0;color:#0a0a0a}
.nv-logo span{color:var(--a)}
.nv-links{display:flex;gap:4px;align-items:center}
.nv-l{padding:8px 14px;font-size:13px;font-weight:500;color:#888;text-decoration:none;transition:color .2s}
.nv-l:hover{color:#0a0a0a}
@media(max-width:580px){.nv-links .nv-l:not(:last-child){display:none}}

/* Hero */
.hero{height:100vh;position:relative;background:#000}
.hero-video{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;will-change:transform}
.hero-overlay{position:absolute;inset:0;background:rgba(0,0,0,.4);z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:100px 28px 40px}
.hero h1{font-size:clamp(36px,7vw,64px);font-weight:800;line-height:1.15;margin:0 0 18px;letter-spacing:-0.5px;color:#fff;unicode-bidi:plaintext}
.hero-sub{font-size:clamp(15px,2vw,19px);line-height:1.65;color:rgba(255,255,255,.55);max-width:420px;margin:0 auto 36px}
.hero-cta{padding:16px 40px;border-radius:60px;border:none;cursor:pointer;background:#fff;color:#0a0a0a;font-size:16px;font-weight:700;font-family:inherit;transition:transform .2s,box-shadow .2s}
.hero-cta:hover{transform:scale(1.04);box-shadow:0 8px 32px rgba(255,255,255,.15)}

/* Demo "video" */
.demo{width:100%;height:100%;position:relative}
.demo-s{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;transition:opacity .6s ease;padding:40px}
.demo-face-ring{width:100px;height:100px;border-radius:50%;border:2px solid rgba(99,102,241,.2);display:flex;align-items:center;justify-content:center}
.demo-title{font-size:22px;font-weight:700;color:#fff;margin:12px 0 4px}
.demo-sub{font-size:14px;color:rgba(255,255,255,.35);margin:0}
.demo-cta-pill{margin-top:20px;padding:14px 40px;border-radius:60px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:15px;font-weight:700}
.demo-viewfinder{width:180px;height:180px;border-radius:50%;border:3px solid rgba(99,102,241,.25);display:flex;align-items:center;justify-content:center;position:relative}
.demo-vf-pulse{position:absolute;inset:-18px;border-radius:50%;border:2px solid rgba(99,102,241,.06);animation:vfp 3s ease-in-out infinite}
@keyframes vfp{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.08);opacity:.7}}
.demo-shutter{width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,.12);border:3px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;margin-top:24px;cursor:pointer}
.demo-shutter-inner{width:54px;height:54px;border-radius:50%;background:#fff}
.demo-hint{font-size:13px;color:rgba(255,255,255,.3);margin:12px 0 0}
.demo-selfie-orb{width:120px;height:120px;border-radius:50%;border:2.5px solid rgba(99,102,241,.35);display:flex;align-items:center;justify-content:center;position:relative;animation:orb 3s ease-in-out infinite}
@keyframes orb{0%,100%{box-shadow:0 0 20px rgba(99,102,241,.08)}50%{box-shadow:0 0 50px rgba(99,102,241,.2)}}
.demo-selfie-glow{position:absolute;inset:-20px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,.1) 0%,transparent 70%);animation:gl 3s ease-in-out infinite}
@keyframes gl{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.8;transform:scale(1.15)}}
.demo-selfie-face{width:100%;height:100%;border-radius:50%;background:rgba(99,102,241,.04);display:flex;align-items:center;justify-content:center}
.demo-lines{direction:rtl;margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:4px}
.demo-line{font-size:15px;margin:0;text-align:center;transition:all .5s cubic-bezier(.16,1,.3,1)}
.demo-success{width:56px;height:56px;border-radius:50%;background:rgba(34,197,94,.08);border:2px solid rgba(34,197,94,.25);display:flex;align-items:center;justify-content:center;animation:pop .5s cubic-bezier(.16,1,.3,1) both}
@keyframes pop{0%{transform:scale(0)}60%{transform:scale(1.2)}100%{transform:scale(1)}}
.demo-found-title{font-size:26px;font-weight:800;color:#fff;margin:10px 0 2px}
.demo-found-count{font-size:14px;color:rgba(255,255,255,.4);margin:0 0 16px}
.demo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;width:220px}
.demo-thumb{aspect-ratio:1;border-radius:8px;background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(168,85,247,.08));transition:all .3s cubic-bezier(.16,1,.3,1)}

/* After hero — gradient bg */
.after-hero{background:linear-gradient(180deg,#f3e8ff 0%,#fce7f3 30%,#fff1f5 55%,#fff 80%)}

/* Stats */
.stats{display:flex;justify-content:center;gap:80px;padding:100px 28px 80px;flex-wrap:wrap;scroll-margin-top:80px}
@media(max-width:500px){.stats{gap:40px;padding:60px 20px}}
.stat{text-align:center}
.stat-n{font-size:48px;font-weight:800;letter-spacing:-0.5px;display:block;color:#0a0a0a}
.stat-l{font-size:14px;color:#999;margin-top:6px}

/* Section */
.sec{padding:100px 28px;scroll-margin-top:80px}
.sec-t{font-size:clamp(26px,4vw,40px);font-weight:800;text-align:center;margin:0 0 12px;letter-spacing:0;color:#0a0a0a}
.sec-s{font-size:16px;color:#999;text-align:center;margin:0 auto 52px;max-width:400px;line-height:1.7}

/* Steps */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;max-width:880px;margin:0 auto}
@media(max-width:700px){.steps{grid-template-columns:1fr;max-width:400px}}
.step{padding:44px 32px;border-radius:24px;background:#fff;border:1px solid rgba(0,0,0,.04);transition:transform .3s,box-shadow .3s}
.step:hover{transform:translateY(-6px);box-shadow:0 20px 48px rgba(0,0,0,.06)}
.step-n{font-size:48px;font-weight:800;color:rgba(0,0,0,.05);line-height:1;margin-bottom:20px;unicode-bidi:isolate;direction:ltr;display:inline-block}
.step h3{font-size:18px;font-weight:700;margin:0 0 10px;color:#0a0a0a;letter-spacing:0}
.step p{font-size:15px;line-height:1.7;color:#888;margin:0}

/* Features */
.feats{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;max-width:720px;margin:0 auto}
@media(max-width:600px){.feats{grid-template-columns:1fr}}
.feat{padding:32px 28px;border-radius:20px;background:#fff;border:1px solid rgba(0,0,0,.04);transition:transform .3s,box-shadow .3s}
.feat:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,.04)}
.feat h3{font-size:16px;font-weight:700;margin:0 0 8px;color:#0a0a0a;display:flex;align-items:center;gap:10px;letter-spacing:0}
.feat-d{width:8px;height:8px;border-radius:50%;background:var(--a);flex-shrink:0}
.feat p{font-size:15px;line-height:1.7;color:#888;margin:0;padding-inline-start:18px}

/* Pricing */
.plans{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:920px;margin:0 auto}
@media(max-width:760px){.plans{grid-template-columns:1fr;max-width:380px}}
.plan{padding:44px 32px;border-radius:24px;background:#fff;border:1px solid rgba(0,0,0,.04);position:relative;transition:transform .3s,box-shadow .3s}
.plan:hover{transform:translateY(-6px);box-shadow:0 20px 48px rgba(0,0,0,.06)}
.plan--p{border:2px solid var(--a);box-shadow:0 0 0 0 transparent}
.plan--p:hover{box-shadow:0 20px 48px rgba(99,102,241,.1)}
.plan-badge{position:absolute;top:-13px;left:50%;transform:translateX(-50%);padding:5px 20px;border-radius:60px;font-size:11px;font-weight:700;background:var(--a);color:#fff}
.plan h3{font-size:13px;font-weight:600;color:#bbb;margin:0 0 16px;text-transform:uppercase;letter-spacing:1.5px}
.plan-price{font-size:44px;font-weight:800;letter-spacing:-0.5px;color:#0a0a0a;unicode-bidi:isolate;direction:ltr;display:inline-block}
.plan-per{font-size:14px;color:#ccc;margin-inline-start:4px}
.plan ul{list-style:none;padding:0;margin:24px 0 28px}
.plan li{font-size:15px;color:#777;padding:7px 0;display:flex;align-items:center;gap:10px}
.plan li::before{content:'✓';color:var(--a);font-weight:700}
.plan-b{width:100%;padding:16px;border-radius:60px;border:none;cursor:pointer;font-size:16px;font-weight:700;font-family:inherit;transition:all .2s}
.plan-b:hover{transform:translateY(-1px)}
.plan-bf{background:#0a0a0a;color:#fff}.plan-bf:hover{background:var(--a);box-shadow:0 6px 20px rgba(99,102,241,.2)}
.plan-bg{background:#f7f7f7;color:#666}.plan-bg:hover{background:#eee}

/* Reviews */
.revs{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:920px;margin:0 auto}
@media(max-width:700px){.revs{grid-template-columns:1fr}}
.rev{padding:32px;border-radius:20px;background:#fff;border:1px solid rgba(0,0,0,.04)}
.rev-stars{color:#fbbf24;font-size:14px;letter-spacing:2px;margin-bottom:14px;direction:ltr;unicode-bidi:isolate}
.rev-txt{font-size:15px;line-height:1.8;color:#777;margin:0 0 20px}
.rev-a{display:flex;align-items:center;gap:10px}
.rev-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--a),#a855f7);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff}
.rev-n{font-size:14px;font-weight:600;color:#0a0a0a}
.rev-r{font-size:12px;color:#aaa}

/* FAQ chevron */
.faq-chev{font-size:18px;color:#ccc;transition:transform .25s ease;margin-inline-start:auto;flex-shrink:0}
.faq-chev--open{transform:rotate(90deg)}

/* Footer */
.ft{padding:32px;text-align:center;border-top:1px solid #f0f0f0}
.ft-links{display:flex;justify-content:center;gap:28px;margin-bottom:12px}
.ft-links a{font-size:14px;color:#aaa;text-decoration:none}.ft-links a:hover{color:#666}
.ft-copy{font-size:13px;color:#ccc;margin:0}
      `}</style>

      {/* Nav */}
      <nav className="nv">
        <div className="nv-p">
          <a href="/" className="nv-logo">Pi<span>x</span>flow</a>
          <div className="nv-links">
            <a href="#how" className="nv-l">איך זה עובד</a>
            <a href="#pricing" className="nv-l">מחירים</a>
            <a href="/demo" className="nv-l">דמו</a>
            <a href="#" onClick={(e) => { e.preventDefault(); signInWithGoogle() }} className="nv-l">התחברות</a>
          </div>
        </div>
      </nav>

      {/* Hero — dark full-screen with animated demo */}
      <section className="hero" ref={heroRef}>
        <div className="hero-video" ref={videoRef}>
          <HeroDemo />
        </div>
        <div className="hero-overlay" ref={overlayRef}>
          <h1 dir="rtl" lang="he">סלפי אחד<br/>כל התמונות שלהם</h1>
          <p className="hero-sub">מעלים תמונות מהאירוע, האורחים עושים סלפי, ותוך שנייה כל התמונות אצלם.</p>
          <button onClick={signInWithGoogle} className="hero-cta">התחילו בחינם</button>
        </div>
      </section>

      {/* Everything after hero — gradient bg */}
      <div className="after-hero">

        {/* Stats */}
        <section>
          <div className="stats">
            {[{ n: '10K+', l: 'תמונות עובדו' }, { n: '2 שנ׳', l: 'זמן זיהוי ממוצע' }, { n: '97%', l: 'דיוק זיהוי' }].map((s, i) => (
              <R key={i} d={i * 100}><div className="stat"><span className="stat-n num">{s.n}</span><span className="stat-l">{s.l}</span></div></R>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="sec">
          <div className="wr">
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
          <div className="wr">
            <R><h2 className="sec-t">למה צלמים עוברים אלינו</h2></R>
            <R d={60}><p className="sec-s">לא סתם עוד גלריה אונליין</p></R>
            <div className="feats">
              {[
                { t: 'זיהוי ב-2 שניות', d: 'האורח עושה סלפי ומקבל תוצאות מיידיות.' },
                { t: 'המיתוג שלך', d: 'לוגו, צבעים, טקסטים. הלקוח רואה רק אותך.' },
                { t: 'פרטיות מלאה', d: 'כל אורח רואה רק את שלו. סלפי נמחק אחרי חיפוש.' },
                { t: 'בלי אפליקציה', d: 'עובד מהדפדפן. בלי הורדות, בלי רישום.' },
              ].map((f, i) => (
                <R key={i} d={i * 80}><div className="feat"><h3><span className="feat-d" />{f.t}</h3><p>{f.d}</p></div></R>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="sec">
          <div className="wr">
            <R><h2 className="sec-t">תמחור</h2></R>
            <R d={60}><p className="sec-s">חד פעמי לאירוע. בלי מנויים.</p></R>
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
          <div className="wr">
            <R><h2 className="sec-t">צלמים מדברים</h2></R>
            <R d={80}>
              <div className="revs">
                {[
                  { n: 'דניאל כ.', r: 'צלם אירועים · ת״א', t: 'האורחים מקבלים תמונות עוד באירוע ושולחים סטוריז. שיווק חינם.', i: 'ד' },
                  { n: 'מיכל ש.', r: 'צלמת חתונות · חיפה', t: 'הזיהוי עובד גם בתאורה של DJ בשעה 2 בלילה. ניסיתי מתחרים, אף אחד לא מתקרב.', i: 'מ' },
                  { n: 'עומר א.', r: 'מפיק אירועים · י-ם', t: 'הלקוחות שלי לא מורידים אפליקציות. Pixflow עובד מהדפדפן ובזה סגרו אותי.', i: 'ע' },
                ].map((rv, i) => (
                  <R key={i} d={i * 80}><div className="rev"><div className="rev-stars">★★★★★</div><p className="rev-txt">{rv.t}</p><div className="rev-a"><div className="rev-av">{rv.i}</div><div><div className="rev-n">{rv.n}</div><div className="rev-r">{rv.r}</div></div></div></div></R>
                ))}
              </div>
            </R>
          </div>
        </section>

        {/* FAQ */}
        <section className="sec">
          <div className="wr" style={{ maxWidth: 600 }}>
            <R><h2 className="sec-t">שאלות נפוצות</h2></R>
            <R d={60}>
              <div>
                <Faq q="כמה מדויק הזיהוי?" a="מעל 97%. עובד בתאורה חלשה, עם משקפיים, ובקבוצות גדולות." />
                <Faq q="האורחים צריכים להוריד משהו?" a="לא. לינק, סלפי, תמונות. זהו." />
                <Faq q="כמה תמונות אפשר להעלות?" a="ב-Essential עד 2,000. ב-Premium ו-Exclusive בלי הגבלה." />
                <Faq q="מה עם פרטיות?" a="כל אורח רואה רק את שלו. הסלפי נמחק אחרי הזיהוי." />
                <Faq q="אפשר לשים את הלוגו שלי?" a="ב-Premium ומעלה. לוגו, צבעים, טקסטים." />
              </div>
            </R>
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: '60px 28px 120px', textAlign: 'center' }}>
          <R>
            <h2 style={{ fontSize: 'clamp(26px,4vw,42px)', fontWeight: 800, margin: '0 0 14px', letterSpacing: -1 }}>מוכנים לשדרג את האירוע הבא?</h2>
            <p style={{ fontSize: 15, color: '#999', margin: '0 0 32px' }}>תנו לאורחים חוויה שהם ידברו עליה</p>
            <button onClick={signInWithGoogle} className="hero-cta" style={{ background: '#0a0a0a', color: '#fff' }}>התחילו בחינם</button>
          </R>
        </section>

        {/* Footer */}
        <footer className="ft">
          <div className="ft-links"><a href="/terms">תנאי שימוש</a><a href="/privacy">פרטיות</a><a href="mailto:support@pixflow-ai.com">צור קשר</a></div>
          <p className="ft-copy">Pixflow AI by Eclipse Media &copy; 2026</p>
        </footer>
      </div>
    </div>
  )
}
