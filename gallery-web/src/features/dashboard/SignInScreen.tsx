import { Button } from '@/shared/ui'
import { signInWithGoogle } from '@/shared/lib/auth'

// Editorial sign-in: tracked wordmark, hairline rule, outlined CTA that inverts on hover.
export function SignInScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6 [direction:rtl]">
      <div className="w-full max-w-[420px] text-center">
        <div className="mb-7 text-[11px] font-medium tracking-[0.32em] text-muted uppercase">
          Pixflow
        </div>
        <div className="mx-auto mb-7 h-px w-7 bg-line" />
        <h1 className="mb-3.5 text-[28px] leading-[1.2] font-normal tracking-[-0.015em] text-ink">
          כניסה לחשבון
        </h1>
        <p className="mb-10 text-[13px] leading-[1.6] text-ink-soft">
          ניהול הגלריות, פרסום ושיתוף עם הלקוחות.
        </p>
        <Button variant="secondary" size="lg" onClick={signInWithGoogle} className="gap-2.5 px-[30px] text-[11px]">
          <svg width="13" height="13" viewBox="0 0 48 48" aria-hidden="true" fill="currentColor">
            <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
          </svg>
          התחברות עם Google
        </Button>
      </div>
    </div>
  )
}
