import { useState, useEffect, useRef, type ReactNode } from 'react'
import { signInWithGoogle } from '../lib/auth'

// ─── Scroll reveal ──────────────────────────────────────────────────────────

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setTimeout(() => { el.classList.add('lph-visible') }, delay)
        obs.unobserve(el)
      }
    }, { threshold: 0.08 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [delay])
  return <div ref={ref} className={`lph-reveal ${className || ''}`}>{children}</div>
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="lph-faq-item">
      <button onClick={() => setOpen(!open)} className="lph-faq-q">
        <span>{q}</span>
        <span className={`lph-faq-icon ${open ? 'lph-faq-icon--open' : ''}`}>+</span>
      </button>
      <div className={`lph-faq-a ${open ? 'lph-faq-a--open' : ''}`}>
        <p>{a}</p>
      </div>
    </div>
  )
}

// ─── Number counter ─────────────────────────────────────────────────────────

function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let start = 0
        const step = Math.ceil(target / 40)
        const timer = setInterval(() => {
          start += step
          if (start >= target) { setCount(target); clearInterval(timer) }
          else setCount(start)
        }, 30)
        obs.unobserve(el)
      }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [target])
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

// ─── Component ──────────────────────────────────────────────────────────────

export function LandingPageHe() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <div className="lph">
      <style>{`
        /* ── Base ── */
        .lph {
          --bg: #07070d; --card: #0e0e18; --border: rgba(255,255,255,.06);
          --text: #fff; --muted: rgba(255,255,255,.45); --faint: rgba(255,255,255,.2);
          --accent: #6366f1; --accent-glow: rgba(99,102,241,.15);
          min-height: 100vh; background: var(--bg); color: var(--text);
          font-family: 'Inter', -apple-system, sans-serif; direction: rtl;
          overflow-x: hidden; -webkit-font-smoothing: antialiased;
        }
        .lph *, .lph *::before, .lph *::after { box-sizing: border-box; }
        .lph a { color: inherit; }
        .lph-wrap { max-width: 1080px; margin: 0 auto; padding: 0 28px; }

        /* ── Reveal ── */
        .lph-reveal { opacity: 0; transform: translateY(28px); transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); }
        .lph-visible { opacity: 1; transform: translateY(0); }

        /* ── Nav ── */
        .lph-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          padding: 18px 0; transition: background .3s, border-color .3s, padding .3s;
        }
        .lph-nav--solid {
          background: rgba(7,7,13,.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border); padding: 12px 0;
        }
        .lph-nav-inner {
          max-width: 1080px; margin: 0 auto; padding: 0 28px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .lph-logo { font-size: 24px; font-weight: 900; text-decoration: none; letter-spacing: -.7px; }
        .lph-logo-x { color: var(--accent); }
        .lph-nav-links { display: flex; gap: 6px; align-items: center; }
        .lph-nav-link {
          padding: 8px 16px; font-size: 14px; font-weight: 500; color: var(--muted);
          text-decoration: none; border-radius: 8px; transition: color .2s;
        }
        .lph-nav-link:hover { color: var(--text); }
        .lph-nav-cta {
          padding: 10px 24px; border-radius: 10px; border: none; cursor: pointer;
          background: var(--accent); color: #fff; font-size: 14px; font-weight: 700;
          font-family: inherit; transition: transform .15s, box-shadow .15s;
        }
        .lph-nav-cta:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(99,102,241,.3); }

        @media (max-width: 640px) {
          .lph-nav-links { display: none; }
          .lph-mobile-btn { display: flex !important; }
        }
        .lph-mobile-btn {
          display: none; width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--border);
          background: transparent; color: var(--muted); cursor: pointer;
          align-items: center; justify-content: center; font-size: 18px;
        }

        /* ── Hero ── */
        .lph-hero {
          padding: 180px 28px 120px; text-align: center; position: relative;
        }
        @media (max-width: 640px) { .lph-hero { padding: 140px 20px 80px; } }
        .lph-hero-badge {
          display: inline-block; padding: 6px 18px; border-radius: 100px;
          background: rgba(99,102,241,.08); border: 1px solid rgba(99,102,241,.15);
          font-size: 13px; font-weight: 600; color: #818cf8; margin-bottom: 28px;
          letter-spacing: .2px;
        }
        .lph-hero h1 {
          font-size: clamp(34px, 5.5vw, 52px); font-weight: 900; line-height: 1.1;
          margin: 0 auto 24px; max-width: 650px; letter-spacing: -1.2px;
        }
        .lph-hero-gradient {
          background: linear-gradient(135deg, #818cf8 0%, #c084fc 50%, #818cf8 100%);
          background-size: 200% 200%; animation: lph-grad 5s ease infinite;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        @keyframes lph-grad { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        .lph-hero p {
          font-size: 17px; line-height: 1.7; color: var(--muted);
          max-width: 440px; margin: 0 auto 44px;
        }
        .lph-hero-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
        .lph-btn-primary {
          padding: 16px 40px; border-radius: 12px; border: none; cursor: pointer;
          background: var(--accent); color: #fff; font-size: 17px; font-weight: 700;
          font-family: inherit; transition: transform .15s, box-shadow .15s;
          box-shadow: 0 4px 20px rgba(99,102,241,.2);
        }
        .lph-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(99,102,241,.35); }
        .lph-btn-ghost {
          padding: 16px 40px; border-radius: 12px; cursor: pointer;
          background: transparent; color: var(--text); font-size: 17px; font-weight: 600;
          font-family: inherit; border: 1px solid rgba(255,255,255,.1);
          text-decoration: none; transition: border-color .2s;
        }
        .lph-btn-ghost:hover { border-color: rgba(255,255,255,.25); }

        /* Hero glow */
        .lph-glow {
          position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none;
          animation: lph-breathe 7s ease-in-out infinite;
        }
        @keyframes lph-breathe { 0%,100% { opacity: .12; } 50% { opacity: .22; } }

        /* ── Stats ── */
        .lph-stats {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
          max-width: 640px; margin: 0 auto;
          background: var(--border); border-radius: 16px; overflow: hidden;
        }
        .lph-stat {
          padding: 32px 20px; text-align: center; background: var(--card);
        }
        .lph-stat-num { font-size: 36px; font-weight: 900; display: block; margin-bottom: 4px; }
        .lph-stat-label { font-size: 13px; color: var(--muted); }
        @media (max-width: 480px) {
          .lph-stats { grid-template-columns: 1fr; }
          .lph-stat { padding: 20px; }
          .lph-stat-num { font-size: 28px; }
        }

        /* ── Section ── */
        .lph-section { padding: 100px 28px; }
        .lph-section-title {
          font-size: 30px; font-weight: 800; text-align: center; margin: 0 0 10px;
          letter-spacing: -.5px;
        }
        .lph-section-sub {
          font-size: 15px; color: var(--muted); text-align: center;
          margin: 0 auto 52px; max-width: 420px; line-height: 1.7;
        }

        /* ── Steps ── */
        .lph-steps {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px;
          max-width: 880px; margin: 0 auto;
          background: var(--border); border-radius: 20px; overflow: hidden;
        }
        @media (max-width: 700px) { .lph-steps { grid-template-columns: 1fr; } }
        .lph-step {
          padding: 40px 32px; background: var(--card);
        }
        .lph-step-num {
          font-size: 48px; font-weight: 900; color: rgba(99,102,241,.12);
          line-height: 1; margin-bottom: 20px;
        }
        .lph-step h3 { font-size: 17px; font-weight: 700; margin: 0 0 10px; }
        .lph-step p { font-size: 14px; line-height: 1.7; color: var(--muted); margin: 0; }

        /* ── Features ── */
        .lph-features {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;
          max-width: 700px; margin: 0 auto;
        }
        @media (max-width: 600px) { .lph-features { grid-template-columns: 1fr; } }
        .lph-feature {
          padding: 28px 24px; border-radius: 16px;
          background: var(--card); border: 1px solid var(--border);
          transition: border-color .25s;
        }
        .lph-feature:hover { border-color: rgba(99,102,241,.2); }
        .lph-feature h3 {
          font-size: 15px; font-weight: 700; margin: 0 0 8px;
          display: flex; align-items: center; gap: 10px;
        }
        .lph-feature-dot {
          width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0;
        }
        .lph-feature p { font-size: 13px; line-height: 1.7; color: var(--muted); margin: 0; padding-right: 18px; }

        /* ── Pricing ── */
        .lph-plans {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
          max-width: 900px; margin: 0 auto;
        }
        @media (max-width: 760px) { .lph-plans { grid-template-columns: 1fr; max-width: 380px; } }
        .lph-plan {
          padding: 36px 28px; border-radius: 20px;
          background: var(--card); border: 1px solid var(--border);
          transition: border-color .25s, transform .25s;
          position: relative;
        }
        .lph-plan:hover { transform: translateY(-4px); }
        .lph-plan--pop { border-color: var(--accent); background: rgba(99,102,241,.04); }
        .lph-plan-badge {
          position: absolute; top: -13px; left: 50%; transform: translateX(-50%);
          padding: 5px 18px; border-radius: 100px; font-size: 11px; font-weight: 700;
          background: var(--accent); color: #fff; white-space: nowrap;
        }
        .lph-plan h3 { font-size: 16px; font-weight: 700; margin: 0 0 16px; color: var(--muted); }
        .lph-plan-price { font-size: 44px; font-weight: 900; letter-spacing: -1px; }
        .lph-plan-per { font-size: 14px; color: var(--faint); margin-right: 4px; }
        .lph-plan ul { list-style: none; padding: 0; margin: 24px 0; }
        .lph-plan li {
          font-size: 14px; color: var(--muted); padding: 7px 0;
          display: flex; align-items: center; gap: 10px;
        }
        .lph-plan li::before { content: '✓'; color: var(--accent); font-weight: 700; font-size: 13px; }
        .lph-plan-btn {
          width: 100%; padding: 14px; border-radius: 10px; border: none; cursor: pointer;
          font-size: 15px; font-weight: 700; font-family: inherit;
          transition: transform .15s, box-shadow .15s;
        }
        .lph-plan-btn:hover { transform: translateY(-1px); }
        .lph-plan-btn--fill { background: var(--accent); color: #fff; box-shadow: 0 4px 16px rgba(99,102,241,.2); }
        .lph-plan-btn--fill:hover { box-shadow: 0 6px 24px rgba(99,102,241,.35); }
        .lph-plan-btn--ghost { background: rgba(255,255,255,.04); color: var(--muted); border: 1px solid var(--border); }

        /* ── Testimonials ── */
        .lph-reviews {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
          max-width: 900px; margin: 0 auto;
        }
        @media (max-width: 700px) { .lph-reviews { grid-template-columns: 1fr; } }
        .lph-review {
          padding: 28px; border-radius: 16px;
          background: var(--card); border: 1px solid var(--border);
        }
        .lph-review-stars { color: #fbbf24; font-size: 13px; letter-spacing: 2px; margin-bottom: 14px; }
        .lph-review-text { font-size: 14px; line-height: 1.75; color: var(--muted); margin: 0 0 18px; }
        .lph-review-author { display: flex; align-items: center; gap: 10px; }
        .lph-review-avatar {
          width: 34px; height: 34px; border-radius: 50%;
          background: linear-gradient(135deg, var(--accent), #a855f7);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700;
        }
        .lph-review-name { font-size: 13px; font-weight: 600; }
        .lph-review-role { font-size: 11px; color: var(--faint); }

        /* ── FAQ ── */
        .lph-faq-item { border-bottom: 1px solid var(--border); }
        .lph-faq-q {
          width: 100%; padding: 22px 0; background: none; border: none; cursor: pointer;
          display: flex; justify-content: space-between; align-items: center;
          color: var(--text); font-size: 15px; font-weight: 600; font-family: inherit;
          text-align: right;
        }
        .lph-faq-icon {
          font-size: 22px; color: var(--accent); flex-shrink: 0; margin-left: 16px;
          transition: transform .25s;
        }
        .lph-faq-icon--open { transform: rotate(45deg); }
        .lph-faq-a {
          max-height: 0; overflow: hidden; transition: max-height .3s ease;
        }
        .lph-faq-a--open { max-height: 300px; }
        .lph-faq-a p {
          font-size: 14px; line-height: 1.8; color: var(--muted);
          margin: 0; padding: 0 0 20px;
        }

        /* ── Footer ── */
        .lph-footer {
          padding: 28px; border-top: 1px solid var(--border); text-align: center;
        }
        .lph-footer-links { display: flex; justify-content: center; gap: 28px; margin-bottom: 14px; }
        .lph-footer-links a { font-size: 13px; color: var(--faint); text-decoration: none; }
        .lph-footer-links a:hover { color: var(--muted); }
        .lph-footer-copy { font-size: 11px; color: rgba(255,255,255,.12); margin: 0; }
      `}</style>

      {/* ─── Nav ─── */}
      <nav className={`lph-nav ${scrolled ? 'lph-nav--solid' : ''}`}>
        <div className="lph-nav-inner">
          <a href="/" className="lph-logo">Pi<span className="lph-logo-x">x</span>flow</a>
          <div className="lph-nav-links">
            <a href="#how" className="lph-nav-link">איך זה עובד</a>
            <a href="#pricing" className="lph-nav-link">מחירים</a>
            <a href="/demo" className="lph-nav-link">דמו חי</a>
            <button onClick={signInWithGoogle} className="lph-nav-cta">התחברות</button>
          </div>
          <button className="lph-mobile-btn" onClick={() => setMobileMenu(!mobileMenu)}>☰</button>
        </div>
        {mobileMenu && (
          <div style={{
            padding: '16px 28px 20px', display: 'flex', flexDirection: 'column', gap: 8,
            background: 'rgba(7,7,13,.95)', borderTop: '1px solid var(--border)',
          }}>
            <a href="#how" className="lph-nav-link" onClick={() => setMobileMenu(false)}>איך זה עובד</a>
            <a href="#pricing" className="lph-nav-link" onClick={() => setMobileMenu(false)}>מחירים</a>
            <a href="/demo" className="lph-nav-link" onClick={() => setMobileMenu(false)}>דמו חי</a>
            <button onClick={() => { setMobileMenu(false); signInWithGoogle() }} className="lph-nav-cta" style={{ marginTop: 8 }}>התחברות</button>
          </div>
        )}
      </nav>

      {/* ─── Hero ─── */}
      <section className="lph-hero">
        <div className="lph-glow" style={{ width: 500, height: 500, top: '5%', right: '10%', background: 'var(--accent)' }} />
        <div className="lph-glow" style={{ width: 350, height: 350, top: '35%', left: '5%', background: '#a855f7', animationDelay: '3s' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <Reveal>
            <div className="lph-hero-badge">פלטפורמת הזיהוי פנים לצלמי אירועים</div>
          </Reveal>

          <Reveal delay={80}>
            <h1>
              סלפי אחד —<br />
              <span className="lph-hero-gradient">כל התמונות שלהם</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p>
              מעלים את התמונות מהאירוע, שולחים לינק לאורחים,
              והם מוצאים את עצמם תוך שנייה. בלי אפליקציה, בלי סיפורים.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="lph-hero-btns">
              <button onClick={signInWithGoogle} className="lph-btn-primary">יאלה, מתחילים</button>
              <a href="/demo" className="lph-btn-ghost">תנסו דמו חי</a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section style={{ padding: '0 28px 80px' }}>
        <Reveal>
          <div className="lph-stats">
            <div className="lph-stat">
              <span className="lph-stat-num"><CountUp target={97} suffix="%" /></span>
              <span className="lph-stat-label">דיוק זיהוי</span>
            </div>
            <div className="lph-stat">
              <span className="lph-stat-num"><CountUp target={2} suffix=" שנ׳" /></span>
              <span className="lph-stat-label">זמן זיהוי ממוצע</span>
            </div>
            <div className="lph-stat">
              <span className="lph-stat-num">0</span>
              <span className="lph-stat-label">אפליקציות להורדה</span>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ─── How it works ─── */}
      <section id="how" className="lph-section">
        <div className="lph-wrap">
          <Reveal>
            <h2 className="lph-section-title">שלושה שלבים, אפס כאב ראש</h2>
            <p className="lph-section-sub">פשוט עד שזה כמעט חשוד</p>
          </Reveal>

          <Reveal delay={100}>
            <div className="lph-steps">
              <div className="lph-step">
                <div className="lph-step-num">01</div>
                <h3>תעלו את התמונות</h3>
                <p>סיימתם לצלם? מעלים הכל לגלריה. אנחנו מטפלים בשאר.</p>
              </div>
              <div className="lph-step">
                <div className="lph-step-num">02</div>
                <h3>תשלחו לינק</h3>
                <p>QR, ווטסאפ, SMS, מייל — איך שנוח. האורחים לוחצים ומגיעים.</p>
              </div>
              <div className="lph-step">
                <div className="lph-step-num">03</div>
                <h3>הם עושים סלפי</h3>
                <p>סלפי אחד מהטלפון, והמערכת מוצאת את כל התמונות שלהם. נקודה.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="lph-section">
        <div className="lph-wrap">
          <Reveal>
            <h2 className="lph-section-title">למה צלמים עוברים אלינו</h2>
            <p className="lph-section-sub">לא סתם עוד גלריה אונליין</p>
          </Reveal>

          <div className="lph-features">
            {[
              { t: 'זיהוי ב-2 שניות', d: 'לא דקות. לא "מעבד". האורח עושה סלפי ומקבל תוצאות עוד לפני שהוריד את היד.' },
              { t: 'הלוגו שלך, הצבעים שלך', d: 'הגלריה נראית כאילו בנית אותה בעצמך. הלקוח לא רואה את Pixflow — הוא רואה אותך.' },
              { t: 'פרטיות ברמה אחרת', d: 'כל אורח רואה רק את התמונות שלו. הסלפי נמחק אחרי חיפוש. GDPR? סגור.' },
              { t: 'אפס חיכוך', d: 'בלי אפליקציה, בלי הרשמה, בלי "הכנס קוד". האורח לוחץ, מצלם סלפי, מקבל. זהו.' },
            ].map((f, i) => (
              <Reveal key={i} delay={i * 80}>
                <div className="lph-feature">
                  <h3><span className="lph-feature-dot" /> {f.t}</h3>
                  <p>{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" className="lph-section">
        <div className="lph-wrap">
          <Reveal>
            <h2 className="lph-section-title">תמחור</h2>
            <p className="lph-section-sub">תשלום חד פעמי לאירוע. בלי מנויים, בלי קאצ'.</p>
          </Reveal>

          <Reveal delay={100}>
            <div className="lph-plans">
              <div className="lph-plan">
                <h3>Essential</h3>
                <div><span className="lph-plan-price">₪599</span><span className="lph-plan-per">/אירוע</span></div>
                <ul>
                  <li>עד 2,000 תמונות</li>
                  <li>זיהוי פנים AI</li>
                  <li>שאלון ללקוח</li>
                  <li>שיתוף QR + לינק</li>
                  <li>3 חודשי אחסון</li>
                </ul>
                <button onClick={signInWithGoogle} className="lph-plan-btn lph-plan-btn--ghost">להתחיל</button>
              </div>

              <div className="lph-plan lph-plan--pop">
                <div className="lph-plan-badge">הכי נבחר</div>
                <h3>Premium</h3>
                <div><span className="lph-plan-price">₪799</span><span className="lph-plan-per">/אירוע</span></div>
                <ul>
                  <li>תמונות ללא הגבלה</li>
                  <li>זיהוי פנים AI</li>
                  <li>מיתוג מלא — לוגו + צבעים</li>
                  <li>SMS + מייל אוטומטי</li>
                  <li>שאלון מותאם אישית</li>
                  <li>6 חודשי אחסון</li>
                </ul>
                <button onClick={signInWithGoogle} className="lph-plan-btn lph-plan-btn--fill">להתחיל</button>
              </div>

              <div className="lph-plan">
                <h3>Exclusive</h3>
                <div><span className="lph-plan-price">₪1,199</span><span className="lph-plan-per">/אירוע</span></div>
                <ul>
                  <li>הכל מ-Premium</li>
                  <li>עיצוב גלריה VIP</li>
                  <li>מסך לייב באירוע</li>
                  <li>שנה אחסון</li>
                  <li>תמיכה VIP + ייעוץ</li>
                </ul>
                <button onClick={signInWithGoogle} className="lph-plan-btn lph-plan-btn--ghost">להתחיל</button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section className="lph-section">
        <div className="lph-wrap">
          <Reveal>
            <h2 className="lph-section-title">צלמים מדברים</h2>
          </Reveal>

          <div className="lph-reviews">
            {[
              { name: 'דניאל כ.', role: 'צלם אירועים · ת״א', text: 'האורחים מקבלים את התמונות עוד באירוע ושולחים סטוריז. שיווק חינם שאי אפשר לקנות בכסף.', initials: 'ד' },
              { name: 'מיכל ש.', role: 'צלמת חתונות · חיפה', text: 'הזיהוי עובד גם בתאורה של DJ בשעה 2 בלילה. ניסיתי שלושה מתחרים לפני — אף אחד לא מתקרב.', initials: 'מ' },
              { name: 'עומר א.', role: 'מפיק אירועים · י-ם', text: 'הלקוחות שלי לא מורידים אפליקציות. נקודה. Pixflow עובד מהדפדפן ובזה סגרתם אותי.', initials: 'ע' },
            ].map((r, i) => (
              <Reveal key={i} delay={i * 100}>
                <div className="lph-review">
                  <div className="lph-review-stars">★★★★★</div>
                  <p className="lph-review-text">{r.text}</p>
                  <div className="lph-review-author">
                    <div className="lph-review-avatar">{r.initials}</div>
                    <div>
                      <div className="lph-review-name">{r.name}</div>
                      <div className="lph-review-role">{r.role}</div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="lph-section">
        <div className="lph-wrap" style={{ maxWidth: 620 }}>
          <Reveal>
            <h2 className="lph-section-title">שאלות נפוצות</h2>
          </Reveal>
          <Reveal delay={80}>
            <div>
              <FaqItem q="כמה מדויק הזיהוי?" a="מעל 97%. עובד גם בתאורה חלשה, עם משקפיים, ומזהה פנים גם בקבוצות גדולות. משתמשים ב-AWS Rekognition — אותה טכנולוגיה שמפעילה את Amazon." />
              <FaqItem q="האורחים צריכים להוריד משהו?" a="שום דבר. הם לוחצים על לינק, עושים סלפי מהדפדפן, ומקבלים את התמונות. אפילו סבתא תצליח." />
              <FaqItem q="כמה תמונות אפשר להעלות?" a="ב-Essential עד 2,000. ב-Premium ו-Exclusive — כמה שבא לך, אין תקרה." />
              <FaqItem q="מה עם פרטיות?" a="כל אורח רואה רק את התמונות שלו. הסלפי נמחק אוטומטית אחרי הזיהוי. עומדים ב-GDPR ובחוק הגנת הפרטיות הישראלי." />
              <FaqItem q="אני יכול לשים את הלוגו שלי?" a="ב-Premium ומעלה — כן. לוגו, צבעים, טקסטים. הלקוח שלך רואה רק אותך." />
              <FaqItem q="תוך כמה זמן הגלריה באוויר?" a="מרגע שמעלים את התמונות — הגלריה מוכנה לשיתוף. 1,000 תמונות = בערך 10-15 דקות." />
              <FaqItem q="מה אם אני צריך עזרה?" a="מייל וווטסאפ, זמינים. ב-Exclusive מקבלים ליווי אישי כולל ייעוץ לפני האירוע." />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section style={{ padding: '80px 28px 120px', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontSize: 30, fontWeight: 800, margin: '0 0 14px', letterSpacing: -.5 }}>
            מוכנים לשדרג את האירוע הבא?
          </h2>
          <p style={{ fontSize: 15, color: 'var(--muted)', margin: '0 0 36px' }}>
            תנו לאורחים חוויה שהם ידברו עליה
          </p>
          <div className="lph-hero-btns">
            <button onClick={signInWithGoogle} className="lph-btn-primary">יאלה, בואו</button>
            <a href="/demo" className="lph-btn-ghost">תנסו דמו קודם</a>
          </div>
        </Reveal>
      </section>

      {/* ─── Footer ─── */}
      <footer className="lph-footer">
        <div className="lph-footer-links">
          <a href="/terms">תנאי שימוש</a>
          <a href="/privacy">פרטיות</a>
          <a href="mailto:support@pixflow-ai.com">צור קשר</a>
        </div>
        <p className="lph-footer-copy">Pixflow AI by Eclipse Media &copy; 2026</p>
      </footer>
    </div>
  )
}
