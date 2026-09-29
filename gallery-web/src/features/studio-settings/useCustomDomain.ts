import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'

export type CustomDomainStatus = 'unverified' | 'pending_dns' | 'verified' | 'error'

type DomainRow = {
  custom_domain?: string | null
  custom_domain_status?: CustomDomainStatus | null
  custom_domain_verification_token?: string | null
} | null

const DOMAIN_COLUMNS = 'custom_domain, custom_domain_status, custom_domain_verification_token'

function domainErrorToHebrew(code: string | undefined): string {
  switch (code) {
    case 'invalid_format':    return 'פורמט דומיין לא תקין — לדוגמה: photos.studio-shem.co.il'
    case 'reserved_domain':   return 'לא ניתן להשתמש בדומיין זה'
    case 'plan_not_eligible': return 'דומיין מותאם זמין רק בתכנית עסקית'
    case 'domain_taken':      return 'דומיין זה כבר בשימוש'
    case 'empty_domain':      return 'יש להזין דומיין'
    case 'no_business':       return 'לא נמצא חשבון עסקי'
    case 'not_authenticated': return 'יש להתחבר מחדש'
    default:                  return 'שגיאה לא צפויה — נסו שוב'
  }
}

/** Account-level custom domain claim: plan gate, DNS verification state, set/recheck/remove. */
export function useCustomDomain(businessId: string | null) {
  const [enabled, setEnabled] = useState(false)
  const [domain, setDomain] = useState<string | null>(null)
  const [status, setStatus] = useState<CustomDomainStatus>('unverified')
  const [token, setToken] = useState<string | null>(null)
  const [input, setInputRaw] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function applyRow(row: DomainRow) {
    setDomain(row?.custom_domain ?? null)
    setStatus((row?.custom_domain_status as CustomDomainStatus) ?? 'unverified')
    setToken(row?.custom_domain_verification_token ?? null)
  }

  // Both queries are RLS-scoped; a failure leaves the upsell card showing.
  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    void (async () => {
      const planPromise = supabase.rpc('get_my_plan')
      const bizPromise = supabase.from('businesses').select(DOMAIN_COLUMNS).eq('id', businessId).maybeSingle()
      const [{ data: planRows }, { data: bizRow }] = await Promise.all([planPromise, bizPromise])
      if (cancelled) return
      const plan = Array.isArray(planRows) ? planRows[0] : planRows
      setEnabled(Boolean((plan as { custom_domain_enabled?: boolean } | null)?.custom_domain_enabled))
      applyRow(bizRow as DomainRow)
    })()
    return () => { cancelled = true }
  }, [businessId])

  function setInput(value: string) {
    setInputRaw(value)
    setError(null)
  }

  async function submit() {
    const candidate = input.trim().toLowerCase()
    if (!candidate) {
      setError('יש להזין דומיין')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('set_business_custom_domain', { p_domain: candidate })
      if (rpcError) {
        setError('שגיאה בשמירה — נסו שוב')
        return
      }
      const result = data as { ok: boolean; domain?: string; verification_token?: string; error?: string } | null
      if (!result?.ok) {
        setError(domainErrorToHebrew(result?.error))
        return
      }
      setDomain(result.domain ?? candidate)
      setToken(result.verification_token ?? null)
      setStatus('pending_dns')
      setInputRaw('')
    } finally {
      setSaving(false)
    }
  }

  async function recheck() {
    if (!businessId) return
    const { data } = await supabase.from('businesses').select(DOMAIN_COLUMNS).eq('id', businessId).maybeSingle()
    if (data) applyRow(data as DomainRow)
  }

  async function remove() {
    if (!businessId) return
    setSaving(true)
    try {
      await supabase
        .from('businesses')
        .update({
          custom_domain: null,
          custom_domain_status: 'unverified',
          custom_domain_verification_token: null,
          custom_domain_added_at: null,
          custom_domain_verified_at: null,
        })
        .eq('id', businessId)
      applyRow(null)
      setError(null)
    } finally {
      setSaving(false)
    }
  }

  return { enabled, domain, status, token, input, setInput, saving, error, submit, recheck, remove }
}

export type CustomDomainState = ReturnType<typeof useCustomDomain>
