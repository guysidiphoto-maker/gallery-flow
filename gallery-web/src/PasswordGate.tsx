import { useState, useEffect, useRef } from 'react'
import { verifyPassword, getStoredToken } from './lib/galleryClient'

interface PasswordGateProps {
  galleryId: string
  galleryName: string
  onUnlock: () => void
  // When true (gallery has signed_gate_enabled), the legacy sessionStorage
  // flag is not enough — only a fresh signed token will auto-unlock. Prevents
  // mid-rollout users from seeing an empty gallery.
  requireToken?: boolean
}

// Legacy session flag — kept so existing tabs unlocked before the rollout
// don't get re-prompted while their session is still active.
const LEGACY_KEY_PREFIX = 'gf_unlocked_'

export function PasswordGate({ galleryId, galleryName, onUnlock, requireToken }: PasswordGateProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const tickRef = useRef<number | null>(null)

  // Auto-unlock if a fresh signed-gate token is already stored, OR (legacy)
  // the old sessionStorage flag is set. Both are valid recognition signals
  // during the rollout; once every gallery is on the signed gate the legacy
  // branch can be removed.
  useEffect(() => {
    if (getStoredToken(galleryId)) { onUnlock(); return }
    if (requireToken) return  // signed-gate gallery: never honour legacy flag
    if (sessionStorage.getItem(LEGACY_KEY_PREFIX + galleryId) === '1') onUnlock()
  }, [galleryId, onUnlock, requireToken])

  useEffect(() => {
    if (cooldownLeft <= 0) return
    tickRef.current = window.setTimeout(() => {
      setCooldownLeft(s => Math.max(0, s - 1))
    }, 1000)
    return () => {
      if (tickRef.current !== null) window.clearTimeout(tickRef.current)
    }
  }, [cooldownLeft])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || cooldownLeft > 0) return
    setSubmitting(true)
    const res = await verifyPassword(galleryId, value)
    setSubmitting(false)

    if (res.ok === true) {
      // verifyPassword already stashed the signed token (if any) in
      // localStorage; flip the legacy flag too so older tabs/code paths
      // still recognise the unlock.
      sessionStorage.setItem(LEGACY_KEY_PREFIX + galleryId, '1')
      onUnlock()
      return
    }

    if (res.retry_after_seconds && res.retry_after_seconds > 0) {
      setCooldownLeft(res.retry_after_seconds)
      setError(false)
    } else {
      setError(true)
    }
    setValue('')
  }

  const locked = cooldownLeft > 0
  const btnLabel = submitting
    ? 'Checking…'
    : locked
      ? `Wait ${cooldownLeft}s`
      : 'View Gallery'

  return (
    <div className="pw-gate">
      <form className="pw-gate__card" onSubmit={handleSubmit}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 14px', borderRadius: 999, marginBottom: 8,
          background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.12)',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,.65)" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', color: 'rgba(34,197,94,.65)', textTransform: 'uppercase' }}>
            End-to-end protected
          </span>
        </div>
        <h1 className="pw-gate__title">{galleryName}</h1>
        <p className="pw-gate__sub">This gallery is password protected</p>
        <input
          className="pw-gate__input"
          type="password"
          placeholder="Enter password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false) }}
          autoFocus
          disabled={locked}
        />
        {locked && (
          <p className="pw-gate__error">
            Too many attempts. Try again in {cooldownLeft}s.
          </p>
        )}
        {error && !locked && <p className="pw-gate__error">Incorrect password</p>}
        <button className="pw-gate__btn" type="submit" disabled={submitting || locked}>
          {btnLabel}
        </button>
      </form>
    </div>
  )
}

export function isGalleryUnlocked(galleryId: string): boolean {
  if (getStoredToken(galleryId)) return true
  return sessionStorage.getItem(LEGACY_KEY_PREFIX + galleryId) === '1'
}
