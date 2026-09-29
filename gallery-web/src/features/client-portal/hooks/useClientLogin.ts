import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { resolveDashboardUrl } from '../lib/bootstrap'

/** Email+password member login. Errors never reveal whether an email exists. */
export function useClientLogin(initialEmail: string) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetNotice, setResetNotice] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  // An existing session skips the form.
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
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: trimmed, password })
      if (signInErr) {
        setError('אימייל או סיסמה שגויים')
        return
      }
      const url = await resolveDashboardUrl()
      if (!url) {
        // Signed in but no active membership: fail closed.
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
      // Same neutral notice whether or not the email exists (or SMTP fails).
      await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: window.location.origin + '/client-login',
      }).catch(() => { /* neutralized below */ })
      setResetNotice('אם קיים חשבון עם כתובת זו, נשלח אליו קישור לאיפוס סיסמה.')
    } finally {
      setSubmitting(false)
    }
  }

  const changeEmail = (v: string) => { setEmail(v); setError(null) }
  const changePassword = (v: string) => { setPassword(v); setError(null) }

  return {
    email, password, changeEmail, changePassword,
    submitting, error, resetNotice, redirecting, handleLogin, handleForgotPassword,
  }
}
