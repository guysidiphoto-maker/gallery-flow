import { useEffect, useState, type FormEvent } from 'react'
import { getActiveQuestionnaire } from '@/shared/data/questionnaires'
import type { QuestionnaireConfig } from '@/shared/types'

export type Phase = 'loading' | 'form' | 'submitting' | 'done' | 'error'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `/q/{uuid}` or `/q/{slug}`. */
function readIdOrSlug(): string {
  const match = window.location.pathname.match(/^\/q\/([^/]+)$/)
  return match?.[1] || ''
}

/** Loads the active questionnaire from the URL and owns the form state + submit. */
export function useQuestionnaire() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [config, setConfig] = useState<QuestionnaireConfig | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [consentTerms, setConsentTerms] = useState(false)
  const [consentComms, setConsentComms] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')

  const idOrSlug = readIdOrSlug()

  useEffect(() => {
    if (!idOrSlug) { setPhase('error'); return }

    getActiveQuestionnaire(UUID_RE.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }).then(({ data, error }) => {
      if (error || !data) { setPhase('error'); return }
      setConfig(data as QuestionnaireConfig)
      setPhase('form')
    })
  }, [idOrSlug])

  const clearError = (key: string) => setErrors(p => ({ ...p, [key]: false }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!config) return

    const newErrors: Record<string, boolean> = {}
    if (!name.trim()) newErrors['_name'] = true
    if (config.send_method === 'sms' && !phone.trim()) newErrors['_phone'] = true
    if (config.send_method === 'email' && !email.trim()) newErrors['_email'] = true
    if (!consentTerms) newErrors['_consentTerms'] = true
    if (!consentComms) newErrors['_consentComms'] = true

    for (const q of config.questions) {
      if (q.required && !answers[q.id]?.trim()) {
        newErrors[q.id] = true
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setPhase('submitting')

    try {
      const resp = await fetch('/api/submit-questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionnaireId: config.id,
          respondentName: name.trim(),
          respondentPhone: phone.trim() || null,
          respondentEmail: email.trim() || null,
          answers,
          turnstileToken: turnstileToken || undefined,
        }),
      })

      if (!resp.ok) {
        setPhase('form')
        return
      }

      setPhase('done')
    } catch {
      setPhase('form')
    }
  }

  return {
    phase, config, errors, handleSubmit, setTurnstileToken,
    name, setName: (v: string) => { setName(v); clearError('_name') },
    phone, setPhone: (v: string) => { setPhone(v); clearError('_phone') },
    email, setEmail: (v: string) => { setEmail(v); clearError('_email') },
    answers,
    setAnswer: (id: string, v: string) => { setAnswers(p => ({ ...p, [id]: v })); clearError(id) },
    consentTerms, setConsentTerms: (v: boolean) => { setConsentTerms(v); clearError('_consentTerms') },
    consentComms, setConsentComms: (v: boolean) => { setConsentComms(v); clearError('_consentComms') },
  }
}

export type QuestionnaireForm = ReturnType<typeof useQuestionnaire>
