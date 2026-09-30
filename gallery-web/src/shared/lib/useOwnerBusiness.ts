import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useAuth } from './auth'
import { getOwnerBusiness } from '@/shared/data/businesses'

export type OwnerBusinessStatus = 'loading' | 'signed-out' | 'no-business' | 'ready'

export interface OwnerBusinessState<Row> {
  /** loading → auth or the business lookup is still pending. */
  status: OwnerBusinessStatus
  user: User | null
  /** True only while the auth session is resolving (not the business lookup). */
  authLoading: boolean
  business: Row | null
  businessId: string | null
}

/**
 * Signed-in owner + their `businesses` row (looked up by user_id, RLS-scoped).
 * Pages decide what to do per status (redirect, sign-in gate, keep rendering).
 * `columns` is the select list; it must include `id`.
 */
export function useOwnerBusiness<Row extends { id: string } = { id: string }>(
  columns = 'id',
): OwnerBusinessState<Row> {
  const { user, loading: authLoading } = useAuth()
  const [business, setBusiness] = useState<Row | null>(null)
  const [resolvedFor, setResolvedFor] = useState<string | null>(null)
  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void getOwnerBusiness(userId, columns)
      .then(({ data }) => {
        if (cancelled) return
        setBusiness((data as unknown as Row | null) ?? null)
        setResolvedFor(userId)
      })
    return () => { cancelled = true }
  }, [userId, columns])

  const status: OwnerBusinessStatus =
    authLoading ? 'loading'
      : !userId ? 'signed-out'
        : resolvedFor !== userId ? 'loading'
          : business ? 'ready' : 'no-business'

  const current = status === 'ready' ? business : null
  return { status, user, authLoading, business: current, businessId: current?.id ?? null }
}
