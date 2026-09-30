import { useState, useEffect, useRef } from 'react'
import { verifyPassword, getStoredToken } from '@/shared/data/publicGallery'
import { useFocusTrap } from '@/shared/lib/useFocusTrap'
import { cn } from '@/shared/ui'
import { CoverBackdrop } from './CoverBackdrop'

interface PasswordGateProps {
  galleryId: string
  galleryName: string
  onUnlock: () => void
  // Signed-gate galleries only auto-unlock from a fresh token, never the legacy flag.
  requireToken?: boolean
  lang?: 'he' | 'en'
  // Deliberately small, low-res render so faces can't be read before unlock.
  coverUrl?: string | null
}

// Legacy session flag: tabs unlocked before signed tokens aren't re-prompted.
const LEGACY_KEY_PREFIX = 'gf_unlocked_'

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

export function PasswordGate({ galleryId, galleryName, onUnlock, requireToken, lang = 'he', coverUrl }: PasswordGateProps) {
  const str = GATE_STRINGS[lang] ?? GATE_STRINGS.he
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const tickRef = useRef<number | null>(null)
  // A cover that fails to load falls back to the flat dark gate.
  const [coverFailed, setCoverFailed] = useState(false)
  const showCover = !!coverUrl && !coverFailed

  const gateRef = useFocusTrap<HTMLDivElement>(true)

  // Auto-unlock from a stored signed token, or (non-signed galleries) the legacy flag.
  useEffect(() => {
    if (getStoredToken(galleryId)) { onUnlock(); return }
    if (requireToken) return
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
      // verifyPassword stored the signed token; the legacy flag covers older tabs.
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
    <div
      ref={gateRef}
      className={cn(
        'fixed inset-0 z-[2000] flex animate-[gv-fade-in_.3s_ease] items-center justify-center bg-night',
        !showCover && 'gv-pw-glow',
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pw-gate-title"
    >
      {showCover && <CoverBackdrop coverUrl={coverUrl} onFailed={() => setCoverFailed(true)} />}
      <form
        className={cn(
          'relative z-1 flex w-full max-w-[380px] flex-col items-center gap-[18px] px-7 py-12',
          'animate-[gv-pw-card-enter_.5s_cubic-bezier(.16,1,.3,1)_both]',
          // Faint glass keeps the controls legible over any cover.
          showCover && 'rounded-[20px] bg-night/42 shadow-[0_24px_70px] shadow-black/50 backdrop-blur-[10px] backdrop-saturate-[1.05]',
        )}
        onSubmit={handleSubmit}
      >
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-(--viewer-success)/12 bg-(--viewer-success)/6 px-3.5 py-[5px]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-(--viewer-success)/65">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span className="text-[10px] font-semibold tracking-[.06em] text-(--viewer-success)/65 uppercase">
            {str.e2e}
          </span>
        </div>
        <h1 id="pw-gate-title" className="text-center text-[30px] leading-[1.15] font-extrabold tracking-[-0.025em] text-white/94">{galleryName}</h1>
        <p className="mb-2 text-[14px] tracking-[0.01em] text-white/62">{str.protected}</p>
        <input
          className={cn(
            'w-full rounded-[10px] border border-white/10 bg-white/5 px-[18px] py-[13px] text-[15px] text-white outline-none',
            'transition-[border-color,box-shadow,background-color] duration-200 ease-[ease] placeholder:text-white/22',
            'focus:border-gallery-accent/55 focus:bg-white/7 focus:shadow-[0_0_20px_var(--color-gallery-accent)]/8 focus:ring-3 focus:ring-gallery-accent/12',
          )}
          type="password"
          placeholder={str.enterPassword}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false) }}
          autoFocus
          disabled={locked}
          aria-describedby="pw-gate-error"
          aria-invalid={error || locked ? 'true' : undefined}
        />
        <p
          id="pw-gate-error"
          className="animate-[gv-shake_.35s_ease] text-[13px] text-(--viewer-danger-soft)"
          aria-live="polite"
          aria-atomic="true"
        >
          {locked
            ? str.tooMany(cooldownLeft)
            : error
              ? str.incorrect
              : ''}
        </p>
        <button
          className={cn(
            'w-full rounded-[10px] bg-gallery-accent/85 p-[13px] text-[15px] font-semibold text-white',
            '[transition:background-color_.15s_ease,box-shadow_.2s_ease,scale_.15s_ease] active:scale-[.98]',
            'hover:bg-gallery-accent hover:shadow-[0_4px_20px_color-mix(in_oklab,var(--color-gallery-accent)_30%,transparent),0_0_40px_color-mix(in_oklab,var(--color-gallery-accent)_10%,transparent)]',
            'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-gallery-accent',
          )}
          type="submit"
          disabled={submitting || locked}
        >
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
