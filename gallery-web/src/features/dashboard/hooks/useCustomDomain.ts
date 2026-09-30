import { useEffect, useState } from 'react'
import { claimCustomDomain, clearCustomDomain, getCustomDomain, getMyPlan } from '@/shared/data/businesses'
import { VALID_DOMAIN, domainErrorToHebrew } from '../lib/customDomain'
import type { CustomDomainStatus } from '../types'
import type { BusinessDomainRow } from './useBusiness'

// Account-level custom domain: the plan flag plus the businesses row claim.
// Both reads are RLS-scoped; on error the UI falls back to the upsell card.
// `domainRow` is the dashboard's business row; it's only re-read when absent.
export function useCustomDomain(businessId: string | null, domainRow?: BusinessDomainRow | null) {
  const [customDomainEnabled, setCustomDomainEnabled] = useState<boolean>(false)
  const [customDomain, setCustomDomain] = useState<string | null>(null)
  const [customDomainStatus, setCustomDomainStatus] = useState<CustomDomainStatus>('unverified')
  const [customDomainToken, setCustomDomainToken] = useState<string | null>(null)
  const [domainInput, setDomainInput] = useState<string>('')
  const [domainSaving, setDomainSaving] = useState(false)
  const [domainError, setDomainError] = useState<string | null>(null)
  const [domainCopied, setDomainCopied] = useState(false)

  function applyRow(row: BusinessDomainRow | null) {
    setCustomDomain(row?.custom_domain ?? null)
    setCustomDomainStatus((row?.custom_domain_status as CustomDomainStatus) ?? 'unverified')
    setCustomDomainToken(row?.custom_domain_verification_token ?? null)
  }

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    void (async () => {
      const rowPromise = domainRow !== undefined ? Promise.resolve({ data: domainRow }) : getCustomDomain(businessId)
      const [{ data: planRows }, { data: bizRow }] = await Promise.all([getMyPlan(), rowPromise])
      if (cancelled) return
      const plan = Array.isArray(planRows) ? planRows[0] : planRows
      setCustomDomainEnabled(Boolean((plan as { custom_domain_enabled?: boolean } | null)?.custom_domain_enabled))
      applyRow(bizRow as BusinessDomainRow | null)
    })()
    return () => { cancelled = true }
    // domainRow arrives in the same render as businessId; later changes are local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const { data, error } = await claimCustomDomain(candidate)
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
    const { data } = await getCustomDomain(businessId)
    if (data) applyRow(data as BusinessDomainRow)
  }

  // Direct UPDATE is safe (owner-only RLS policy). Nulling everything frees
  // the value in the unique index.
  async function removeCustomDomain() {
    if (!businessId) return
    setDomainSaving(true)
    try {
      await clearCustomDomain(businessId)
      applyRow(null)
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
