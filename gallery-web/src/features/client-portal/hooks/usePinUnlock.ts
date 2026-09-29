import { useState } from 'react'
import { dashKey, tokenExpiresKey, tokenKey } from '../lib/legacySession'

/**
 * Legacy PIN verification. /api/gallery-access `verify_code` answers with
 * `{ok, token, expires_at}` (hashed PIN), `{ok, fallback_to_legacy}` (client not
 * migrated yet → plaintext compare) or `{error:'cooldown_active', cooldown_until}`.
 */
export function usePinUnlock(clientId: string, clientCode: string, onUnlocked: () => void) {
  const [codeInput, setCodeInputRaw] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const setCodeInput = (value: string) => { setCodeInputRaw(value.toUpperCase()); setCodeError(null) }

  async function tryUnlock() {
    setSubmitting(true)
    setCodeError(null)
    try {
      const res = await fetch('/api/gallery-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_code', clientId, code: codeInput }),
      })
      const json = await res.json().catch(() => ({} as Record<string, unknown>))
      if (json.ok && json.token) {
        sessionStorage.setItem(tokenKey(clientId), String(json.token))
        sessionStorage.setItem(tokenExpiresKey(clientId), String(json.expires_at))
        sessionStorage.setItem(dashKey(clientId), 'true')
        onUnlocked()
        return
      }
      if (json.ok && json.fallback_to_legacy) {
        if (codeInput === clientCode) {
          sessionStorage.setItem(dashKey(clientId), 'true')
          onUnlocked()
          return
        }
        setCodeError('קוד שגוי')
        return
      }
      if (json.error === 'cooldown_active') {
        const until = new Date(String(json.cooldown_until))
        const mins = Math.ceil((until.getTime() - Date.now()) / 60000)
        setCodeError(`יותר מדי ניסיונות שגויים. נסה שוב בעוד ${mins} דקות.`)
        return
      }
      setCodeError('קוד שגוי')
    } catch {
      setCodeError('שגיאת רשת. נסה שוב.')
    } finally {
      setSubmitting(false)
    }
  }

  return { codeInput, setCodeInput, codeError, submitting, tryUnlock }
}
