import { useState, useEffect, useRef, useCallback } from 'react'
import { signInWithGoogle } from '../lib/auth'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/* ═══════════════════════════════════════════════════════════════════
   PHONE DEMO — plays automatically, cycles through the guest flow
   ═══════════════════════════════════════════════════════════════════ */
function PhoneDemo({ active }: { active: boolean }) {
  const [step, setStep] = useState(0) // 0 idle, 1 cam, 2 flash, 3 search, 4 found
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
      {/* idle */}
      <div className="pd-s" style={{ opacity: step === 0 ? 1 : 0 }}>
        <div className="pd-ring">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.2"><circle cx="12" cy="10" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
        </div>
        <p className="pd-t">מצא את התמונות שלך</p>
        <p className="pd-sub2">סלפי אחד וזהו</p>
        <div className="pd-pill">בוא נתחיל</div>
      </div>
      {/* camera */}
      <div className="pd-s" style={{ opacity: step === 1 ? 1 : 0 }}>
        <div className="pd-cam"><div className="pd-cam-p" />
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1"><circle cx="12" cy="10" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
        </div>
        <div className="pd-shutter"><div className="pd-shutter-in" /></div>
      </div>
      {/* flash */}
      <div className="pd-s" style={{ opacity: step === 2 ? 1 : 0, background: 'rgba(255,255,255,.9)', transition: 'opacity .08s' }} />
      {/* searching */}
      <div className="pd-s" style={{ opacity: step === 3 ? 1 : 0 }}>
        <div className="pd-orb">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.3"><circle cx="12" cy="10" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
        </div>
        <div className="pd-lines">{MSGS.map((t, i) => (
          <p key={i} style={{
            opacity: i < line ? 1 : 0,
            transform: `translateY(${i < line ? 0 : 6}px)`,
            color: i === line - 1 ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.12)',
            fontWeight: i === line - 1 ? 600 : 400,
            fontSize: 11, margin: 0, textAlign: 'center',
            transition: 'all .45s cubic-bezier(.16,1,.3,1)',
          }}>{t}</p>
        ))}</div>
      </div>
      {/* found */}
      <div className="pd-s" style={{ opacity: step === 4 ? 1 : 0 }}>
        <div className="pd-ok"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '5px 0 1px' }}>מצאנו אותך</p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', margin: '0 0 8px' }}>47 תמונות</p>
        <div className="pd-grid">{Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="pd-thumb" style={{ opacity: i < thumbs ? 1 : 0, transform: `scale(${i < thumbs ? 1 : 0})`, transitionDelay: `${i * 22}ms` }} />
        ))}</div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   FAQ
   ═══════════════════════════════════════════════════════════════════ */
function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="fq-item">
      <button onClick={() => setOpen(!open)} className="fq-q">
        <span>{q}</span><span className={`fq-c ${open ? 'fq-c--o' : ''}`}>‹</span>
      </button>
      <div style={{ maxHeight: open ? 200 : 0, overflow: 'hidden', transition: 'max-height .3s ease' }}>
        <p className="fq-a">{a}</p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export function LandingPageHe() {
  const [live, setLive] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const phoneRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const tlRef = useRef<HTMLDivElement>(null)

  /* Toggle handler */
  const handleToggle = useCallback(() => {
    setLive(prev => {
      const next = !prev
      if (next && phoneRef.current) {
        gsap.fromTo(phoneRef.current,
          { scale: 0.95 },
          { scale: 1, duration: 0.6, ease: 'elastic.out(1.2, 0.5)' }
        )
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {

      /* Hero → phone shrinks + moves right */
      const htl = gsap.timeline({
        scrollTrigger: { trigger: heroRef.current, start: 'top top', end: '+=110%', pin: true, pinSpacing: true, scrub: 0.4 },
      })
      htl.to(phoneRef.current, { x: '30vw', scale: 0.5, duration: 1, ease: 'power2.inOut' })
      htl.to('.h-ttl', { opacity: 0, y: -50, duration: 0.35 }, 0)
      htl.to('.h-sub', { opacity: 0, y: -30, duration: 0.3 }, 0.04)
      htl.to('.h-toggle-wrap', { opacity: 0, duration: 0.25 }, 0.06)

      /* Ambient glow drift */
      gsap.to(glowRef.current, {
        y: '-25%',
        scrollTrigger: { trigger: wrapRef.current, start: 'top top', end: 'bottom bottom', scrub: true },
      })

      /* Simulation steps */
      gsap.utils.toArray<HTMLElement>('.sim-step').forEach(el => {
        gsap.fromTo(el,
          { opacity: 0, y: 50 },
          { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 80%', once: true } }
        )
      })

      /* Whisper lines */
      gsap.utils.toArray<HTMLElement>('.whisper').forEach(el => {
        gsap.fromTo(el,
          { opacity: 0 },
          { opacity: 1, duration: 1,
            scrollTrigger: { trigger: el, start: 'top 85%', once: true } }
        )
      })

      /* Timeline glow fill */
      gsap.fromTo('.tl-fill',
        { height: '0%' },
        { height: '100%', ease: 'none',
          scrollTrigger: { trigger: tlRef.current, start: 'top 55%', end: 'bottom 50%', scrub: true } }
      )

      /* Timeline steps */
      gsap.utils.toArray<HTMLElement>('.tl-step').forEach(el => {
        gsap.fromTo(el,
          { opacity: 0, x: -30 },
          { opacity: 1, x: 0, duration: 0.6, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 82%', once: true } }
        )
      })

      /* Pricing */
      gsap.utils.toArray<HTMLElement>('.pc').forEach((el, i) => {
        gsap.fromTo(el,
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 0.5, delay: i * 0.07,
            scrollTrigger: { trigger: el, start: 'top 85%', once: true } }
        )
      })

      /* Final */
      gsap.fromTo('.fin-h', { opacity: 0, scale: 0.92 },
        { opacity: 1, scale: 1, duration: 0.7, ease: 'power3.out',
          scrollTrigger: { trigger: '.fin', start: 'top 72%', once: true } })

    }, wrapRef)
    return () => ctx.revert()
  }, [])

  return (
    <div className="lp" ref={wrapRef}>
      <style>{CSS}</style>
      <div className="bg-glow" ref={glowRef} />

      {/* Nav */}
      <nav className="nv">
        <div className="nv-bar">
          <a href="/" className="nv-logo">Pi<span>x</span>flow</a>
          <div className="nv-links">
            <a href="#how" className="nv-l">איך זה עובד</a>
            <a href="#pricing" className="nv-l">מחירים</a>
            <a href="/demo" className="nv-l">דמו</a>
            <a href="#" onClick={e => { e.preventDefault(); signInWithGoogle() }} className="nv-l nv-hl">התחברות</a>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <div className="hero" ref={heroRef}>
        <div className="hero-in">
          {/* Text side */}
          <div className="h-text">
            <h1 className="h-ttl">האורח כבר לא מחפש<br/>את התמונות שלו</h1>
            <p className="h-sub">הן מוצאות אותו</p>

            {/* Toggle */}
            <div className="h-toggle-wrap">
              <button className={`toggle ${live ? 'toggle--on' : ''}`} onClick={handleToggle}>
                <span className="toggle-knob" />
              </button>
              <span className="toggle-label">
                {live ? 'ככה זה נראה באירוע שלך' : 'תראה לי איך זה עובד'}
              </span>
            </div>
          </div>

          {/* Phone */}
          <div className="h-phone" ref={phoneRef}>
            <div className={`phone ${live ? 'phone--live' : ''}`}>
              <div className="phone-notch" />
              <div className="phone-scr"><PhoneDemo active={live} /></div>
            </div>
            {live && <div className="phone-glow" />}
          </div>
        </div>
      </div>

      {/* ═══ SIMULATION STEPS (no sections — continuous) ═══ */}
      <div className="sim">
        <p className="whisper">האורחים פשוט עפים מזה</p>

        <div className="sim-step">
          <span className="sim-num">1</span>
          <h2 className="sim-h">האורח נכנס לאירוע</h2>
          <p className="sim-d">בלי אפליקציה. בלי רישום. כלום.</p>
        </div>

        <p className="whisper" style={{ textAlign: 'left' }}>כולם מדברים על זה אחרי</p>

        <div className="sim-step">
          <span className="sim-num">2</span>
          <h2 className="sim-h">מצלם סלפי</h2>
          <p className="sim-d">לוחץ, מצלם, ממשיך לרקוד</p>
        </div>

        <div className="sim-step">
          <span className="sim-num">3</span>
          <h2 className="sim-h">והתמונות כבר שם</h2>
          <p className="sim-d">כל מה שצילמו אותו. מוכן.</p>
        </div>

        <p className="whisper">נראה כמו קסם. אבל זה אמיתי.</p>
      </div>

      {/* ═══ TIMELINE ═══ */}
      <div className="tl" id="how" ref={tlRef}>
        <h2 className="tl-heading">שלושה שלבים. זהו.</h2>
        <div className="tl-track">
          <div className="tl-line"><div className="tl-fill" /></div>
          {[
            { n: '1', t: 'תעלה תמונות', d: 'גוררים תיקיה וסוגרים עניין' },
            { n: '2', t: 'תשלח לינק', d: 'וואטסאפ, QR, מה שנוח לך' },
            { n: '3', t: 'הם מוצאים את עצמם', d: 'סלפי אחד והכל שם' },
          ].map((s, i) => (
            <div className="tl-step" key={i}>
              <span className="tl-num">{s.n}</span>
              <div className="tl-body"><h3 className="tl-t">{s.t}</h3><p className="tl-d">{s.d}</p></div>
              <div className="tl-dot" />
            </div>
          ))}
        </div>
      </div>

      {/* ═══ PRICING ═══ */}
      <div className="pr" id="pricing">
        <h2 className="sec-h">תמחור</h2>
        <p className="sec-sub">משלמים פעם אחת לאירוע. בלי מנוי. בלי הפתעות.</p>
        <div className="pr-grid">
          {[
            { name: 'Essential', price: '₪599', items: ['עד 2,000 תמונות', 'זיהוי פנים AI', 'שאלון ללקוח', 'שיתוף QR + לינק', '3 חודשי אחסון'], pop: false },
            { name: 'Premium', price: '₪799', items: ['ללא הגבלת תמונות', 'זיהוי פנים AI', 'מיתוג מלא', 'SMS + מייל אוטומטי', 'שאלון מותאם', '6 חודשי אחסון'], pop: true },
            { name: 'Exclusive', price: '₪1,199', items: ['הכל מ-Premium', 'עיצוב גלריה VIP', 'מסך לייב באירוע', 'שנה אחסון', 'תמיכה VIP'], pop: false },
          ].map((p, i) => (
            <div className={`pc ${p.pop ? 'pc--pop' : ''}`} key={i}>
              {p.pop && <div className="pc-badge">הכי נבחר</div>}
              <h3 className="pc-name">{p.name}</h3>
              <div className="pc-price">{p.price}<span>/אירוע</span></div>
              <ul>{p.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
              <button onClick={signInWithGoogle} className={`pc-btn ${p.pop ? 'pc-btn--go' : ''}`}>להתחיל</button>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ FAQ ═══ */}
      <div className="fq">
        <h2 className="sec-h">שאלות נפוצות</h2>
        <div className="fq-list">
          <Faq q="כמה מדויק הזיהוי?" a="מעל 97%. עובד בתאורה חלשה, עם משקפיים, ובקבוצות." />
          <Faq q="צריכים להוריד אפליקציה?" a="לא. לינק, סלפי, תמונות. זהו." />
          <Faq q="כמה תמונות אפשר להעלות?" a="ב-Essential עד 2,000. ב-Premium ו-Exclusive בלי הגבלה." />
          <Faq q="מה עם פרטיות?" a="כל אורח רואה רק את שלו. הסלפי נמחק אחרי הזיהוי." />
        </div>
      </div>

      {/* ═══ FINAL CTA ═══ */}
      <div className="fin">
        <h2 className="fin-h">זה הרגע שמשדרג<br/>את האירוע שלך</h2>
        <button onClick={signInWithGoogle} className="btn-main btn-main--lg">יאללה, נרים את זה</button>
      </div>

      <footer className="foot">
        <a href="/terms">תנאי שימוש</a><a href="/privacy">פרטיות</a><a href="mailto:support@pixflow-ai.com">צור קשר</a>
        <p>Pixflow AI &copy; 2026</p>
      </footer>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   CSS
   ═══════════════════════════════════════════════════════════════════ */
const CSS = `
/* ── Base ── */
.lp{--pk:#e91e8c;--pr:#8b5cf6;--gw:rgba(233,30,140,.3);min-height:100vh;color:#fff;font-family:'Heebo','Rubik','Assistant',sans-serif;direction:rtl;overflow-x:hidden;-webkit-font-smoothing:antialiased;background:#050508;position:relative}
.lp *{box-sizing:border-box;margin:0;padding:0}.lp a{color:inherit;text-decoration:none}

/* ── Ambient glow ── */
.bg-glow{position:fixed;inset:0;pointer-events:none;z-index:0;background:
  radial-gradient(ellipse 55% 45% at 72% 18%,rgba(233,30,140,.06) 0%,transparent 70%),
  radial-gradient(ellipse 45% 55% at 22% 65%,rgba(139,92,246,.05) 0%,transparent 70%),
  radial-gradient(ellipse 60% 35% at 50% 85%,rgba(233,30,140,.035) 0%,transparent 70%)}

/* ── Nav ── */
.nv{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:200;width:calc(100% - 28px);max-width:680px}
.nv-bar{background:rgba(8,8,16,.5);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border-radius:60px;padding:7px 22px;display:flex;align-items:center;justify-content:space-between;border:1px solid rgba(255,255,255,.03)}
.nv-logo{font-size:17px;font-weight:800;color:#fff;letter-spacing:-.3px}.nv-logo span{color:var(--pk)}
.nv-links{display:flex;gap:2px;align-items:center}
.nv-l{padding:6px 12px;font-size:12px;font-weight:500;color:rgba(255,255,255,.35);transition:color .2s}.nv-l:hover{color:#fff}
.nv-hl{color:var(--pk)}
@media(max-width:580px){.nv-links .nv-l:not(:last-child){display:none}}

/* ── Hero ── */
.hero{all:unset;display:block;height:100vh;height:100dvh;position:relative;z-index:1}
.hero-in{display:flex;align-items:center;justify-content:space-between;height:100%;padding:0 8vw;gap:48px}
.h-text{max-width:500px;flex-shrink:0;position:relative;z-index:2}
.h-ttl{font-size:clamp(28px,5vw,58px);font-weight:900;line-height:1.08;letter-spacing:-1.5px;margin-bottom:18px}
.h-sub{font-size:clamp(15px,1.6vw,20px);color:rgba(255,255,255,.3);margin-bottom:40px}

/* ── Toggle ── */
.h-toggle-wrap{display:flex;align-items:center;gap:16px}
.toggle{width:64px;height:34px;border-radius:34px;border:none;cursor:pointer;background:rgba(255,255,255,.08);position:relative;transition:background .3s;padding:3px;display:flex;align-items:center}
.toggle--on{background:var(--pk);box-shadow:0 0 30px var(--gw)}
.toggle-knob{width:28px;height:28px;border-radius:50%;background:#fff;display:block;transition:transform .35s cubic-bezier(.68,-.55,.27,1.55);box-shadow:0 2px 8px rgba(0,0,0,.3)}
.toggle--on .toggle-knob{transform:translateX(-30px)}
.toggle-label{font-size:15px;font-weight:600;color:rgba(255,255,255,.5);transition:color .3s}
.toggle--on ~ .toggle-label{color:#fff}

/* ── Phone ── */
.h-phone{position:relative;z-index:2;flex-shrink:0}
.phone{width:clamp(210px,19vw,270px);aspect-ratio:9/19.5;border:2px solid rgba(255,255,255,.06);border-radius:36px;background:#0a0a14;position:relative;overflow:hidden;box-shadow:0 40px 80px rgba(0,0,0,.5);transition:border-color .5s,box-shadow .5s}
.phone--live{border-color:rgba(233,30,140,.2);box-shadow:0 0 60px rgba(233,30,140,.08),0 40px 80px rgba(0,0,0,.5)}
.phone-notch{position:absolute;top:0;left:50%;transform:translateX(-50%);width:68px;height:18px;background:#0a0a14;border-radius:0 0 10px 10px;z-index:5;border:1px solid rgba(255,255,255,.04);border-top:none}
.phone-scr{position:absolute;inset:3px;border-radius:33px;overflow:hidden;background:#0a0a14}
.phone-glow{position:absolute;inset:-30px;border-radius:50%;background:radial-gradient(circle,rgba(233,30,140,.12) 0%,transparent 70%);pointer-events:none;animation:pg .8s ease-out}
@keyframes pg{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}

/* Phone demo */
.pd{position:absolute;inset:0}
.pd-s{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;transition:opacity .45s ease;padding:14px}
.pd-ring{width:55px;height:55px;border-radius:50%;border:1.5px solid rgba(139,92,246,.18);display:flex;align-items:center;justify-content:center}
.pd-t{font-size:13px;font-weight:700;color:#fff}
.pd-sub2{font-size:9px;color:rgba(255,255,255,.22)}
.pd-pill{margin-top:6px;padding:8px 22px;border-radius:60px;background:linear-gradient(135deg,var(--pk),var(--pr));color:#fff;font-size:11px;font-weight:700}
.pd-cam{width:80px;height:80px;border-radius:50%;border:1.5px solid rgba(139,92,246,.12);display:flex;align-items:center;justify-content:center;position:relative}
.pd-cam-p{position:absolute;inset:-10px;border-radius:50%;border:1px solid rgba(139,92,246,.03);animation:vfp 3s ease-in-out infinite}
@keyframes vfp{0%,100%{transform:scale(1);opacity:.15}50%{transform:scale(1.05);opacity:.5}}
.pd-shutter{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;margin-top:10px}
.pd-shutter-in{width:30px;height:30px;border-radius:50%;background:#fff}
.pd-orb{width:60px;height:60px;border-radius:50%;border:1.5px solid rgba(139,92,246,.2);display:flex;align-items:center;justify-content:center;animation:orb 3s ease-in-out infinite}
@keyframes orb{0%,100%{box-shadow:0 0 10px rgba(139,92,246,.03)}50%{box-shadow:0 0 30px rgba(139,92,246,.1)}}
.pd-lines{margin-top:8px;display:flex;flex-direction:column;align-items:center;gap:1px}
.pd-ok{width:34px;height:34px;border-radius:50%;background:rgba(34,197,94,.04);border:1.5px solid rgba(34,197,94,.15);display:flex;align-items:center;justify-content:center}
.pd-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;width:130px}
.pd-thumb{aspect-ratio:1;border-radius:4px;background:linear-gradient(135deg,rgba(139,92,246,.08),rgba(233,30,140,.05));transition:all .25s cubic-bezier(.16,1,.3,1)}

@media(max-width:768px){
  .hero-in{flex-direction:column;text-align:center;padding:100px 24px 40px;justify-content:center}
  .h-text{max-width:100%}
  .h-toggle-wrap{justify-content:center}
  .phone{width:190px}
}

/* ── Simulation steps ── */
.sim{padding:80px 28px 40px;max-width:600px;margin:0 auto;position:relative;z-index:1}
.sim-step{margin-bottom:140px;position:relative}
.sim-num{position:absolute;top:-40px;right:-20px;font-size:160px;font-weight:900;line-height:1;color:rgba(255,255,255,.015);pointer-events:none;unicode-bidi:isolate;direction:ltr}
.sim-h{font-size:clamp(28px,5vw,52px);font-weight:900;letter-spacing:-1px;line-height:1.1;margin-bottom:10px}
.sim-d{font-size:clamp(15px,1.6vw,19px);color:rgba(255,255,255,.3);line-height:1.5}

/* Whisper text */
.whisper{font-size:clamp(13px,1.4vw,16px);color:rgba(255,255,255,.12);font-style:italic;margin:20px 0 60px;text-align:right;max-width:600px;margin-left:auto;margin-right:auto;padding:0 28px}

/* ── Timeline ── */
.tl{padding:60px 28px 140px;max-width:660px;margin:0 auto;position:relative;z-index:1}
.tl-heading{font-size:clamp(32px,6vw,72px);font-weight:900;text-align:center;letter-spacing:-2px;margin-bottom:80px;background:linear-gradient(135deg,#fff 40%,rgba(233,30,140,.65));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.tl-track{position:relative;padding-right:52px}
.tl-line{position:absolute;right:16px;top:0;bottom:0;width:2px;background:rgba(255,255,255,.03)}
.tl-fill{width:100%;background:linear-gradient(180deg,var(--pk),var(--pr));border-radius:2px}
.tl-step{position:relative;margin-bottom:110px}.tl-step:last-child{margin-bottom:0}
.tl-num{position:absolute;right:-52px;top:-28px;font-size:130px;font-weight:900;line-height:1;color:rgba(255,255,255,.015);pointer-events:none;unicode-bidi:isolate;direction:ltr}
.tl-t{font-size:clamp(22px,3.5vw,34px);font-weight:800;margin-bottom:8px}
.tl-d{font-size:16px;color:rgba(255,255,255,.3);line-height:1.6}
.tl-dot{position:absolute;right:-60px;top:10px;width:10px;height:10px;border-radius:50%;background:var(--pk);box-shadow:0 0 18px var(--gw);z-index:2}
@media(max-width:600px){.tl-track{padding-right:40px}.tl-line{right:10px}.tl-num{right:-40px;font-size:80px}.tl-dot{right:-48px}}

/* ── Section helpers ── */
.sec-h{font-size:clamp(26px,4.5vw,44px);font-weight:900;text-align:center;letter-spacing:-1px;margin-bottom:10px}
.sec-sub{font-size:14px;color:rgba(255,255,255,.25);text-align:center;margin-bottom:56px}

/* ── Pricing ── */
.pr{padding:120px 28px;max-width:940px;margin:0 auto;position:relative;z-index:1}
.pr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:56px}
@media(max-width:760px){.pr-grid{grid-template-columns:1fr;max-width:360px;margin:56px auto 0}}
.pc{padding:36px 26px;border-radius:22px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.04);position:relative;transition:transform .3s,box-shadow .3s}
.pc:hover{transform:translateY(-4px);box-shadow:0 16px 50px rgba(0,0,0,.2)}
.pc--pop{border:1.5px solid var(--pk);box-shadow:0 0 36px rgba(233,30,140,.05)}
.pc--pop:hover{box-shadow:0 0 56px rgba(233,30,140,.1)}
.pc-badge{position:absolute;top:-11px;left:50%;transform:translateX(-50%);padding:4px 16px;border-radius:60px;font-size:10px;font-weight:700;background:linear-gradient(135deg,var(--pk),var(--pr));color:#fff}
.pc-name{font-size:11px;font-weight:600;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px}
.pc-price{font-size:38px;font-weight:800;unicode-bidi:isolate;direction:ltr;display:inline-block;margin-bottom:2px}
.pc-price span{font-size:13px;color:rgba(255,255,255,.2);margin-inline-start:3px;font-weight:400}
.pc ul{list-style:none;margin:18px 0 22px}
.pc li{font-size:13px;color:rgba(255,255,255,.35);padding:5px 0;display:flex;align-items:center;gap:7px}
.pc li::before{content:'✓';color:var(--pk);font-weight:700;font-size:11px}
.pc-btn{width:100%;padding:13px;border-radius:60px;border:1px solid rgba(255,255,255,.05);cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;background:transparent;color:rgba(255,255,255,.4);transition:all .2s}
.pc-btn:hover{border-color:rgba(255,255,255,.15);color:#fff}
.pc-btn--go{background:linear-gradient(135deg,var(--pk),var(--pr));color:#fff;border:none;box-shadow:0 0 20px var(--gw)}
.pc-btn--go:hover{transform:translateY(-1px);box-shadow:0 0 40px var(--gw)}

/* ── FAQ ── */
.fq{padding:100px 28px;max-width:560px;margin:0 auto;position:relative;z-index:1}
.fq-list{margin-top:32px}
.fq-item{border-bottom:1px solid rgba(255,255,255,.03)}
.fq-q{width:100%;padding:18px 0;background:none;border:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;color:#fff;font-size:14px;font-weight:600;font-family:inherit;text-align:right}
.fq-c{font-size:15px;color:rgba(255,255,255,.15);transition:transform .25s;flex-shrink:0;margin-inline-start:10px}
.fq-c--o{transform:rotate(90deg)}
.fq-a{font-size:13px;line-height:1.8;color:rgba(255,255,255,.3);padding:0 0 16px}

/* ── Final ── */
.fin{padding:160px 28px 120px;text-align:center;position:relative;z-index:1}
.fin-h{font-size:clamp(32px,6vw,68px);font-weight:900;letter-spacing:-2px;line-height:1.08;margin-bottom:40px}

/* ── CTA Button ── */
.btn-main{padding:18px 40px;border-radius:60px;border:none;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;background:linear-gradient(135deg,var(--pk),var(--pr));color:#fff;transition:transform .2s,box-shadow .2s;box-shadow:0 0 36px var(--gw)}
.btn-main:hover{transform:scale(1.03);box-shadow:0 0 56px var(--gw)}
.btn-main--lg{padding:20px 52px;font-size:17px}

/* ── Footer ── */
.foot{padding:24px;text-align:center;border-top:1px solid rgba(255,255,255,.03);display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;z-index:1}
.foot a{font-size:12px;color:rgba(255,255,255,.15);margin:0 12px}.foot a:hover{color:#fff}
.foot p{font-size:11px;color:rgba(255,255,255,.08);margin-top:2px}
`
