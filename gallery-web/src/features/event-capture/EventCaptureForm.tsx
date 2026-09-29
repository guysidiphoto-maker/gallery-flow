import { Input, Spinner, cn } from '@/shared/ui'
import { TurnstileWidget } from '@/shared/ui/TurnstileWidget'
import { LeadField } from './LeadField'
import type { EventCaptureForm as Form } from './useEventCapture'

// Unset in local dev: the widget isn't rendered and the server falls back to rate limiting.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY as string | undefined

// Direction stays RTL even on dir="ltr" inputs, matching the original layout.
function inputClass(hasError: boolean) {
  return cn(
    'appearance-none rounded-[12px] border-white/10 bg-white/5 px-4 py-3.5 text-[16px] leading-normal text-white',
    'transition-[border-color] duration-200 [direction:rtl] placeholder:text-white/20 focus:border-brand/50',
    hasError && 'border-(--ec-error-border)',
  )
}

export function EventCaptureForm({ form }: { form: Form }) {
  const { event, phase } = form
  if (!event) return null
  const submitting = phase === 'submitting'

  return (
    <div className="w-full max-w-[400px] animate-[ec-fade-in_0.5s_ease_both] pt-[max(env(safe-area-inset-top,0px),40px)] pb-10">
      {event.logo_url && (
        <div className="mb-5 text-center">
          <img src={event.logo_url} alt="" className="h-10 max-w-[160px] object-contain opacity-70" />
        </div>
      )}

      <h1 className="mb-2 text-center text-[24px] leading-[1.3] font-extrabold">{event.name}</h1>

      <p className="mb-8 text-center text-[15px] leading-[1.6] text-white/45">
        {event.welcome_text || 'קבלו את הגלריה שלכם ישירות לוואטסאפ'}
      </p>

      {form.offline && (
        <div className="mb-4 rounded-md border border-(--ec-warning)/20 bg-(--ec-warning)/8 px-3.5 py-2.5 text-center text-[13px] text-(--ec-warning)">
          אין חיבור לאינטרנט — נשלח ברגע שתתחבר
        </div>
      )}

      <form onSubmit={form.handleSubmit}>
        <LeadField label="שם מלא" error={form.nameError && 'נא להזין שם'}>
          <Input
            type="text"
            value={form.name}
            onChange={e => form.setName(e.target.value)}
            placeholder="הכנס שם מלא"
            autoComplete="name"
            className={inputClass(form.nameError)}
          />
        </LeadField>

        <LeadField label="מספר טלפון" error={form.phoneError && 'מספר הטלפון לא תקין'}>
          <Input
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={e => form.setPhone(e.target.value)}
            placeholder="050-1234567"
            autoComplete="tel"
            className={inputClass(form.phoneError)}
            dir="ltr"
          />
        </LeadField>

        <LeadField className="mb-6" label={<>אימייל <span className="text-white/25">(לא חובה)</span></>}>
          <Input
            type="email"
            inputMode="email"
            value={form.email}
            onChange={e => form.setEmail(e.target.value)}
            placeholder="example@mail.com"
            autoComplete="email"
            className={inputClass(false)}
            dir="ltr"
          />
        </LeadField>

        <p className="mb-5 text-center text-[11px] leading-[1.6] text-white/25">
          בלחיצה על &quot;שלח&quot; אני מסכים/ה לקבל הודעה עם קישור לגלריית התמונות
        </p>

        {TURNSTILE_SITE_KEY && (
          <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onToken={form.setTurnstileToken} />
        )}

        <button
          type="submit"
          disabled={submitting}
          className={cn(
            'flex w-full items-center justify-center gap-2.5 rounded-[14px] border-none px-6 py-4',
            'bg-linear-135/srgb from-brand to-brand-violet text-[17px] font-bold text-white',
            'transition-[opacity,transform] duration-[200ms,150ms]',
            submitting ? 'cursor-wait opacity-70' : 'cursor-pointer',
          )}
        >
          {submitting ? (
            <>
              <Spinner className="size-[18px] animate-[spin_0.7s_linear_infinite] border-white/25 border-t-white" />
              שולח...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.29-1.244L4 20l1.244-3.71A8 8 0 1 1 12 20z" />
              </svg>
              שלח לי את הגלריה
            </>
          )}
        </button>
      </form>
    </div>
  )
}
