import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { QuestionnaireConfig } from '../types'

type Phase = 'loading' | 'form' | 'submitting' | 'done' | 'error'

export function QuestionnairePage() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [config, setConfig] = useState<QuestionnaireConfig | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [consentTerms, setConsentTerms] = useState(false)
  const [consentComms, setConsentComms] = useState(false)

  // Support both /q/{uuid} and /q/{slug}
  const questionnaireIdOrSlug = (() => {
    const match = window.location.pathname.match(/^\/q\/([^/]+)$/)
    return match?.[1] || ''
  })()

  useEffect(() => {
    if (!questionnaireIdOrSlug) { setPhase('error'); return }

    // Try by ID first, then by slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionnaireIdOrSlug)
    const query = supabase
      .from('questionnaires')
      .select('*')
      .eq('is_active', true)

    const fetcher = isUuid
      ? query.eq('id', questionnaireIdOrSlug)
      : query.eq('slug', questionnaireIdOrSlug)

    fetcher.maybeSingle().then(({ data, error }) => {
      if (error || !data) { setPhase('error'); return }
      setConfig(data as QuestionnaireConfig)
      setPhase('form')
    })
  }, [questionnaireIdOrSlug])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!config) return

    const newErrors: Record<string, boolean> = {}
    if (!name.trim()) newErrors['_name'] = true
    if (config.send_method === 'sms' && !phone.trim()) newErrors['_phone'] = true
    if (config.send_method === 'email' && !email.trim()) newErrors['_email'] = true
    if (!consentTerms) newErrors['_consentTerms'] = true
    if (!consentComms) newErrors['_consentComms'] = true

    for (const q of config.questions) {
      if (q.required && !answers[q.id]?.trim()) {
        newErrors[q.id] = true
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setPhase('submitting')

    try {
      const resp = await fetch('/api/submit-questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionnaireId: config.id,
          respondentName: name.trim(),
          respondentPhone: phone.trim() || null,
          respondentEmail: email.trim() || null,
          answers,
        }),
      })

      if (!resp.ok) {
        setPhase('form')
        return
      }

      setPhase('done')
    } catch {
      setPhase('form')
    }
  }

  // ── Theme: dark when bg image/animation, light/clean otherwise ──
  const hasDarkBg = !!(config?.background_url || config?.bg_animation)

  const theme = {
    bg: hasDarkBg ? '#0a0a0f' : '#f8f9fa',
    text: hasDarkBg ? '#fff' : '#1a1a2e',
    textMuted: hasDarkBg ? 'rgba(255,255,255,.45)' : '#6b7280',
    textFaint: hasDarkBg ? 'rgba(255,255,255,.25)' : '#9ca3af',
    inputBg: hasDarkBg ? 'rgba(255,255,255,.05)' : '#fff',
    inputBorder: hasDarkBg ? 'rgba(255,255,255,.1)' : '#e5e7eb',
    inputText: hasDarkBg ? '#fff' : '#1a1a2e',
    inputPlaceholder: hasDarkBg ? 'rgba(255,255,255,.2)' : '#9ca3af',
    errorBorder: hasDarkBg ? 'rgba(239,68,68,.5)' : '#ef4444',
    consentText: hasDarkBg ? 'rgba(255,255,255,.4)' : '#6b7280',
    linkColor: hasDarkBg ? '#818cf8' : '#6366f1',
    cardBg: hasDarkBg ? 'transparent' : '#fff',
    cardShadow: hasDarkBg ? 'none' : '0 4px 24px rgba(0,0,0,.06)',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: 12,
    border: `1px solid ${theme.inputBorder}`,
    background: theme.inputBg,
    color: theme.inputText, fontSize: 16, fontFamily: 'inherit',
    outline: 'none', direction: 'rtl',
    WebkitAppearance: 'none',
    transition: 'border-color .2s',
    boxShadow: hasDarkBg ? 'none' : '0 1px 3px rgba(0,0,0,.04)',
  }

  const inputErrorStyle: React.CSSProperties = {
    ...inputStyle,
    borderColor: theme.errorBorder,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 13, color: theme.textMuted,
    marginBottom: 6, display: 'block', direction: 'rtl',
  }

  // ── Render ──

  const bgUrl = config?.background_url
  const bgAnim = config?.bg_animation

  // TikTok logo path — the exact "d" music note shape
  const ttNotePath = 'M50 2 C50 2 62 8 68 18 L68 18 L56 18 C56 18 53 12 50 10 L50 55 C50 72 38 82 24 78 C10 74 4 60 10 48 C16 36 30 32 42 38 C46 40 48 43 48 47 L48 10 Z'

  // Each logo instance: position, size, rotation, animation timing
  const tiktokLogos = bgAnim === 'tiktok-3d' ? [
    { x: 5,  y: -5,  size: 180, rot: -25, dur: 22, delay: 0,  drift: { x: 30, y: 40, z: 80 } },
    { x: 70, y: 5,   size: 140, rot: 15,  dur: 26, delay: 1.5, drift: { x: -25, y: 35, z: 60 } },
    { x: 40, y: 30,  size: 100, rot: 45,  dur: 18, delay: 3,  drift: { x: 40, y: -30, z: 120 } },
    { x: 80, y: 45,  size: 160, rot: -10, dur: 24, delay: 0.5, drift: { x: -35, y: 25, z: 90 } },
    { x: 15, y: 55,  size: 120, rot: 30,  dur: 20, delay: 4,  drift: { x: 20, y: -40, z: 70 } },
    { x: 55, y: 70,  size: 90,  rot: -40, dur: 28, delay: 2,  drift: { x: -30, y: 20, z: 100 } },
    { x: -5, y: 80,  size: 150, rot: 20,  dur: 23, delay: 5,  drift: { x: 35, y: -25, z: 50 } },
    { x: 85, y: 85,  size: 110, rot: -35, dur: 19, delay: 1,  drift: { x: -20, y: 45, z: 110 } },
    { x: 35, y: 95,  size: 130, rot: 10,  dur: 25, delay: 3.5, drift: { x: 25, y: -35, z: 85 } },
    { x: 60, y: -10, size: 85,  rot: 50,  dur: 21, delay: 6,  drift: { x: -40, y: 30, z: 65 } },
  ] : []

  return (
    <div style={{
      minHeight: '100dvh',
      background: theme.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      WebkitFontSmoothing: 'antialiased',
      color: theme.text, padding: '0 20px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Animated background image */}
      {bgUrl && !bgAnim && (
        <>
          <div style={{
            position: 'fixed', inset: '-10%',
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            animation: 'q-ken-burns 25s ease-in-out infinite',
            zIndex: 0,
          }} />
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,.5)',
            zIndex: 0,
          }} />
        </>
      )}

      {/* TikTok 3D floating logos */}
      {bgAnim === 'tiktok-3d' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0,
          perspective: '1200px', perspectiveOrigin: '50% 50%',
          overflow: 'hidden',
        }}>
          {tiktokLogos.map((logo, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${logo.x}%`, top: `${logo.y}%`,
              width: logo.size, height: logo.size,
              animation: `q-float-${i} ${logo.dur}s ease-in-out ${logo.delay}s infinite`,
              transformStyle: 'preserve-3d',
              transform: `rotate(${logo.rot}deg)`,
            }}>
              {/* Pink layer — offset for glitch */}
              <svg viewBox="0 0 80 90" width={logo.size} height={logo.size}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  filter: `drop-shadow(0 0 ${logo.size / 5}px rgba(254,44,85,.4))`,
                  animation: `q-glitch-pink ${logo.dur * 0.7}s ease-in-out ${logo.delay}s infinite`,
                  opacity: 0.5,
                }}>
                <path d={ttNotePath} fill="none" stroke="#FE2C55" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {/* Cyan layer — offset opposite */}
              <svg viewBox="0 0 80 90" width={logo.size} height={logo.size}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  filter: `drop-shadow(0 0 ${logo.size / 5}px rgba(37,244,238,.4))`,
                  animation: `q-glitch-cyan ${logo.dur * 0.7}s ease-in-out ${logo.delay + 0.3}s infinite`,
                  opacity: 0.5,
                }}>
                <path d={ttNotePath} fill="none" stroke="#25F4EE" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes q-fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes q-check { 0% { transform: scale(0); } 50% { transform: scale(1.15); } 100% { transform: scale(1); } }
        @keyframes q-spin { to { transform: rotate(360deg); } }
        @keyframes q-ken-burns { 0% { transform: scale(1); } 50% { transform: scale(1.12); } 100% { transform: scale(1); } }
        @keyframes q-glitch-pink {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(3px, -2px); }
          40% { transform: translate(-2px, 3px); }
          60% { transform: translate(4px, 1px); }
          80% { transform: translate(-1px, -3px); }
        }
        @keyframes q-glitch-cyan {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(-3px, 2px); }
          40% { transform: translate(2px, -3px); }
          60% { transform: translate(-4px, -1px); }
          80% { transform: translate(1px, 3px); }
        }
        ${tiktokLogos.map((logo, i) => `
        @keyframes q-float-${i} {
          0% { transform: rotate(${logo.rot}deg) translate3d(0,0,0) rotateX(0deg) rotateY(0deg); }
          25% { transform: rotate(${logo.rot + 8}deg) translate3d(${logo.drift.x}px,${-logo.drift.y}px,${logo.drift.z}px) rotateX(15deg) rotateY(-10deg); }
          50% { transform: rotate(${logo.rot - 5}deg) translate3d(${-logo.drift.x/2}px,${logo.drift.y}px,${logo.drift.z * 1.3}px) rotateX(-10deg) rotateY(20deg); }
          75% { transform: rotate(${logo.rot + 3}deg) translate3d(${logo.drift.y/2}px,${logo.drift.x/3}px,${-logo.drift.z/2}px) rotateX(8deg) rotateY(-15deg); }
          100% { transform: rotate(${logo.rot}deg) translate3d(0,0,0) rotateX(0deg) rotateY(0deg); }
        }`).join('')}
        .q-input:focus { border-color: rgba(99,102,241,.5) !important; }
        .q-input::placeholder { color: ${theme.inputPlaceholder}; }
        .q-textarea { resize: vertical; min-height: 80px; }
      `}</style>

      {/* Loading */}
      {phase === 'loading' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid rgba(99,102,241,.15)',
            borderTopColor: '#6366f1',
            animation: 'q-spin .8s linear infinite',
          }} />
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', direction: 'rtl',
          position: 'relative', zIndex: 1,
        }}>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>השאלון לא נמצא</p>
          <p style={{ fontSize: 14, color: theme.textMuted }}>
            יכול להיות שהשאלון כבר לא פעיל או שהקישור לא תקין
          </p>
        </div>
      )}

      {/* Form */}
      {(phase === 'form' || phase === 'submitting') && config && (
        <div style={{
          width: '100%', maxWidth: 440,
          paddingTop: 'max(env(safe-area-inset-top, 0px), 40px)',
          paddingBottom: 40,
          animation: 'q-fadeIn .5s ease both',
          position: 'relative', zIndex: 1,
          ...(hasDarkBg ? {} : {
            background: '#fff',
            borderRadius: 20,
            padding: '36px 32px',
            marginTop: 20,
            boxShadow: '0 4px 24px rgba(0,0,0,.06)',
            border: '1px solid #e5e7eb',
          }),
        }}>
          {/* Title */}
          <h1 style={{
            fontSize: 24, fontWeight: 800, textAlign: 'center',
            margin: '0 0 8px', direction: 'rtl', lineHeight: 1.3,
          }}>
            {config.title}
          </h1>

          {/* Description */}
          {config.description && (
            <p style={{
              fontSize: 15, color: theme.textMuted,
              textAlign: 'center', margin: '0 0 32px', direction: 'rtl',
              lineHeight: 1.6,
            }}>
              {config.description}
            </p>
          )}

          <form onSubmit={handleSubmit}>
            {/* Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>שם מלא *</label>
              <input
                className="q-input"
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, _name: false })) }}
                placeholder="הכנס שם מלא"
                autoComplete="name"
                style={errors['_name'] ? inputErrorStyle : inputStyle}
              />
              {errors['_name'] && (
                <p style={{ fontSize: 12, color: '#f87171', margin: '6px 0 0', direction: 'rtl' }}>נא להזין שם</p>
              )}
            </div>

            {/* Phone */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                טלפון {config.send_method === 'sms' ? '*' : <span style={{ color: theme.textFaint }}>(לא חובה)</span>}
              </label>
              <input
                className="q-input"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, _phone: false })) }}
                placeholder="050-1234567"
                autoComplete="tel"
                style={errors['_phone'] ? inputErrorStyle : inputStyle}
                dir="ltr"
              />
              {errors['_phone'] && (
                <p style={{ fontSize: 12, color: '#f87171', margin: '6px 0 0', direction: 'rtl' }}>נא להזין מספר טלפון</p>
              )}
            </div>

            {/* Email (shown when send_method is email, otherwise hidden) */}
            {config.send_method === 'email' && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>אימייל *</label>
                <input
                  className="q-input"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, _email: false })) }}
                  placeholder="example@mail.com"
                  autoComplete="email"
                  style={errors['_email'] ? inputErrorStyle : inputStyle}
                  dir="ltr"
                />
                {errors['_email'] && (
                  <p style={{ fontSize: 12, color: '#f87171', margin: '6px 0 0', direction: 'rtl' }}>נא להזין כתובת אימייל</p>
                )}
              </div>
            )}

            {/* Dynamic questions */}
            {config.questions.map(q => (
              <div key={q.id} style={{ marginBottom: 16 }}>
                <label style={labelStyle}>
                  {q.label} {q.required && '*'}
                </label>
                <textarea
                  className="q-input q-textarea"
                  value={answers[q.id] || ''}
                  onChange={e => {
                    setAnswers(p => ({ ...p, [q.id]: e.target.value }))
                    setErrors(p => ({ ...p, [q.id]: false }))
                  }}
                  placeholder="הקלד תשובה..."
                  style={{
                    ...(errors[q.id] ? inputErrorStyle : inputStyle),
                    resize: 'vertical', minHeight: 80,
                  }}
                />
                {errors[q.id] && (
                  <p style={{ fontSize: 12, color: '#f87171', margin: '6px 0 0', direction: 'rtl' }}>שדה חובה</p>
                )}
              </div>
            ))}

            {/* Consent 1 — Terms & Privacy */}
            <div style={{ marginTop: 20, marginBottom: 10 }}>
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                direction: 'rtl', fontSize: 12, lineHeight: 1.6,
                color: errors['_consentTerms'] ? '#f87171' : theme.consentText,
              }}>
                <input
                  type="checkbox"
                  checked={consentTerms}
                  onChange={e => { setConsentTerms(e.target.checked); setErrors(p => ({ ...p, _consentTerms: false })) }}
                  style={{ width: 16, height: 16, accentColor: '#6366f1', marginTop: 2, flexShrink: 0 }}
                />
                <span>
                  אני מסכים/ה ל<a href="/terms" target="_blank" style={{ color: theme.linkColor, textDecoration: 'underline' }}>תקנון השימוש</a> ול<a href="/privacy" target="_blank" style={{ color: theme.linkColor, textDecoration: 'underline' }}>מדיניות הפרטיות</a>.
                </span>
              </label>
              {errors['_consentTerms'] && (
                <p style={{ fontSize: 12, color: '#f87171', margin: '6px 0 0', direction: 'rtl' }}>יש לאשר את התקנון ומדיניות הפרטיות</p>
              )}
            </div>

            {/* Consent 2 — Communications */}
            <div style={{ marginBottom: 4 }}>
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                direction: 'rtl', fontSize: 12, lineHeight: 1.6,
                color: errors['_consentComms'] ? '#f87171' : theme.consentText,
              }}>
                <input
                  type="checkbox"
                  checked={consentComms}
                  onChange={e => { setConsentComms(e.target.checked); setErrors(p => ({ ...p, _consentComms: false })) }}
                  style={{ width: 16, height: 16, accentColor: '#6366f1', marginTop: 2, flexShrink: 0 }}
                />
                <span>
                  אני מאשר/ת שליחת הודעות הכוללות אישורים, הנחיות והודעות אחרות לכתובת הדואר האלקטרוני ומספר הטלפון שסיפקתי.
                </span>
              </label>
              {errors['_consentComms'] && (
                <p style={{ fontSize: 12, color: '#f87171', margin: '6px 0 0', direction: 'rtl' }}>יש לאשר קבלת הודעות</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={phase === 'submitting'}
              style={{
                width: '100%', padding: '16px 24px', borderRadius: 14,
                border: 'none', cursor: phase === 'submitting' ? 'wait' : 'pointer',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontSize: 17, fontWeight: 700,
                fontFamily: 'inherit', direction: 'rtl',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                opacity: phase === 'submitting' ? .7 : 1,
                transition: 'opacity .2s',
                marginTop: 24,
              }}
            >
              {phase === 'submitting' ? (
                <>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,.25)',
                    borderTopColor: '#fff',
                    animation: 'q-spin .7s linear infinite',
                  }} />
                  שולח...
                </>
              ) : 'שלח'}
            </button>
          </form>
        </div>
      )}

      {/* Done */}
      {phase === 'done' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', direction: 'rtl',
          padding: '40px 0',
          animation: 'q-fadeIn .5s ease both',
          position: 'relative', zIndex: 1,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(34,197,94,.1)', border: '2px solid rgba(34,197,94,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
            animation: 'q-check .5s cubic-bezier(.16,1,.3,1) both',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
            תודה רבה!
          </h2>
          <p style={{ fontSize: 14, color: theme.textMuted, margin: 0, lineHeight: 1.6 }}>
            התשובות שלך נשלחו בהצלחה
          </p>

          {/* Link to gallery if exists */}
          {config?.gallery_id && (
            <a
              href={`/gallery/${config.gallery_id}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '16px 40px', borderRadius: 14, textDecoration: 'none',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontSize: 16, fontWeight: 700,
                marginTop: 32,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              צפה בגלריה
            </a>
          )}
        </div>
      )}
    </div>
  )
}
