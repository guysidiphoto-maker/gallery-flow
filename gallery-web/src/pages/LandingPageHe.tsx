import { useState, useEffect, useRef, type ReactNode } from 'react'
import { signInWithGoogle } from '../lib/auth'

// ─── Fade-up on scroll ──────────────────────────────────────────────────────

function FadeUp({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setTimeout(() => {
          el.style.opacity = '1'
          el.style.transform = 'translateY(0)'
        }, delay)
        obs.unobserve(el)
      }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [delay])
  return (
    <div ref={ref} style={{ opacity: 0, transform: 'translateY(24px)', transition: 'opacity .6s ease, transform .6s ease' }}>
      {children}
    </div>
  )
}

// ─── FAQ Accordion ──────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      borderBottom: '1px solid rgba(255,255,255,.06)', padding: '20px 0',
    }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        color: '#fff', fontSize: 16, fontWeight: 600, fontFamily: 'inherit',
        textAlign: 'right', direction: 'rtl', padding: 0,
      }}>
        <span>{q}</span>
        <span style={{
          transform: open ? 'rotate(45deg)' : 'none',
          transition: 'transform .2s', fontSize: 22, color: '#6366f1', flexShrink: 0, marginLeft: 16,
        }}>+</span>
      </button>
      {open && (
        <p style={{
          margin: '12px 0 0', fontSize: 14, lineHeight: 1.8, color: 'rgba(255,255,255,.5)',
          direction: 'rtl',
        }}>{a}</p>
      )}
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: '100vh', background: '#0a0a0f', color: '#fff',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    direction: 'rtl' as const, overflow: 'hidden',
  },
  container: { maxWidth: 1100, margin: '0 auto', padding: '0 24px' },
  nav: {
    position: 'fixed' as const, top: 0, left: 0, right: 0, zIndex: 100,
    background: 'rgba(10,10,15,.8)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(255,255,255,.06)',
  },
  navInner: {
    maxWidth: 1100, margin: '0 auto', padding: '16px 24px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  logo: { fontSize: 22, fontWeight: 800, color: '#fff', textDecoration: 'none', letterSpacing: -0.5 },
  logoX: { color: '#6366f1' },
  btn: {
    padding: '12px 28px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: '#6366f1', color: '#fff', fontSize: 15, fontWeight: 700,
    fontFamily: 'inherit', transition: 'transform .15s, box-shadow .15s',
  },
  btnOutline: {
    padding: '12px 28px', borderRadius: 10, cursor: 'pointer',
    background: 'transparent', color: '#fff', fontSize: 15, fontWeight: 600,
    fontFamily: 'inherit', border: '1px solid rgba(255,255,255,.15)',
  },
  sectionTitle: {
    fontSize: 32, fontWeight: 800, textAlign: 'center' as const, margin: '0 0 16px',
    letterSpacing: -0.5,
  },
  sectionSub: {
    fontSize: 16, color: 'rgba(255,255,255,.45)', textAlign: 'center' as const,
    margin: '0 auto 48px', maxWidth: 500, lineHeight: 1.7,
  },
}

// ─── Component ──────────────────────────────────────────────────────────────

export function LandingPageHe() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={S.page}>
      <style>{`
        @keyframes lph-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes lph-pulse { 0%,100% { opacity: .15; } 50% { opacity: .3; } }
        @keyframes lph-gradient { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .lph-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(99,102,241,.3); }
        .lph-card:hover { border-color: rgba(99,102,241,.3); transform: translateY(-4px); }
        .lph-plan:hover { border-color: rgba(99,102,241,.4); }
        .lph-plan--pop { border-color: #6366f1; position: relative; }
      `}</style>

      {/* ─── Nav ─── */}
      <nav style={{ ...S.nav, borderBottomColor: scrolled ? 'rgba(255,255,255,.06)' : 'transparent' }}>
        <div style={S.navInner}>
          <a href="/" style={S.logo}>Pi<span style={S.logoX}>x</span>flow</a>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="#pricing" style={{ ...S.btnOutline, padding: '10px 20px', fontSize: 13, border: 'none', color: 'rgba(255,255,255,.6)' }}>מחירים</a>
            <a href="/demo" style={{ ...S.btnOutline, padding: '10px 20px', fontSize: 13, border: 'none', color: 'rgba(255,255,255,.6)' }}>דמו</a>
            <button onClick={signInWithGoogle} className="lph-btn" style={{ ...S.btn, padding: '10px 22px', fontSize: 13 }}>כניסה</button>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section style={{ padding: '160px 24px 100px', textAlign: 'center', position: 'relative' }}>
        {/* Ambient orbs */}
        <div style={{
          position: 'absolute', top: '10%', right: '15%', width: 400, height: 400,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,.12) 0%, transparent 70%)',
          filter: 'blur(60px)', animation: 'lph-pulse 6s ease-in-out infinite', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: '30%', left: '10%', width: 300, height: 300,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,.1) 0%, transparent 70%)',
          filter: 'blur(50px)', animation: 'lph-pulse 8s ease-in-out infinite 2s', pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <FadeUp>
            <div style={{
              display: 'inline-block', padding: '8px 20px', borderRadius: 100,
              background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)',
              fontSize: 13, fontWeight: 600, color: '#818cf8', marginBottom: 24,
            }}>
              הכלי של צלמי האירועים בישראל
            </div>
          </FadeUp>

          <FadeUp delay={100}>
            <h1 style={{
              fontSize: 'clamp(36px, 6vw, 56px)', fontWeight: 900, lineHeight: 1.15,
              margin: '0 auto 20px', maxWidth: 700, letterSpacing: -1,
            }}>
              האורחים שלך<br />
              <span style={{
                background: 'linear-gradient(135deg, #6366f1, #a855f7, #6366f1)',
                backgroundSize: '200% 200%',
                animation: 'lph-gradient 4s ease infinite',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>מוצאים את עצמם</span><br />
              בשנייה
            </h1>
          </FadeUp>

          <FadeUp delay={200}>
            <p style={{
              fontSize: 18, lineHeight: 1.7, color: 'rgba(255,255,255,.45)',
              maxWidth: 480, margin: '0 auto 40px',
            }}>
              מעלים תמונות מהאירוע, האורחים עושים סלפי —
              והתמונות שלהם כבר אצלם. בלי אפליקציות, בלי סיפורים.
            </p>
          </FadeUp>

          <FadeUp delay={300}>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={signInWithGoogle} className="lph-btn" style={{
                ...S.btn, padding: '16px 36px', fontSize: 17,
                boxShadow: '0 4px 20px rgba(99,102,241,.25)',
              }}>
                בואו נתחיל
              </button>
              <a href="/demo" style={{ ...S.btnOutline, padding: '16px 36px', fontSize: 17, textDecoration: 'none' }}>
                תראו דמו
              </a>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section style={{ padding: '80px 24px' }}>
        <div style={S.container}>
          <FadeUp>
            <h2 style={S.sectionTitle}>איך זה עובד?</h2>
            <p style={S.sectionSub}>שלושה צעדים, אפס כאבי ראש</p>
          </FadeUp>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 24, maxWidth: 900, margin: '0 auto',
          }}>
            {[
              { num: '01', title: 'מעלים תמונות', desc: 'מעלים את כל התמונות מהאירוע לגלריה. בלי הגבלה, בלי דחיסה.' },
              { num: '02', title: 'משתפים לינק', desc: 'שולחים QR או לינק לאורחים — בווטסאפ, SMS, או מייל. הם לא צריכים להוריד כלום.' },
              { num: '03', title: 'סלפי = תמונות', desc: 'האורח עושה סלפי, זיהוי הפנים מוצא את כל התמונות שלו תוך שניות.' },
            ].map((step, i) => (
              <FadeUp key={i} delay={i * 120}>
                <div className="lph-card" style={{
                  padding: '32px 28px', borderRadius: 16,
                  background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
                  transition: 'border-color .2s, transform .2s',
                }}>
                  <span style={{
                    fontSize: 40, fontWeight: 900, color: 'rgba(99,102,241,.2)',
                    display: 'block', marginBottom: 16,
                  }}>{step.num}</span>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>{step.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,.4)', margin: 0 }}>{step.desc}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Why Pixflow ─── */}
      <section style={{ padding: '60px 24px 80px' }}>
        <div style={S.container}>
          <FadeUp>
            <h2 style={S.sectionTitle}>למה Pixflow?</h2>
            <p style={S.sectionSub}>כי מגיע לאורחים שלך חוויה ברמה אחרת</p>
          </FadeUp>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 20, maxWidth: 900, margin: '0 auto',
          }}>
            {[
              { icon: '⚡', title: 'מהיר בטירוף', desc: 'זיהוי פנים תוך 2 שניות. לא דקות, לא שעות.' },
              { icon: '🎨', title: 'מיתוג שלך', desc: 'לוגו, צבעים, עיצוב מותאם — הגלריה נראית כאילו אתה בנית אותה.' },
              { icon: '🔒', title: 'פרטיות מלאה', desc: 'כל אורח רואה רק את התמונות שלו. GDPR compliant.' },
              { icon: '📱', title: 'בלי אפליקציה', desc: 'עובד מהדפדפן. בלי הורדות, בלי רישום, בלי חיכוך.' },
            ].map((f, i) => (
              <FadeUp key={i} delay={i * 100}>
                <div style={{
                  padding: '28px 24px', borderRadius: 14,
                  background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)',
                  textAlign: 'center',
                }}>
                  <span style={{ fontSize: 32, display: 'block', marginBottom: 14 }}>{f.icon}</span>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>{f.title}</h3>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,.4)', margin: 0 }}>{f.desc}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" style={{ padding: '80px 24px', background: 'rgba(255,255,255,.01)' }}>
        <div style={S.container}>
          <FadeUp>
            <h2 style={S.sectionTitle}>תמחור</h2>
            <p style={S.sectionSub}>משלמים פעם אחת לאירוע. בלי מנויים, בלי הפתעות.</p>
          </FadeUp>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20, maxWidth: 900, margin: '0 auto',
          }}>
            {[
              {
                name: 'Essential', price: '599', pop: false,
                features: ['עד 2,000 תמונות', 'זיהוי פנים AI', 'שאלון ללקוח', 'שיתוף QR + לינק', '3 חודשי אחסון'],
              },
              {
                name: 'Premium', price: '799', pop: true,
                features: ['תמונות ללא הגבלה', 'זיהוי פנים AI', 'שאלון + מיתוג מותאם', 'SMS + מייל אוטומטי', '6 חודשי אחסון', 'תמיכה מועדפת'],
              },
              {
                name: 'Exclusive', price: '1,199', pop: false,
                features: ['הכל מ-Premium', 'עיצוב גלריה VIP', 'מסך לייב באירוע', 'שנה אחסון', 'תמיכה VIP + ייעוץ'],
              },
            ].map((plan, i) => (
              <FadeUp key={i} delay={i * 120}>
                <div className={`lph-plan ${plan.pop ? 'lph-plan--pop' : ''}`} style={{
                  padding: '36px 28px', borderRadius: 16,
                  background: plan.pop ? 'rgba(99,102,241,.06)' : 'rgba(255,255,255,.02)',
                  border: `1px solid ${plan.pop ? '#6366f1' : 'rgba(255,255,255,.06)'}`,
                  transition: 'border-color .2s',
                  position: 'relative',
                }}>
                  {plan.pop && (
                    <div style={{
                      position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                      padding: '4px 16px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                      background: '#6366f1', color: '#fff',
                    }}>הכי פופולרי</div>
                  )}
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{plan.name}</h3>
                  <div style={{ margin: '0 0 20px' }}>
                    <span style={{ fontSize: 40, fontWeight: 900 }}>₪{plan.price}</span>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,.35)', marginRight: 6 }}>/אירוע</span>
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
                    {plan.features.map((f, j) => (
                      <li key={j} style={{
                        fontSize: 14, color: 'rgba(255,255,255,.55)', padding: '6px 0',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{ color: '#6366f1', fontSize: 14 }}>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={signInWithGoogle} className="lph-btn" style={{
                    ...S.btn, width: '100%',
                    background: plan.pop ? '#6366f1' : 'rgba(255,255,255,.06)',
                    color: plan.pop ? '#fff' : 'rgba(255,255,255,.7)',
                  }}>
                    להתחיל
                  </button>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section style={{ padding: '80px 24px' }}>
        <div style={S.container}>
          <FadeUp>
            <h2 style={S.sectionTitle}>מה אומרים עלינו</h2>
            <p style={S.sectionSub}>צלמים שכבר עובדים עם Pixflow</p>
          </FadeUp>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20, maxWidth: 900, margin: '0 auto',
          }}>
            {[
              { name: 'דניאל כ.', role: 'צלם אירועים, תל אביב', text: 'מאז שעברתי ל-Pixflow האורחים פשוט מתלהבים. הם מקבלים את התמונות עוד באירוע ושולחים לכולם. שיווק חינם.' },
              { name: 'מיכל ש.', role: 'צלמת חתונות, חיפה', text: 'הזיהוי פנים עובד מטורף. גם בתאורה נמוכה, גם עם משקפיים. האורחים לא מאמינים שזה אמיתי.' },
              { name: 'עומר א.', role: 'מפיק אירועים, ירושלים', text: 'הייתי צריך משהו שעובד בלי אפליקציה. הלקוחות שלי לא רוצים להוריד כלום. Pixflow פתר את זה מושלם.' },
            ].map((t, i) => (
              <FadeUp key={i} delay={i * 120}>
                <div style={{
                  padding: '28px', borderRadius: 16,
                  background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
                }}>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,.55)', margin: '0 0 20px' }}>
                    "{t.text}"
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, color: '#fff',
                    }}>{t.name[0]}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)' }}>{t.role}</div>
                    </div>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ ...S.container, maxWidth: 650 }}>
          <FadeUp>
            <h2 style={S.sectionTitle}>שאלות ותשובות</h2>
          </FadeUp>

          <FadeUp delay={100}>
            <div>
              <FaqItem q="כמה מדויק זיהוי הפנים?" a="מעל 97% דיוק. המערכת עובדת גם בתאורה חלשה, גם עם משקפיים, וגם כשיש המון אנשים בתמונה." />
              <FaqItem q="האורחים צריכים להוריד אפליקציה?" a="לא. הכל עובד מהדפדפן. האורח לוחץ על הלינק, עושה סלפי, ומקבל את התמונות. זהו." />
              <FaqItem q="כמה תמונות אפשר להעלות?" a="בחבילת Essential עד 2,000 תמונות. ב-Premium וב-Exclusive — ללא הגבלה." />
              <FaqItem q="מה קורה עם הפרטיות?" a="כל אורח רואה רק את התמונות שלו. תמונות הסלפי נמחקות אוטומטית אחרי החיפוש. אנחנו עומדים ב-GDPR ובחוק הגנת הפרטיות." />
              <FaqItem q="כמה זמן לוקח להעלות אירוע?" a="תלוי בכמות התמונות ובמהירות האינטרנט. 1,000 תמונות עולות בממוצע תוך 10-15 דקות." />
              <FaqItem q="אפשר להוסיף את הלוגו שלי?" a="כן. בחבילת Premium ומעלה אתה יכול להתאים צבעים, לוגו, וטקסט — הגלריה נראית שלך." />
              <FaqItem q="יש תמיכה?" a="כן, דרך מייל וווטסאפ. בחבילת Exclusive מקבלים תמיכה VIP עם ייעוץ אישי." />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section style={{ padding: '80px 24px 100px', textAlign: 'center' }}>
        <FadeUp>
          <h2 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 16px' }}>
            מוכנים להתחיל?
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,.4)', margin: '0 0 32px', lineHeight: 1.7 }}>
            תנו לאורחים שלכם חוויה שהם לא ישכחו
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={signInWithGoogle} className="lph-btn" style={{
              ...S.btn, padding: '16px 40px', fontSize: 17,
              boxShadow: '0 4px 20px rgba(99,102,241,.25)',
            }}>
              יאלה, בואו
            </button>
            <a href="/demo" style={{ ...S.btnOutline, padding: '16px 40px', fontSize: 17, textDecoration: 'none' }}>
              תראו דמו קודם
            </a>
          </div>
        </FadeUp>
      </section>

      {/* ─── Footer ─── */}
      <footer style={{
        padding: '32px 24px', borderTop: '1px solid rgba(255,255,255,.06)',
        textAlign: 'center',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
          <a href="/terms" style={{ fontSize: 13, color: 'rgba(255,255,255,.3)', textDecoration: 'none' }}>תנאי שימוש</a>
          <a href="/privacy" style={{ fontSize: 13, color: 'rgba(255,255,255,.3)', textDecoration: 'none' }}>מדיניות פרטיות</a>
          <a href="mailto:support@pixflow-ai.com" style={{ fontSize: 13, color: 'rgba(255,255,255,.3)', textDecoration: 'none' }}>צור קשר</a>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.2)', margin: 0 }}>
          Pixflow AI by Eclipse Media &copy; 2026
        </p>
      </footer>
    </div>
  )
}
