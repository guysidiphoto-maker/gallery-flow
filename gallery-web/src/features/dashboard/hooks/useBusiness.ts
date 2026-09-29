import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createBusiness, DOMAIN_COLUMNS, getOwnerBusiness } from '@/shared/data/businesses'
import type { CustomDomainStatus } from '../types'

export interface BusinessDomainRow {
  custom_domain?: string | null
  custom_domain_status?: CustomDomainStatus | null
  custom_domain_verification_token?: string | null
}

type BusinessRow = { id: string; slug: string } & BusinessDomainRow

// The photographer's business row (id + public slug). New users get one
// auto-created on first sign-in. The custom-domain columns ride along so the
// domain settings don't need a second read of the same row.
export function useBusiness(user: User | null) {
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [businessSlug, setBusinessSlug] = useState<string | null>(null)
  // undefined until the row is read; null for a brand-new business.
  const [domainRow, setDomainRow] = useState<BusinessDomainRow | null | undefined>(undefined)

  /** Resolves (or creates) the business and returns `{ id, slug }`, or null on failure. */
  async function resolveBusiness(): Promise<{ id: string; slug: string } | null> {
    const { data } = await getOwnerBusiness(user!.id, `id, slug, ${DOMAIN_COLUMNS}`)
    const biz = data as BusinessRow | null
    if (biz) {
      setBusinessId(biz.id)
      setBusinessSlug(biz.slug)
      setDomainRow(biz)
      return biz
    }
    const displayName = user!.user_metadata?.full_name || user!.user_metadata?.name || user!.email || 'Studio'
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36)
    const { data: newBiz, error } = await createBusiness(user!.id, displayName, slug)
    if (error) {
      console.error('Failed to create business:', error)
      return null
    }
    if (!newBiz) return null
    setBusinessId(newBiz.id)
    setBusinessSlug(newBiz.slug)
    setDomainRow(null)
    return newBiz
  }

  return { businessId, businessSlug, domainRow, setBusinessId, resolveBusiness }
}
