import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { invokeAdmin } from '@/shared/data/admin'
import type { GrantRow, UserRow } from './adminApi'

export const PAGE_SIZE = 25

export type AdminToast = { kind: 'ok' | 'err'; text: string }

/** User list, audit log and the grant-credits flow, all via the `admin` edge function. */
export function useAdminUsers(user: User | null, authLoading: boolean) {
  const [rows, setRows] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [denied, setDenied] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [audit, setAudit] = useState<GrantRow[]>([])

  const [target, setTarget] = useState<UserRow | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [granting, setGranting] = useState(false)
  const [toast, setToast] = useState<AdminToast | null>(null)
  // Stable request id per open modal → retries/double-clicks are idempotent.
  const requestIdRef = useRef<string>('')

  const load = useCallback(async (nextOffset: number, nextSearch: string) => {
    setLoading(true); setErr(null)
    const { data, status, detail } = await invokeAdmin('list_users', { search: nextSearch, limit: PAGE_SIZE, offset: nextOffset })
    setLoading(false)
    if (status === 403) { setDenied(true); return }
    if (status === 401) { setErr('נא להתחבר מחדש.'); return }
    if (!data) { setErr('שגיאה בטעינת המשתמשים.' + (detail ? ` (${detail})` : '')); return }
    const d = data as { rows: UserRow[]; total: number }
    setRows(d.rows); setTotal(d.total); setOffset(nextOffset)
  }, [])

  const loadAudit = useCallback(async () => {
    const { data } = await invokeAdmin('recent_grants', { limit: 50 })
    if (data) setAudit((data as { rows: GrantRow[] }).rows)
  }, [])

  // Keyed on the user id: token refreshes replace the user object and would reset the list.
  const userId = user?.id
  useEffect(() => {
    if (authLoading || !userId) return
    void load(0, '')
    void loadAudit()
  }, [authLoading, userId, load, loadAudit])

  const amountNum = useMemo(() => Number(amount), [amount])
  const amountValid = Number.isInteger(amountNum) && amountNum > 0 && amountNum <= 1_000_000

  function openGrant(row: UserRow) {
    setTarget(row); setAmount(''); setReason(''); setToast(null)
    requestIdRef.current = crypto.randomUUID()
  }

  async function confirmGrant() {
    if (!target || !amountValid || granting) return
    setGranting(true); setToast(null)
    const { data, status, detail } = await invokeAdmin('grant_credits', {
      business_id: target.business_id, amount: amountNum, reason, request_id: requestIdRef.current,
    })
    setGranting(false)
    if (status === 403) { setToast({ kind: 'err', text: 'אין לך הרשאת מנהל.' }); return }
    if (!data) { setToast({ kind: 'err', text: 'הענקת הקרדיטים נכשלה.' + (detail ? ` (${detail})` : '') }); return }
    const res = data as { granted: boolean; duplicate: boolean; balance: number }
    // Only trust the server-confirmed balance.
    setRows(prev => prev.map(r => r.business_id === target.business_id ? { ...r, balance: res.balance } : r))
    setToast({ kind: 'ok', text: res.duplicate
      ? `הבקשה כבר בוצעה קודם (ללא חיוב כפול). היתרה: ${res.balance.toLocaleString('he-IL')} קרדיטים.`
      : `הוענקו ${amountNum.toLocaleString('he-IL')} קרדיטים. יתרה חדשה: ${res.balance.toLocaleString('he-IL')}.` })
    setTarget(null)
    void loadAudit()
  }

  return {
    rows, total, offset, search, setSearch, loading, denied, err, audit, load,
    grant: { target, setTarget, amount, setAmount, reason, setReason, granting, amountValid, openGrant, confirmGrant },
    toast,
  }
}

export type GrantState = ReturnType<typeof useAdminUsers>['grant']
