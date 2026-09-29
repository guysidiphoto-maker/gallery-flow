import { Button, Field, Input, PageLoader } from '@/shared/ui'
import { useClientLogin } from './hooks/useClientLogin'
import { AuthShell } from './components/AuthShell'
import { CardHeading } from './components/CardHeading'

const inputClass = 'px-3.5 py-3 text-left text-[15px]'

export function ClientLogin() {
  // ?email= prefill, e.g. from the invite page when the invitee already had an account.
  const initialEmail = (() => {
    try {
      return new URLSearchParams(window.location.search).get('email') ?? ''
    } catch { return '' }
  })()

  const {
    email, password, changeEmail, changePassword,
    submitting, error, resetNotice, redirecting, handleLogin, handleForgotPassword,
  } = useClientLogin(initialEmail)

  if (redirecting) return <PageLoader dir="rtl" label="נכנס לאזור הלקוח" />

  return (
    <AuthShell>
      <CardHeading
        as="h1"
        eyebrow="Pixflow · Client Portal"
        title="כניסה לאזור הלקוח"
        lead="התחברו עם האימייל והסיסמה שלכם"
        leadClassName="mb-7"
      />

      <form
        onSubmit={e => { e.preventDefault(); if (!submitting) void handleLogin() }}
        className="flex flex-col gap-3.5 text-start"
      >
        <Field label="אימייל" className="gap-1.5">
          <Input
            type="email" inputMode="email" autoComplete="email" dir="ltr"
            value={email}
            onChange={e => changeEmail(e.target.value)}
            disabled={submitting}
            placeholder="you@example.com"
            className={inputClass}
            autoFocus={!initialEmail}
          />
        </Field>
        <Field label="סיסמה" className="gap-1.5">
          <Input
            type="password" autoComplete="current-password" dir="ltr"
            value={password}
            onChange={e => changePassword(e.target.value)}
            disabled={submitting}
            className={inputClass}
            autoFocus={!!initialEmail}
          />
        </Field>

        {error && <p role="alert" className="text-[13px] font-medium text-danger-strong">{error}</p>}
        {resetNotice && <p role="status" className="text-[13px] leading-normal text-ink-soft">{resetNotice}</p>}

        <Button type="submit" disabled={submitting} className="mt-1.5 px-6 py-[13px] disabled:opacity-70">
          {submitting ? 'מתחבר…' : 'כניסה'}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => { if (!submitting) void handleForgotPassword() }}
        disabled={submitting}
        className="mt-5 bg-transparent p-1 text-xs tracking-[0.04em] text-muted disabled:cursor-not-allowed"
      >
        שכחתי סיסמה
      </button>
    </AuthShell>
  )
}
