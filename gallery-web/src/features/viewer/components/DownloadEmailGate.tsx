import { useState } from 'react'
import { cn } from '@/shared/ui'
import type { Lang } from '@/shared/i18n/viewerStrings'

const input = 'box-border w-full rounded-[10px] border bg-white/4 px-[13px] py-[11px] text-[14px] text-white outline-none'
const label = 'block text-[12px] text-white/50'

/** Collects an email (required) and name (optional) before the first tracked download. */
export function DownloadEmailGate({ lang, onSubmit, onClose }: {
  lang: Lang
  onSubmit: (email: string, name: string | null) => void
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const he = lang === 'he'
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const submit = () => {
    setTouched(true)
    if (!emailOk) return
    onSubmit(email.trim(), name.trim() || null)
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[4000] flex animate-[gv-fade-in_.2s_ease] items-center justify-center bg-night/72 p-5 backdrop-blur-[8px]"
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true"
        dir={he ? 'rtl' : 'ltr'}
        className="w-full max-w-[400px] rounded-[18px] border border-white/10 bg-night-raised p-7 text-start text-white shadow-[0_24px_80px] shadow-black/55"
      >
        <h3 className="mb-2 text-[19px] font-semibold">
          {he ? 'לפני ההורדה' : 'Before you download'}
        </h3>
        <p className="mb-5 text-[13px] leading-[1.5] text-white/55">
          {he
            ? 'הצלם מבקש להשאיר אימייל כדי לקבל גישה להורדת התמונות.'
            : 'The photographer asks for your email to grant access to downloads.'}
        </p>

        <label className={cn(label, 'mb-1.5')}>
          {he ? 'אימייל' : 'Email'} *
        </label>
        <input
          type="email" inputMode="email" autoFocus dir="ltr"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="you@example.com"
          className={cn(input, 'mb-1', touched && !emailOk ? 'border-(--viewer-danger-soft)/70' : 'border-white/14')}
        />
        {touched && !emailOk && (
          <p className="mb-2 text-[11px] text-(--viewer-danger-soft)/90">
            {he ? 'נא להזין כתובת אימייל תקינה' : 'Please enter a valid email'}
          </p>
        )}

        <label className={cn(label, 'mt-3 mb-1.5')}>
          {he ? 'שם (רשות)' : 'Name (optional)'}
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder={he ? 'השם שלך' : 'Your name'}
          className={cn(input, 'mb-5 border-white/14')}
        />

        <div className={cn('flex gap-2.5', he ? 'flex-row-reverse' : 'flex-row')}>
          <button
            onClick={submit}
            disabled={!emailOk}
            className={cn(
              'flex-1 rounded-[10px] px-4 py-3 text-[14px] font-semibold disabled:cursor-not-allowed',
              emailOk ? 'bg-white text-ink' : 'bg-white/15 text-white/40',
            )}
          >
            {he ? 'המשך להורדה' : 'Continue to download'}
          </button>
          <button
            onClick={onClose}
            className="rounded-[10px] border border-white/14 bg-transparent px-4 py-3 text-[14px] text-white/70"
          >
            {he ? 'ביטול' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
