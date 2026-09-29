import { supabase } from '@/shared/lib/supabase'

export type UserRow = {
  business_id: string
  email: string | null
  business_name: string
  slug: string | null
  created_at: string | null
  plan_id: string | null
  plan_name: string | null
  subscription_status: string | null
  balance: number
  gallery_count: number
}

export type GrantRow = {
  ledger_id: string
  business_id: string
  business_name: string | null
  amount: number
  admin_email: string | null
  reason: string | null
  request_id: string | null
  created_at: string
}

/** Call the `admin` edge function; surfaces the HTTP status + JSON body of a FunctionsHttpError. */
export async function invokeAdmin(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...payload } })
  if (error) {
    let status = 0, detail = ''
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.status === 'number') {
      status = ctx.status
      try { detail = JSON.stringify(await ctx.json()) } catch { /* ignore */ }
    }
    return { data: null, status, detail, error }
  }
  return { data, status: 200, detail: '', error: null }
}

export const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('he-IL') : '—')
