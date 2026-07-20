import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// admin — owner-only admin dashboard backend.
//
// Security model (server-side; the frontend route is NOT the boundary):
//   1. Every request must carry a valid Supabase JWT (Authorization: Bearer).
//      We verify it with the service-role client's auth.getUser(). No JWT / bad
//      JWT -> 401.
//   2. The verified user id must be in the ADMIN_USER_IDS allowlist (a secret,
//      comma-separated Supabase user UUIDs). Not in the list -> 403.
//   3. All privileged work runs through SECURITY DEFINER RPCs (migration 085)
//      that are granted to service_role ONLY. The service role key never leaves
//      this function.
//
// Actions (POST JSON { action, ... }):
//   • list_users     { search?, limit?, offset? }
//   • grant_credits  { business_id, amount, reason?, request_id }  (idempotent)
//   • recent_grants  { limit? }
//
// Deploy note: deploy with verify_jwt = true (gateway rejects anon before we
// run); we ALSO verify in-function as the authoritative check.
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_USER_IDS.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ADMIN_USER_IDS = (Deno.env.get('ADMIN_USER_IDS') ?? '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

const MAX_GRANT = 1_000_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

/** Verify the caller's JWT and require them to be in the admin allowlist.
 *  Returns the admin user id on success, or a Response (401/403) to short-circuit. */
async function requireAdmin(req: Request): Promise<string | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthenticated' }, 401)
  const { data: { user }, error } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
  if (error || !user) return json({ error: 'unauthenticated' }, 401)
  if (ADMIN_USER_IDS.length === 0 || !ADMIN_USER_IDS.includes(user.id.toLowerCase())) {
    return json({ error: 'forbidden' }, 403)
  }
  return user.id
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const adminId = await requireAdmin(req)
  if (adminId instanceof Response) return adminId // 401 / 403

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const action = body.action

  try {
    if (action === 'list_users') {
      const search = typeof body.search === 'string' ? body.search : null
      const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 200)
      const offset = Math.max(Number(body.offset) || 0, 0)
      const { data, error } = await admin.rpc('admin_list_businesses', {
        p_search: search, p_limit: limit, p_offset: offset,
      })
      if (error) return json({ error: 'list_failed', detail: error.message }, 500)
      const rows = data ?? []
      const total = rows.length > 0 ? Number((rows[0] as { total_count: number }).total_count) : 0
      return json({ rows, total, limit, offset })
    }

    if (action === 'grant_credits') {
      const businessId = body.business_id
      const amount = Number(body.amount)
      const reason = typeof body.reason === 'string' ? body.reason : ''
      const requestId = body.request_id
      // Server-side validation (never trust the client).
      if (typeof businessId !== 'string' || !businessId) return json({ error: 'business_id_required' }, 400)
      if (typeof requestId !== 'string' || !requestId) return json({ error: 'request_id_required' }, 400)
      if (!Number.isInteger(amount) || amount <= 0) return json({ error: 'amount_must_be_positive_integer' }, 400)
      if (amount > MAX_GRANT) return json({ error: 'amount_too_large' }, 400)

      const { data, error } = await admin.rpc('admin_grant_credits', {
        p_business_id: businessId, p_count: amount, p_reason: reason,
        p_admin_id: adminId, p_request_id: requestId,
      })
      if (error) return json({ error: 'grant_failed', detail: error.message }, 400)
      return json(data) // { granted, duplicate, balance, business_id }
    }

    if (action === 'recent_grants') {
      const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 500)
      const { data, error } = await admin.rpc('admin_recent_grants', { p_limit: limit })
      if (error) return json({ error: 'audit_failed', detail: error.message }, 500)
      return json({ rows: data ?? [] })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (err) {
    return json({ error: 'server_error', detail: err instanceof Error ? err.message : String(err) }, 500)
  }
})
