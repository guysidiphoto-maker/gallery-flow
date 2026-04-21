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
  const [consent, setConsent] = useState(false)

  const questionnaireId = (() => {
    const match = window.location.pathname.match(/^\/q\/([^/]+)$/)
    return match?.[1] || ''
  })()

  useEffect(() => {
    if (!questionnaireId) { setPhase('error'); return }

    supabase
      .from('questionnaires')
      .select('*')
      .eq('id', questionnaireId)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setPhase('error'); return }
        setConfig(data as QuestionnaireConfig)
        setPhase('form')
      })
  }, [questionnaireId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!config) return

    const newErrors: Record<string, boolean> = {}
    if (!name.trim()) newErrors['_name'] = true
    if (config.send_method === 'sms' && !phone.trim()) newErrors['_phone'] = true
    if (config.send_method === 'email' && !email.trim()) newErrors['_email'] = true
    if (!consent) newErrors['_consent'] = true

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
          questionnaireId,
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

  // ── Styles ──

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: 12,
    border: '1px solid rgba(255,255,255,.1)',
    background: 'rgba(255,255,255,.05)',
    color: '#fff', fontSize: 16, fontFamily: 'inherit',
    outline: 'none', direction: 'rtl',
    WebkitAppearance: 'none',
    transition: 'border-color .2s',
  }

  const inputErrorStyle: React.CSSProperties = {
    ...inputStyle,
    borderColor: 'rgba(239,68,68,.5)',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 13, color: 'rgba(255,255,255,.5)',
    marginBottom: 6, display: 'block', direction: 'rtl',
  }

  // ── Render ──

  const bgUrl = config?.background_url
  const bgAnim = config?.bg_animation

  // TikTok 3D shapes config
  const tiktokShapes = bgAnim === 'tiktok-3d' ? [
    { shape: 'note', color: '#25F4EE', x: 8, y: 12, size: 90, dur: 18, delay: 0, rx: 25, ry: 40 },
    { shape: 'note', color: '#FE2C55', x: 75, y: 8, size: 70, dur: 22, delay: 2, rx: -30, ry: 20 },
    { shape: 'circle', color: '#25F4EE', x: 85, y: 65, size: 50, dur: 15, delay: 1, rx: 20, ry: -35 },
    { shape: 'circle', color: '#FE2C55', x: 12, y: 70, size: 40, dur: 20, delay: 3, rx: -15, ry: 45 },
    { shape: 'note', color: '#25F4EE', x: 45, y: 85, size: 60, dur: 24, delay: 4, rx: 35, ry: -25 },
    { shape: 'arc', color: '#FE2C55', x: 60, y: 30, size: 110, dur: 28, delay: 1.5, rx: -20, ry: 30 },
    { shape: 'arc', color: '#25F4EE', x: 20, y: 40, size: 80, dur: 19, delay: 5, rx: 40, ry: -15 },
    { shape: 'circle', color: '#FE2C55', x: 90, y: 90, size: 35, dur: 16, delay: 2.5, rx: -25, ry: 50 },
    { shape: 'note', color: '#25F4EE', x: 55, y: 55, size: 45, dur: 21, delay: 6, rx: 30, ry: 20 },
    { shape: 'arc', color: '#FE2C55', x: 30, y: 15, size: 95, dur: 26, delay: 3.5, rx: -35, ry: -40 },
  ] : []

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0a0a0f',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      WebkitFontSmoothing: 'antialiased',
      color: '#fff', padding: '0 20px',
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

      {/* TikTok 3D floating shapes */}
      {bgAnim === 'tiktok-3d' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0,
          perspective: '800px', perspectiveOrigin: '50% 50%',
          overflow: 'hidden',
        }}>
          {tiktokShapes.map((s, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${s.x}%`, top: `${s.y}%`,
              width: s.size, height: s.size,
              opacity: 0.35,
              animation: `q-float-${i} ${s.dur}s ease-in-out ${s.delay}s infinite`,
              transformStyle: 'preserve-3d',
            }}>
              <svg viewBox="0 0 100 100" width={s.size} height={s.size} style={{ filter: `drop-shadow(0 0 ${s.size / 4}px ${s.color}40)` }}>
                {s.shape === 'note' && (
                  <path d="M65 10 L65 65 Q65 80 50 80 Q35 80 35 65 Q35 50 50 50 Q58 50 60 55 L60 10 Z"
                    fill="none" stroke={s.color} strokeWidth="4" strokeLinecap="round" />
                )}
                {s.shape === 'circle' && (
                  <circle cx="50" cy="50" r="30" fill="none" stroke={s.color} strokeWidth="4" />
                )}
                {s.shape === 'arc' && (
                  <path d="M20 80 Q20 20 80 20" fill="none" stroke={s.color} strokeWidth="5" strokeLinecap="round" />
                )}
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
        ${tiktokShapes.map((s, i) => `
        @keyframes q-float-${i} {
          0% { transform: translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale(1); }
          25% { transform: translate3d(${s.rx}px,${-Math.abs(s.ry)/2}px,${s.size}px) rotateX(${s.rx}deg) rotateY(${s.ry}deg) scale(1.1); }
          50% { transform: translate3d(${-s.rx/2}px,${s.ry}px,${s.size*1.5}px) rotateX(${-s.rx/2}deg) rotateY(${-s.ry}deg) scale(0.9); }
          75% { transform: translate3d(${s.ry/3}px,${s.rx/2}px,${-s.size/2}px) rotateX(${s.ry}deg) rotateY(${s.rx/2}deg) scale(1.05); }
          100% { transform: translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale(1); }
        }`).join('')}
        .q-input:focus { border-color: rgba(99,102,241,.5) !important; }
        .q-input::placeholder { color: rgba(255,255,255,.2); }
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
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.4)' }}>
            יכול להיות שהשאלון כבר לא פעיל או שהקישור לא תקין
          </p>
        </div>
      )}

      {/* Form */}
      {(phase === 'form' || phase === 'submitting') && config && (
        <div style={{
          width: '100%', maxWidth: 400,
          paddingTop: 'max(env(safe-area-inset-top, 0px), 40px)',
          paddingBottom: 40,
          animation: 'q-fadeIn .5s ease both',
          position: 'relative', zIndex: 1,
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
              fontSize: 15, color: 'rgba(255,255,255,.45)',
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
                טלפון {config.send_method === 'sms' ? '*' : <span style={{ color: 'rgba(255,255,255,.25)' }}>(לא חובה)</span>}
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

            {/* Consent */}
            <div style={{ marginTop: 20, marginBottom: 4 }}>
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                direction: 'rtl', fontSize: 12, lineHeight: 1.6,
                color: errors['_consent'] ? '#f87171' : 'rgba(255,255,255,.4)',
              }}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={e => { setConsent(e.target.checked); setErrors(p => ({ ...p, _consent: false })) }}
                  style={{ width: 16, height: 16, accentColor: '#6366f1', marginTop: 2, flexShrink: 0 }}
                />
                <span>
                  אני מסכים/ה ל<a href="/terms" target="_blank" style={{ color: '#818cf8', textDecoration: 'underline' }}>תקנון השימוש</a> ול<a href="/privacy" target="_blank" style={{ color: '#818cf8', textDecoration: 'underline' }}>מדיניות הפרטיות</a>.
                  אני מאשר/ת שליחת הודעות הכוללות אישורים, הנחיות והודעות אחרות לכתובת הדואר האלקטרוני ומספר הטלפון שסיפקתי.
                </span>
              </label>
              {errors['_consent'] && (
                <p style={{ fontSize: 12, color: '#f87171', margin: '6px 0 0', direction: 'rtl' }}>יש לאשר את התקנון ומדיניות הפרטיות</p>
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
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.4)', margin: 0, lineHeight: 1.6 }}>
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
