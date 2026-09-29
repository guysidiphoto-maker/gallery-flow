import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { VALID_DOMAIN, domainErrorToHebrew } from '../lib/customDomain'
import type { CustomDomainStatus } from '../types'

type BusinessDomainRow = {
  custom_domain?: string | null
  custom_domain_status?: CustomDomainStatus | null
  custom_domain_verification_token?: string | null
} | null

const DOMAIN_COLUMNS = 'custom_domain, custom_domain_status, custom_domain_verification_token'

// Account-level custom domain: the plan flag plus the businesses row claim.
// Both reads are RLS-scoped; on error the UI falls back to the upsell card.
export function useCustomDomain(businessId: string | null) {
  const [customDomainEnabled, setCustomDomainEnabled] = useState<boolean>(false)
  const [customDomain, setCustomDomain] = useState<string | null>(null)
  const [customDomainStatus, setCustomDomainStatus] = useState<CustomDomainStatus>('unverified')
  const [customDomainToken, setCustomDomainToken] = useState<string | null>(null)
  const [domainInput, setDomainInput] = useState<string>('')
  const [domainSaving, setDomainSaving] = useState(false)
  const [domainError, setDomainError] = useState<string | null>(null)
  const [domainCopied, setDomainCopied] = useState(false)

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    void (async () => {
      const planPromise = supabase.rpc('get_my_plan')
      const bizPromise = supabase
        .from('businesses')
        .select(DOMAIN_COLUMNS)
        .eq('id', businessId)
        .maybeSingle()
      const [{ data: planRows }, { data: bizRow }] = await Promise.all([planPromise, bizPromise])
      if (cancelled) return
      const plan = Array.isArray(planRows) ? planRows[0] : planRows
      setCustomDomainEnabled(Boolean((plan as { custom_domain_enabled?: boolean } | null)?.custom_domain_enabled))
      const row = bizRow as BusinessDomainRow
      setCustomDomain(row?.custom_domain ?? null)
      setCustomDomainStatus((row?.custom_domain_status as CustomDomainStatus) ?? 'unverified')
      setCustomDomainToken(row?.custom_domain_verification_token ?? null)
    })()
    return () => { cancelled = true }
  }, [businessId])

  async function submitCustomDomain() {
    const candidate = domainInput.trim().toLowerCase()
    if (!candidate) {
      setDomainError('יש להזין דומיין')
      return
    }
    if (!VALID_DOMAIN.test(candidate)) {
      setDomainError('דומיין לא תקין — דוגמה: photos.studio.co.il')
      return
    }
    setDomainSaving(true)
    setDomainError(null)
    try {
      const { data, error } = await supabase.rpc('set_business_custom_domain', { p_domain: candidate })
      if (error) {
        setDomainError(`שגיאה בשמירה — ${error.message}`)
        console.warn('[set_business_custom_domain]', error)
        return
      }
      const result = data as {
        ok: boolean
        domain?: string
        verification_token?: string
        dns_record?: { type: string; name: string; value: string }
        error?: string
      } | null
      if (!result?.ok) {
        setDomainError(domainErrorToHebrew(result?.error))
        return
      }
      setCustomDomain(result.domain ?? candidate)
      setCustomDomainToken(result.verification_token ?? null)
      setCustomDomainStatus('pending_dns')
      setDomainInput('')
    } finally {
      setDomainSaving(false)
    }
  }

  // No server-side DNS check yet: re-read the row so the UI reflects the DB
  // (e.g. a claim made from another tab).
  async function recheckCustomDomain() {
    if (!businessId) return
    const { data } = await supabase
      .from('businesses')
      .select(DOMAIN_COLUMNS)
      .eq('id', businessId)
      .maybeSingle()
    const row = data as BusinessDomainRow
    if (row) {
      setCustomDomain(row.custom_domain ?? null)
      setCustomDomainStatus((row.custom_domain_status as CustomDomainStatus) ?? 'unverified')
      setCustomDomainToken(row.custom_domain_verification_token ?? null)
    }
  }

  // Direct UPDATE is safe (owner-only RLS policy). Nulling everything frees
  // the value in the unique index.
  async function removeCustomDomain() {
    if (!businessId) return
    setDomainSaving(true)
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
      setCustomDomain(null)
      setCustomDomainStatus('unverified')
      setCustomDomainToken(null)
      setDomainError(null)
    } finally {
      setDomainSaving(false)
    }
  }

  async function copyVerificationToken(token: string) {
    try {
      await navigator.clipboard.writeText(token)
      setDomainCopied(true)
      setTimeout(() => setDomainCopied(false), 1500)
    } catch {
      // Clipboard may be blocked; the value is on screen for manual copy.
    }
  }

  function changeDomainInput(value: string) {
    setDomainInput(value)
    setDomainError(null)
  }

  return {
    customDomainEnabled, customDomain, customDomainStatus, customDomainToken,
    domainInput, domainSaving, domainError, domainCopied,
    changeDomainInput, submitCustomDomain, recheckCustomDomain, removeCustomDomain, copyVerificationToken,
  }
}

export type CustomDomainState = ReturnType<typeof useCustomDomain>
