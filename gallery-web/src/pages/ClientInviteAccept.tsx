import { useState, useEffect, type CSSProperties } from 'react'
import { supabase } from '../supabase'

// ─── Editorial design tokens (shared with ClientDashboard / PortfolioPage) ──
const bg = '#F2EFE9'
const border = '#D0D0D0'
const textPrimary = '#141413'
const textSecondary = '#333333'
const textMuted = '#767470'
const danger = '#dc2626'
const sage = '#7B8F6E'

const MIN_PASSWORD = 8

// ─── Client Portal invitation acceptance ─────────────────────────────────────
// `/client-invite/accept?token=...`. On load, validate the token (non-leaky).
// On accept, either sign in immediately (new account created with the chosen
// password) or route the user to /client-login (they already had an account and
// must use their EXISTING password — we never set a new one).

interface ValidateResponse {
  ok: boolean
  valid: boolean
  email: string | null
  client_name: string | null
  expired: boolean
  status: string | null
}
interface AcceptSuccess {
  ok: true
  email: string
  requires_login: boolean
}
interface AcceptFailure {
  ok: false
  error: string
}
type AcceptResponse = AcceptSuccess | AcceptFailure

interface BootstrapMembership {
  membership_id: string
  client_id: string
  business_id: string
  client_name: string
  client_slug: string | null
  role: string
  production_suite: boolean
}
interface BootstrapResult {
  authenticated: boolean
  memberships: BootstrapMembership[]
}

function isBootstrapResult(v: unknown): v is BootstrapResult {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.authenticated === 'boolean' && Array.isArray(o.memberships)
}

async function resolveDashboardUrl(): Promise<string | null> {
  const { data, error } = await supabase.rpc('client_portal_bootstrap')
  if (error || !isBootstrapResult(data)) return null
  if (!data.authenticated || data.memberships.length === 0) return null
  const m = data.memberships[0]
  if (m.client_slug) {
    const { data: biz } = await supabase
      .from('businesses').select('slug').eq('id', m.business_id).maybeSingle()
    const bizSlug = (biz?.slug as string | undefined) ?? null
    if (bizSlug) return `/${bizSlug}/c/${m.client_slug}`
  }
  return `/client/${m.client_id}/dashboard`
}

const ACCEPT_ERROR_HE: Record<string, string> = {
  weak_password: 'הסיסמה חייבת להכיל לפחות 8 תווים.',
  invalid_email: 'כתובת האימייל אינה תקינה.',
  invitation_invalid: 'ההזמנה אינה תקפה או שפג תוקפה.',
  token_required: 'קישור ההזמנה חסר או שגוי.',
}

type Phase = 'loading' | 'invalid' | 'form' | 'accepting' | 'redirecting' | 'requires_login'

export function ClientInviteAccept() {
  const token = (() => {
    try {
      return new URLSearchParams(window.location.search).get('token') ?? ''
    } catch { return '' }
  })()

  const [phase, setPhase] = useState<Phase>('loading')
  const [email, setEmail] = useState<string>('')
  const [clientName, setClientName] = useState<string>('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Validate the invitation on mount.
  useEffect(() => {
    let cancelled = false
    if (!token) { setPhase('invalid'); return }
    ;(async () => {
      try {
        const res = await fetch('/api/client-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'validate_invitation', token }),
        })
        const json = (await res.json().catch(() => null)) as ValidateResponse | null
        if (cancelled) return
        if (!json || !json.ok || !json.valid || !json.email) {
          setPhase('invalid')
          return
        }
        setEmail(json.email)
        setClientName(json.client_name ?? '')
        setPhase('form')
      } catch {
        if (!cancelled) setPhase('invalid')
      }
    })()
    return () => { cancelled = true }
  }, [token])

  async function handleAccept() {
    setError(null)
    if (password.length < MIN_PASSWORD) {
      setError(ACCEPT_ERROR_HE.weak_password)
      return
    }
    if (password !== confirm) {
      setError('הסיסמאות אינן תואמות.')
      return
    }
    setPhase('accepting')
    try {
      const res = await fetch('/api/client-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_invitation', token, email, password }),
      })
      const json = (await res.json().catch(() => null)) as AcceptResponse | null
      if (!json || json.ok !== true) {
        const code = json && 'error' in json ? json.error : ''
        setError(ACCEPT_ERROR_HE[code] ?? 'אירעה שגיאה. נסו שוב.')
        setPhase('form')
        return
      }

      if (json.requires_login) {
        // Pre-existing account: we did NOT set a new password. Route to login
        // with the email prefilled so they use their existing credentials.
        setPhase('requires_login')
        return
      }

      // New account created with the chosen password → sign in immediately.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email, password,
      })
      if (signInErr) {
        // Account exists but sign-in failed — safest path is the login page.
        setPhase('requires_login')
        return
      }
      const url = await resolveDashboardUrl()
      setPhase('redirecting')
      window.location.replace(url ?? '/client-login')
    } catch {
      setError('שגיאת רשת. נסו שוב.')
      setPhase('form')
    }
  }

  // ── Render by phase ──────────────────────────────────────────────────────
  if (phase === 'loading') return <CenteredSpinner label="בודק הזמנה" />
  if (phase === 'redirecting') return <CenteredSpinner label="נכנס לאזור הלקוח" />

  if (phase === 'invalid') {
    return (
      <Shell>
        <Eyebrow>Pixflow · Client Portal</Eyebrow>
        <h1 style={titleStyle}>ההזמנה אינה תקפה</h1>
        <p style={{ fontSize: 14, color: textSecondary, margin: '0 0 8px', lineHeight: 1.55 }}>
          הקישור שקיבלת אינו תקף או שפג תוקפו. בקשו מהצלם לשלוח הזמנה חדשה.
        </p>
        <a href="/client-login" style={linkStyle}>יש לך כבר חשבון? כניסה ←</a>
      </Shell>
    )
  }

  if (phase === 'requires_login') {
    return (
      <Shell>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', margin: '0 auto 18px',
          background: 'rgba(123,143,110,.14)', color: sage,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 600,
        }}>✓</div>
        <Eyebrow>Pixflow · Client Portal</Eyebrow>
        <h1 style={titleStyle}>כבר קיים לך חשבון</h1>
        <p style={{ fontSize: 14, color: textSecondary, margin: '0 0 24px', lineHeight: 1.55 }}>
          חיברנו את ההזמנה לחשבון הקיים שלך. התחברו עם הסיסמה הקיימת שלך.
        </p>
        <a
          href={`/client-login?email=${encodeURIComponent(email)}`}
          style={{ ...primaryLinkBtn, display: 'inline-block' }}
        >
          כניסה עם החשבון הקיים
        </a>
      </Shell>
    )
  }

  // phase === 'form' | 'accepting'
  const busy = phase === 'accepting'
  return (
    <Shell>
      <Eyebrow>Pixflow · Client Portal</Eyebrow>
      <h1 style={titleStyle}>
        {clientName ? `הוזמנת ל${clientName}` : 'קבלת הזמנה'}
      </h1>
      <p style={{ fontSize: 14, color: textSecondary, margin: '0 0 24px', lineHeight: 1.55 }}>
        בחרו סיסמה כדי להשלים את ההרשמה לאזור הלקוח.
      </p>

      <form
        onSubmit={e => { e.preventDefault(); if (!busy) void handleAccept() }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'start' }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={fieldLabel}>אימייל</span>
          <input
            type="email" value={email} readOnly dir="ltr"
            aria-readonly="true"
            style={{
              ...inputBase, textAlign: 'left',
              background: '#F6F5F1', color: textMuted, cursor: 'default',
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={fieldLabel}>סיסמה (לפחות 8 תווים)</span>
          <input
            type="password" autoComplete="new-password" dir="ltr"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null) }}
            disabled={busy}
            style={{ ...inputBase, textAlign: 'left', ...(error ? { borderColor: danger } : {}) }}
            autoFocus
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={fieldLabel}>אימות סיסמה</span>
          <input
            type="password" autoComplete="new-password" dir="ltr"
            value={confirm}
            onChange={e => { setConfirm(e.target.value); setError(null) }}
            disabled={busy}
            style={{ ...inputBase, textAlign: 'left', ...(error ? { borderColor: danger } : {}) }}
          />
        </label>

        {error && (
          <p role="alert" style={{ fontSize: 13, color: danger, margin: 0, fontWeight: 500 }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} style={primaryBtn(busy)}>
          {busy ? 'מפעיל חשבון…' : 'הפעלת חשבון'}
        </button>
      </form>

      <a href={`/client-login?email=${encodeURIComponent(email)}`} style={linkStyle}>
        כבר יש לך חשבון? כניסה ←
      </a>
    </Shell>
  )
}

// ─── Shared primitives ───────────────────────────────────────────────────────

const inputBase: CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 15, fontFamily: 'inherit',
  color: textPrimary, background: '#fff', boxSizing: 'border-box',
  border: `1px solid ${border}`, borderRadius: 2, outline: 'none',
  transition: 'border-color .15s',
}

const fieldLabel: CSSProperties = {
  fontSize: 11, fontWeight: 500, letterSpacing: '0.14em',
  color: textMuted, textTransform: 'uppercase',
}

const titleStyle: CSSProperties = {
  fontSize: 26, fontWeight: 500, margin: '0 0 12px',
  letterSpacing: '-0.02em', color: textPrimary, lineHeight: 1.15,
}

const linkStyle: CSSProperties = {
  display: 'inline-block', marginTop: 24, fontSize: 12, color: textMuted,
  textDecoration: 'none', letterSpacing: '0.04em',
}

const primaryLinkBtn: CSSProperties = {
  padding: '13px 24px', borderRadius: 2,
  background: textPrimary, border: `1px solid ${textPrimary}`,
  color: '#fff', fontSize: 11, fontWeight: 500, textDecoration: 'none',
  fontFamily: 'inherit', letterSpacing: '0.18em', textTransform: 'uppercase',
}

function primaryBtn(disabled: boolean): CSSProperties {
  return {
    marginTop: 6, padding: '13px 24px', borderRadius: 2,
    background: textPrimary, border: `1px solid ${textPrimary}`,
    color: '#fff', fontSize: 11, fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
    letterSpacing: '0.18em', textTransform: 'uppercase',
    opacity: disabled ? 0.7 : 1, transition: 'opacity .15s',
  }
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
      color: textMuted, textTransform: 'uppercase', marginBottom: 18,
    }}>{children}</div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: bg, color: textPrimary,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Heebo, Inter, sans-serif', direction: 'rtl', padding: 20,
    }}>
      <div style={{
        textAlign: 'center', width: '100%', maxWidth: 440,
        padding: '44px 36px', background: '#fff', border: `1px solid ${border}`,
        boxSizing: 'border-box',
      }}>
        {children}
        <div style={{
          marginTop: 32, fontSize: 10, color: textMuted, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>Powered by Pixflow</div>
      </div>
    </div>
  )
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div style={{
      minHeight: '100vh', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Heebo, Inter, sans-serif', direction: 'rtl',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36, border: `2px solid ${border}`,
          borderTopColor: textPrimary, borderRadius: '50%',
          animation: 'ci-spin 0.8s linear infinite', margin: '0 auto 16px',
        }} />
        <style>{`@keyframes ci-spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{
          fontSize: 11, color: textMuted, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>{label}</p>
      </div>
    </div>
  )
}
