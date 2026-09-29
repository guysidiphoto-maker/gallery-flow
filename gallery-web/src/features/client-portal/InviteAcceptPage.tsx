import { Button, Field, Input, PageLoader, cn } from '@/shared/ui'
import { useInviteAccept } from './hooks/useInviteAccept'
import { AuthShell } from './components/AuthShell'
import { CardHeading } from './components/CardHeading'

const EYEBROW = 'Pixflow · Client Portal'
const inputClass = 'px-3.5 py-3 text-left text-[15px]'
const linkClass = 'mt-6 inline-block text-xs tracking-[0.04em] text-muted no-underline'

/** `/client-invite/accept?token=…` */
export function ClientInviteAccept() {
  const token = (() => {
    try {
      return new URLSearchParams(window.location.search).get('token') ?? ''
    } catch { return '' }
  })()

  const {
    phase, email, clientName, password, confirm, error, changePassword, changeConfirm, handleAccept,
  } = useInviteAccept(token)
  const loginHref = `/client-login?email=${encodeURIComponent(email)}`

  if (phase === 'loading') return <PageLoader dir="rtl" label="בודק הזמנה" />
  if (phase === 'redirecting') return <PageLoader dir="rtl" label="נכנס לאזור הלקוח" />

  if (phase === 'invalid') {
    return (
      <AuthShell>
        <CardHeading
          as="h1"
          eyebrow={EYEBROW}
          title="ההזמנה אינה תקפה"
          lead="הקישור שקיבלת אינו תקף או שפג תוקפו. בקשו מהצלם לשלוח הזמנה חדשה."
          leadClassName="mb-2"
        />
        <a href="/client-login" className={linkClass}>יש לך כבר חשבון? כניסה ←</a>
      </AuthShell>
    )
  }

  if (phase === 'requires_login') {
    return (
      <AuthShell>
        <div className="mx-auto mb-[18px] flex size-11 items-center justify-center rounded-full bg-sage/14 text-[22px] font-semibold text-sage">
          ✓
        </div>
        <CardHeading
          as="h1"
          eyebrow={EYEBROW}
          title="כבר קיים לך חשבון"
          lead="חיברנו את ההזמנה לחשבון הקיים שלך. התחברו עם הסיסמה הקיימת שלך."
          leadClassName="mb-6"
        />
        <a
          href={loginHref}
          className="inline-block rounded-hair border border-ink bg-ink px-6 py-[13px] text-eyebrow tracking-label text-white uppercase no-underline"
        >
          כניסה עם החשבון הקיים
        </a>
      </AuthShell>
    )
  }

  const busy = phase === 'accepting'
  const invalidClass = error ? 'border-danger-strong focus:border-danger-strong' : undefined
  return (
    <AuthShell>
      <CardHeading
        as="h1"
        eyebrow={EYEBROW}
        title={clientName ? `הוזמנת ל${clientName}` : 'קבלת הזמנה'}
        lead="בחרו סיסמה כדי להשלים את ההרשמה לאזור הלקוח."
        leadClassName="mb-6"
      />

      <form
        onSubmit={e => { e.preventDefault(); if (!busy) void handleAccept() }}
        className="flex flex-col gap-3.5 text-start"
      >
        <Field label="אימייל" className="gap-1.5">
          <Input
            type="email" value={email} readOnly dir="ltr" aria-readonly="true"
            className={cn(inputClass, 'cursor-default bg-surface text-muted focus:border-line')}
          />
        </Field>
        <Field label="סיסמה (לפחות 8 תווים)" className="gap-1.5">
          <Input
            type="password" autoComplete="new-password" dir="ltr"
            value={password}
            onChange={e => changePassword(e.target.value)}
            disabled={busy}
            className={cn(inputClass, invalidClass)}
            autoFocus
          />
        </Field>
        <Field label="אימות סיסמה" className="gap-1.5">
          <Input
            type="password" autoComplete="new-password" dir="ltr"
            value={confirm}
            onChange={e => changeConfirm(e.target.value)}
            disabled={busy}
            className={cn(inputClass, invalidClass)}
          />
        </Field>

        {error && <p role="alert" className="text-[13px] font-medium text-danger-strong">{error}</p>}

        <Button type="submit" disabled={busy} className="mt-1.5 px-6 py-[13px] disabled:opacity-70">
          {busy ? 'מפעיל חשבון…' : 'הפעלת חשבון'}
        </Button>
      </form>

      <a href={loginHref} className={linkClass}>כבר יש לך חשבון? כניסה ←</a>
    </AuthShell>
  )
}
