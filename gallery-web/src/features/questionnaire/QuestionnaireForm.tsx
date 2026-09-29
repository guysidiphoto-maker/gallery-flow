import { Input, Spinner, Textarea, cn } from '@/shared/ui'
import { TurnstileWidget } from '@/shared/ui/TurnstileWidget'
import { ConsentCheckbox } from './ConsentCheckbox'
import { FormField } from './FormField'
import { GRADIENT_CTA, inputClass } from './fieldStyles'
import type { QuestionnaireForm as Form } from './useQuestionnaire'

// Unset in local dev: the widget isn't rendered and the server falls back to rate limiting.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY as string | undefined

export function QuestionnaireForm({ form, dark }: { form: Form; dark: boolean }) {
  const { config, errors, phase } = form
  if (!config) return null
  const submitting = phase === 'submitting'

  return (
    <div
      className={cn(
        'relative z-[1] mt-5 w-full max-w-[440px] animate-[q-fade-in_0.5s_ease_both] rounded-[20px] border py-9',
        dark
          ? 'border-white/10 bg-black/55 px-7 backdrop-blur-lg'
          : 'border-(--q-input-border) bg-white px-8 shadow-[0_4px_24px] shadow-black/6',
      )}
    >
      <h1 className="mb-2 text-center text-[24px] leading-[1.3] font-extrabold">{config.title}</h1>

      {config.description && (
        <p className="mb-8 text-center text-[15px] leading-[1.6] text-(--q-muted)">{config.description}</p>
      )}

      <form onSubmit={form.handleSubmit}>
        <FormField label="שם מלא *" error={errors['_name'] && 'נא להזין שם'}>
          <Input
            type="text"
            value={form.name}
            onChange={e => form.setName(e.target.value)}
            placeholder="הכנס שם מלא"
            autoComplete="name"
            className={inputClass(errors['_name'])}
          />
        </FormField>

        <FormField
          label={<>טלפון {config.send_method === 'sms' ? '*' : <span className="text-(--q-faint)">(לא חובה)</span>}</>}
          error={errors['_phone'] && 'נא להזין מספר טלפון'}
        >
          <Input
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={e => form.setPhone(e.target.value)}
            placeholder="050-1234567"
            autoComplete="tel"
            className={inputClass(errors['_phone'])}
            dir="ltr"
          />
        </FormField>

        {config.send_method === 'email' && (
          <FormField label="אימייל *" error={errors['_email'] && 'נא להזין כתובת אימייל'}>
            <Input
              type="email"
              inputMode="email"
              value={form.email}
              onChange={e => form.setEmail(e.target.value)}
              placeholder="example@mail.com"
              autoComplete="email"
              className={inputClass(errors['_email'])}
              dir="ltr"
            />
          </FormField>
        )}

        {config.questions.map(q => (
          <FormField key={q.id} label={<>{q.label} {q.required && '*'}</>} error={errors[q.id] && 'שדה חובה'}>
            <Textarea
              value={form.answers[q.id] || ''}
              onChange={e => form.setAnswer(q.id, e.target.value)}
              placeholder="הקלד תשובה..."
              className={cn(inputClass(errors[q.id]), 'min-h-20')}
            />
          </FormField>
        ))}

        <ConsentCheckbox
          className="mt-5 mb-2.5"
          checked={form.consentTerms}
          onChange={form.setConsentTerms}
          error={errors['_consentTerms'] && 'יש לאשר את התקנון ומדיניות הפרטיות'}
        >
          אני מסכים/ה ל<a href="/terms" target="_blank" className="text-(--q-link) underline">תקנון השימוש</a> ול<a href="/privacy" target="_blank" className="text-(--q-link) underline">מדיניות הפרטיות</a>.
        </ConsentCheckbox>

        <ConsentCheckbox
          className="mb-1"
          checked={form.consentComms}
          onChange={form.setConsentComms}
          error={errors['_consentComms'] && 'יש לאשר קבלת הודעות'}
        >
          אני מאשר/ת שליחת הודעות הכוללות אישורים, הנחיות והודעות אחרות לכתובת הדואר האלקטרוני ומספר הטלפון שסיפקתי.
        </ConsentCheckbox>

        {TURNSTILE_SITE_KEY && (
          <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onToken={form.setTurnstileToken} />
        )}

        <button
          type="submit"
          disabled={submitting}
          className={cn(
            GRADIENT_CTA,
            'mt-6 flex w-full items-center justify-center gap-2.5 rounded-[14px] border-none px-6 py-4 text-[17px] transition-opacity duration-200',
            submitting ? 'cursor-wait opacity-70' : 'cursor-pointer',
          )}
        >
          {submitting ? (
            <>
              <Spinner className="size-[18px] animate-[spin_0.7s_linear_infinite] border-white/25 border-t-white" />
              שולח...
            </>
          ) : 'שלח'}
        </button>
      </form>
    </div>
  )
}
