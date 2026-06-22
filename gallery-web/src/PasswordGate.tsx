import { useState, useEffect, useRef } from 'react'
import { verifyPassword, getStoredToken } from './lib/galleryClient'
import { useFocusTrap } from './lib/useFocusTrap'

interface PasswordGateProps {
  galleryId: string
  galleryName: string
  onUnlock: () => void
  // When true (gallery has signed_gate_enabled), the legacy sessionStorage
  // flag is not enough — only a fresh signed token will auto-unlock. Prevents
  // mid-rollout users from seeing an empty gallery.
  requireToken?: boolean
  // Gallery delivery language — drives the gate's copy so a Hebrew gallery no
  // longer shows an English gate. Defaults to 'he' (the app default).
  lang?: 'he' | 'en'
}

// Legacy session flag — kept so existing tabs unlocked before the rollout
// don't get re-prompted while their session is still active.
const LEGACY_KEY_PREFIX = 'gf_unlocked_'

// Gate copy in both supported languages (logic stays language-agnostic).
const GATE_STRINGS = {
  he: {
    e2e: 'מאובטח מקצה לקצה',
    protected: 'הגלריה מוגנת בסיסמה',
    enterPassword: 'הזינו סיסמה',
    incorrect: 'סיסמה שגויה',
    checking: 'בודק…',
    viewGallery: 'צפייה בגלריה',
    wait: (s: number) => `המתינו ${s} שניות`,
    tooMany: (s: number) => `יותר מדי ניסיונות. נסו שוב בעוד ${s} שניות.`,
  },
  en: {
    e2e: 'End-to-end protected',
    protected: 'This gallery is password protected',
    enterPassword: 'Enter password',
    incorrect: 'Incorrect password',
    checking: 'Checking…',
    viewGallery: 'View Gallery',
    wait: (s: number) => `Wait ${s}s`,
    tooMany: (s: number) => `Too many attempts. Try again in ${s}s.`,
  },
} as const

export function PasswordGate({ galleryId, galleryName, onUnlock, requireToken, lang = 'he' }: PasswordGateProps) {
  const str = GATE_STRINGS[lang] ?? GATE_STRINGS.he
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const tickRef = useRef<number | null>(null)

  // Focus trap — the password gate covers the entire screen and must not let
  // Tab escape into background content (WCAG 2.1.2).
  const gateRef = useFocusTrap<HTMLDivElement>(true)

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
    ? str.checking
    : locked
      ? str.wait(cooldownLeft)
      : str.viewGallery

  return (
    // role="dialog" + aria-modal signal to screen readers that this gate is a
    // blocking dialog; aria-labelledby points to the gallery title so it is
    // announced as the dialog name when focus enters (WCAG 4.1.2, 1.3.1).
    <div
      ref={gateRef}
      className="pw-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pw-gate-title"
    >
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
            {str.e2e}
          </span>
        </div>
        <h1 id="pw-gate-title" className="pw-gate__title">{galleryName}</h1>
        <p className="pw-gate__sub">{str.protected}</p>
        <input
          className="pw-gate__input"
          type="password"
          placeholder={str.enterPassword}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false) }}
          autoFocus
          disabled={locked}
          // aria-describedby links the input to its live error region so screen
          // readers announce errors immediately on change (WCAG 3.3.1).
          aria-describedby="pw-gate-error"
          aria-invalid={error || locked ? 'true' : undefined}
        />
        {/* aria-live="polite" announces the error via screen readers without
            interrupting in-progress speech (WCAG 4.1.3 Status Messages).    */}
        <p
          id="pw-gate-error"
          className="pw-gate__error"
          aria-live="polite"
          aria-atomic="true"
        >
          {locked
            ? str.tooMany(cooldownLeft)
            : error
              ? str.incorrect
              : ''}
        </p>
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
