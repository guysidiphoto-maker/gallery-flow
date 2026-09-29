import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { resolveDashboardUrl } from '../lib/bootstrap'

const MIN_PASSWORD = 8

interface ValidateResponse {
  ok: boolean
  valid: boolean
  email: string | null
  client_name: string | null
  expired: boolean
  status: string | null
}
type AcceptResponse =
  | { ok: true; email: string; requires_login: boolean }
  | { ok: false; error: string }

const ACCEPT_ERROR_HE: Record<string, string> = {
  weak_password: 'הסיסמה חייבת להכיל לפחות 8 תווים.',
  invalid_email: 'כתובת האימייל אינה תקינה.',
  invitation_invalid: 'ההזמנה אינה תקפה או שפג תוקפה.',
  token_required: 'קישור ההזמנה חסר או שגוי.',
}

export type InvitePhase = 'loading' | 'invalid' | 'form' | 'accepting' | 'redirecting' | 'requires_login'

/**
 * Validates an invitation token and accepts it. A pre-existing account keeps its
 * password (we never set a new one) and is routed to /client-login instead.
 */
export function useInviteAccept(token: string) {
  const [phase, setPhase] = useState<InvitePhase>('loading')
  const [email, setEmail] = useState<string>('')
  const [clientName, setClientName] = useState<string>('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

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
        setPhase('requires_login')
        return
      }
      // New account with the chosen password → sign in right away.
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr) {
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

  const changePassword = (v: string) => { setPassword(v); setError(null) }
  const changeConfirm = (v: string) => { setConfirm(v); setError(null) }

  return { phase, email, clientName, password, confirm, error, changePassword, changeConfirm, handleAccept }
}
