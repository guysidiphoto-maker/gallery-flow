// Platform-admin actions run in the `admin` edge function (service role, checks
// the caller is an admin), never as direct table access from the browser.

import { supabase } from '@/shared/lib/supabase'

/** Runs an admin action; on failure returns the HTTP status + JSON body of the FunctionsHttpError. */
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
