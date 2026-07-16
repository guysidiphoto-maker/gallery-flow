import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'
import { TurnstileWidget } from '../components/TurnstileWidget'
import type { EventConfig } from '../types'

// Public Cloudflare Turnstile site key. When unset (local dev) the widget
// isn't rendered and the server falls back to rate limiting, so dev still works.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY as string | undefined

// ─── Phone validation (IL mobile) ───────────────────────────────────────────

const PHONE_RE = /^05[0-9]\d{7}$/

function cleanPhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, '')
}

function isValidPhone(raw: string): boolean {
  const clean = cleanPhone(raw)
  return PHONE_RE.test(clean) || /^\+9725[0-9]\d{7}$/.test(clean)
}

// ─── Offline queue ──────────────────────────────────────────────────────────

const QUEUE_KEY = 'gf_lead_queue'

function queueLead(payload: Record<string, string>) {
  try {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
    queue.push(payload)
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch { /* noop */ }
}

async function flushQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return
    const queue: Record<string, string>[] = JSON.parse(raw)
    if (queue.length === 0) return
    localStorage.removeItem(QUEUE_KEY)
    for (const payload of queue) {
      await fetch('/api/capture-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Re-queue on failure
        queueLead(payload)
      })
    }
  } catch { /* noop */ }
}

// ─── Component ──────────────────────────────────────────────────────────────

type Phase = 'loading' | 'form' | 'submitting' | 'done' | 'error'

export function EventCapturePage() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [event, setEvent] = useState<EventConfig | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [phoneError, setPhoneError] = useState(false)
  const [nameError, setNameError] = useState(false)
  const [whatsappSent, setWhatsappSent] = useState(true)
  const [galleryUrl, setGalleryUrl] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  const [turnstileToken, setTurnstileToken] = useState('')

  const phoneRef = useRef<HTMLInputElement>(null)

  // Parse event ID from URL
  const eventId = (() => {
    const path = window.location.pathname
    const match = path.match(/^\/event\/([^/]+)$/)
    return match?.[1] || ''
  })()

  // Load event config
  useEffect(() => {
    if (!eventId) { setPhase('error'); return }

    supabase
      .from('events')
      .select('id, business_id, gallery_id, name, gallery_url, welcome_text, logo_url, is_active, created_at')
      .eq('id', eventId)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setPhase('error'); return }
        setEvent(data as EventConfig)
        setGalleryUrl(data.gallery_url)
        setPhase('form')
      })

    // Flush any queued leads from previous offline sessions
    flushQueue()
  }, [eventId])

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => { setOffline(false); flushQueue() }
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate
    const trimName = name.trim()
    const trimPhone = cleanPhone(phone)
    let hasError = false

    if (!trimName) { setNameError(true); hasError = true }
    if (!isValidPhone(trimPhone)) { setPhoneError(true); hasError = true }
    if (hasError) return

    const payload = {
      eventId,
      name: trimName,
      phone: trimPhone,
      email: email.trim() || undefined,
      turnstileToken: turnstileToken || undefined,
    }

    setPhase('submitting')

    // If offline, queue and show success (optimistic)
    if (!navigator.onLine) {
      queueLead(payload as Record<string, string>)
      setPhase('done')
      return
    }

    try {
      const resp = await fetch('/api/capture-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })

      const data = await resp.json()

      if (!resp.ok && data?.error === 'invalid_phone') {
        setPhoneError(true)
        setPhase('form')
        return
      }

      if (data?.galleryUrl) setGalleryUrl(data.galleryUrl)
      setWhatsappSent(data?.whatsappSent !== false)
      setPhase('done')
    } catch {
      // Network failure — queue for retry
      queueLead(payload as Record<string, string>)
      setPhase('done')
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100dvh', background: '#0a0a0f',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      WebkitFontSmoothing: 'antialiased',
      color: '#fff', padding: '0 20px',
    }}>
      <style>{`
        @keyframes ec-fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ec-check { 0% { transform: scale(0); } 50% { transform: scale(1.15); } 100% { transform: scale(1); } }
        @keyframes ec-spin { to { transform: rotate(360deg); } }
        .ec-input:focus { border-color: rgba(99,102,241,.5) !important; }
        .ec-input::placeholder { color: rgba(255,255,255,.2); }
      `}</style>

      {/* ── Loading ── */}
      {phase === 'loading' && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid rgba(99,102,241,.15)',
            borderTopColor: '#6366f1',
            animation: 'ec-spin .8s linear infinite',
          }} />
        </div>
      )}

      {/* ── Error (event not found) ── */}
      {phase === 'error' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', direction: 'rtl',
        }}>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            הקישור לא נמצא
          </p>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.4)' }}>
            יכול להיות שהאירוע הסתיים או שהקישור לא תקין
          </p>
        </div>
      )}

      {/* ── Form ── */}
      {(phase === 'form' || phase === 'submitting') && event && (
        <div style={{
          width: '100%', maxWidth: 400,
          paddingTop: 'max(env(safe-area-inset-top, 0px), 40px)',
          paddingBottom: 40,
          animation: 'ec-fadeIn .5s ease both',
        }}>
          {/* Logo */}
          {event.logo_url && (
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <img
                src={event.logo_url}
                alt=""
                style={{ height: 40, maxWidth: 160, objectFit: 'contain', opacity: .7 }}
              />
            </div>
          )}

          {/* Event name */}
          <h1 style={{
            fontSize: 24, fontWeight: 800, textAlign: 'center',
            margin: '0 0 8px', direction: 'rtl', lineHeight: 1.3,
          }}>
            {event.name}
          </h1>

          {/* Welcome text */}
          <p style={{
            fontSize: 15, color: 'rgba(255,255,255,.45)',
            textAlign: 'center', margin: '0 0 32px', direction: 'rtl',
            lineHeight: 1.6,
          }}>
            {event.welcome_text || 'קבלו את הגלריה שלכם ישירות לוואטסאפ'}
          </p>

          {/* Offline indicator */}
          {offline && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 16,
              background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)',
              fontSize: 13, color: '#fbbf24', textAlign: 'center', direction: 'rtl',
            }}>
              אין חיבור לאינטרנט — נשלח ברגע שתתחבר
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>שם מלא</label>
              <input
                className="ec-input"
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setNameError(false) }}
                placeholder="הכנס שם מלא"
                autoComplete="name"
                style={nameError ? inputErrorStyle : inputStyle}
              />
              {nameError && (
                <p style={{ fontSize: 12, color: '#f87171', margin: '6px 0 0', direction: 'rtl' }}>
                  נא להזין שם
                </p>
              )}
            </div>

            {/* Phone */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>מספר טלפון</label>
              <input
                ref={phoneRef}
                className="ec-input"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); setPhoneError(false) }}
                placeholder="050-1234567"
                autoComplete="tel"
                style={phoneError ? inputErrorStyle : inputStyle}
                dir="ltr"
              />
              {phoneError && (
                <p style={{ fontSize: 12, color: '#f87171', margin: '6px 0 0', direction: 'rtl' }}>
                  מספר הטלפון לא תקין
                </p>
              )}
            </div>

            {/* Email (optional) */}
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>אימייל <span style={{ color: 'rgba(255,255,255,.25)' }}>(לא חובה)</span></label>
              <input
                className="ec-input"
                type="email"
                inputMode="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@mail.com"
                autoComplete="email"
                style={inputStyle}
                dir="ltr"
              />
            </div>

            {/* Consent */}
            <p style={{
              fontSize: 11, color: 'rgba(255,255,255,.25)',
              margin: '0 0 20px', direction: 'rtl', lineHeight: 1.6,
              textAlign: 'center',
            }}>
              בלחיצה על &quot;שלח&quot; אני מסכים/ה לקבל הודעה עם קישור לגלריית התמונות
            </p>

            {/* Invisible bot-check (managed mode: silent for real users) */}
            {TURNSTILE_SITE_KEY && (
              <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onToken={setTurnstileToken} />
            )}

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
                transition: 'opacity .2s, transform .15s',
                transform: phase === 'submitting' ? 'none' : undefined,
              }}
            >
              {phase === 'submitting' ? (
                <>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,.25)',
                    borderTopColor: '#fff',
                    animation: 'ec-spin .7s linear infinite',
                  }} />
                  שולח...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.29-1.244L4 20l1.244-3.71A8 8 0 1 1 12 20z" />
                  </svg>
                  שלח לי את הגלריה
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ── Done ── */}
      {phase === 'done' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', direction: 'rtl',
          padding: '40px 0',
          animation: 'ec-fadeIn .5s ease both',
        }}>
          {/* Checkmark */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(34,197,94,.1)', border: '2px solid rgba(34,197,94,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
            animation: 'ec-check .5s cubic-bezier(.16,1,.3,1) both',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
            {whatsappSent ? 'הקישור נשלח אליך ב-SMS!' : 'נרשמת בהצלחה!'}
          </h2>

          <p style={{
            fontSize: 14, color: 'rgba(255,255,255,.4)',
            margin: '0 0 32px', lineHeight: 1.6,
          }}>
            {whatsappSent
              ? 'תוך כמה שניות תקבל SMS עם הלינק לגלריה'
              : 'הלינק לגלריה מופיע כאן למטה'
            }
          </p>

          {/* Direct gallery link button */}
          <a
            href={galleryUrl}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '16px 40px', borderRadius: 14, textDecoration: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontSize: 16, fontWeight: 700,
              transition: 'transform .15s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            פתח את הגלריה
          </a>
        </div>
      )}
    </div>
  )
}
