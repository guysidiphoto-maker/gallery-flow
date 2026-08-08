import { useState, useEffect, type CSSProperties } from 'react'
import { supabase } from '../supabase'

// ─── Editorial design tokens (shared with ClientDashboard / PortfolioPage) ──
const bg = '#F2EFE9'
const border = '#D0D0D0'
const textPrimary = '#141413'
const textSecondary = '#333333'
const textMuted = '#767470'
const danger = '#dc2626'

// ─── Client Portal login ─────────────────────────────────────────────────────
// Authenticated Client Portal V2 login. Supabase email+password. On success we
// resolve the member's client via the self-scoped `client_portal_bootstrap` RPC
// and redirect to their client dashboard. Non-leaky errors throughout: we never
// reveal whether an email exists.

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

// Resolve the dashboard URL for the first active membership. Prefers the short
// slug form (/<business>/c/<client-slug>) which main.tsx routes; if the client
// slug is missing, falls back to the legacy /client/<uuid>/dashboard form.
async function resolveDashboardUrl(): Promise<string | null> {
  const { data, error } = await supabase.rpc('client_portal_bootstrap')
  if (error || !isBootstrapResult(data)) return null
  if (!data.authenticated || data.memberships.length === 0) return null
  const m = data.memberships[0]
  if (m.client_slug) {
    // Need the business slug for the short form. Look it up (RLS-safe: member
    // can read their own client's business slug via bootstrap join is not
    // exposed, so fetch the business slug explicitly).
    const { data: biz } = await supabase
      .from('businesses').select('slug').eq('id', m.business_id).maybeSingle()
    const bizSlug = (biz?.slug as string | undefined) ?? null
    if (bizSlug) return `/${bizSlug}/c/${m.client_slug}`
  }
  return `/client/${m.client_id}/dashboard`
}

export function ClientLogin() {
  // Prefill email from ?email= (e.g. redirect from the invite-accept page when
  // the invitee already had an account).
  const initialEmail = (() => {
    try {
      return new URLSearchParams(window.location.search).get('email') ?? ''
    } catch { return '' }
  })()

  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetNotice, setResetNotice] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  // If a session already exists, skip the form and go straight to the dashboard.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled || !session) return
      const url = await resolveDashboardUrl()
      if (cancelled) return
      if (url) { setRedirecting(true); window.location.replace(url) }
    })()
    return () => { cancelled = true }
  }, [])

  async function handleLogin() {
    const trimmed = email.trim()
    if (!trimmed || !password) {
      setError('נא למלא אימייל וסיסמה')
      return
    }
    setSubmitting(true)
    setError(null)
    setResetNotice(null)
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: trimmed, password,
      })
      if (signInErr) {
        // Non-leaky: same message for wrong password / unknown email.
        setError('אימייל או סיסמה שגויים')
        return
      }
      const url = await resolveDashboardUrl()
      if (!url) {
        // Authenticated but no active membership → no portal to show. Fail closed.
        await supabase.auth.signOut()
        setError('אין לחשבון זה גישה לאזור לקוחות. פנו לצלם.')
        return
      }
      setRedirecting(true)
      window.location.replace(url)
    } catch {
      setError('שגיאת רשת. נסו שוב.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleForgotPassword() {
    const trimmed = email.trim()
    if (!trimmed) {
      setError('הזינו אימייל כדי לאפס סיסמה')
      return
    }
    setSubmitting(true)
    setError(null)
    setResetNotice(null)
    try {
      // Standard Supabase recovery. Do NOT leak whether the email exists; also
      // swallow local no-SMTP failures behind the same neutral message.
      await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: window.location.origin + '/client-login',
      }).catch(() => { /* neutralized below */ })
      setResetNotice('אם קיים חשבון עם כתובת זו, נשלח אליו קישור לאיפוס סיסמה.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = (invalid: boolean): CSSProperties => ({
    width: '100%', padding: '12px 14px', fontSize: 15, fontFamily: 'inherit',
    color: textPrimary, background: '#fff', boxSizing: 'border-box',
    border: `1px solid ${invalid ? danger : border}`,
    borderRadius: 2, outline: 'none', transition: 'border-color .15s',
  })

  if (redirecting) {
    return <CenteredSpinner label="נכנס לאזור הלקוח" />
  }

  return (
    <Shell>
      <div style={{
        fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
        color: textMuted, textTransform: 'uppercase', marginBottom: 18,
      }}>Pixflow · Client Portal</div>
      <h1 style={{
        fontSize: 26, fontWeight: 500, margin: '0 0 12px',
        letterSpacing: '-0.02em', color: textPrimary, lineHeight: 1.15,
      }}>כניסה לאזור הלקוח</h1>
      <p style={{
        fontSize: 14, color: textSecondary, margin: '0 0 28px', lineHeight: 1.55,
      }}>התחברו עם האימייל והסיסמה שלכם</p>

      <form
        onSubmit={e => { e.preventDefault(); if (!submitting) void handleLogin() }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'start' }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={fieldLabel}>אימייל</span>
          <input
            type="email" inputMode="email" autoComplete="email" dir="ltr"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(null) }}
            disabled={submitting}
            placeholder="you@example.com"
            style={{ ...inputStyle(false), textAlign: 'left' }}
            autoFocus={!initialEmail}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={fieldLabel}>סיסמה</span>
          <input
            type="password" autoComplete="current-password" dir="ltr"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null) }}
            disabled={submitting}
            style={{ ...inputStyle(false), textAlign: 'left' }}
            autoFocus={!!initialEmail}
          />
        </label>

        {error && (
          <p role="alert" style={{ fontSize: 13, color: danger, margin: 0, fontWeight: 500 }}>
            {error}
          </p>
        )}
        {resetNotice && (
          <p role="status" style={{ fontSize: 13, color: textSecondary, margin: 0, lineHeight: 1.5 }}>
            {resetNotice}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={primaryBtn(submitting)}
        >
          {submitting ? 'מתחבר…' : 'כניסה'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => { if (!submitting) void handleForgotPassword() }}
        disabled={submitting}
        style={{
          marginTop: 20, background: 'transparent', border: 'none',
          color: textMuted, fontSize: 12, fontFamily: 'inherit',
          cursor: submitting ? 'not-allowed' : 'pointer',
          letterSpacing: '0.04em', padding: 4,
        }}
      >
        שכחתי סיסמה
      </button>
    </Shell>
  )
}

// ─── Shared layout primitives ────────────────────────────────────────────────

const fieldLabel: CSSProperties = {
  fontSize: 11, fontWeight: 500, letterSpacing: '0.14em',
  color: textMuted, textTransform: 'uppercase',
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
          animation: 'cl-spin 0.8s linear infinite', margin: '0 auto 16px',
        }} />
        <style>{`@keyframes cl-spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{
          fontSize: 11, color: textMuted, fontWeight: 500,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>{label}</p>
      </div>
    </div>
  )
}
