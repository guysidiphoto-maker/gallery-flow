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
      {bgUrl && (
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
      <style>{`
        @keyframes q-fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes q-check { 0% { transform: scale(0); } 50% { transform: scale(1.15); } 100% { transform: scale(1); } }
        @keyframes q-spin { to { transform: rotate(360deg); } }
        @keyframes q-ken-burns { 0% { transform: scale(1); } 50% { transform: scale(1.12); } 100% { transform: scale(1); } }
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
