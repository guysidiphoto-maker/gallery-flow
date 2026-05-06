// Verify a photographer's claimed custom domain by reading the DNS TXT record
// they were instructed to add and matching it against the verification token
// we generated when they claimed the domain (see set_business_custom_domain
// RPC in migration 049). On match, also attach the domain to the Vercel
// project so it starts serving traffic.
//
// POST { } (auth required)
//   → 200 { ok: true,  status: 'verified' }
//   → 200 { ok: false, status: 'pending_dns', reason }
//   → 400 / 401 / 500 { ok: false, error }
//
// The function is owner-scoped via the photographer JWT — we look up the
// caller's own business and verify only their domain. We never accept a
// business_id as input.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VERCEL_API_TOKEN = Deno.env.get('VERCEL_API_TOKEN') ?? ''
const VERCEL_PROJECT_ID = Deno.env.get('VERCEL_PROJECT_ID') ?? ''
const VERCEL_TEAM_ID = Deno.env.get('VERCEL_TEAM_ID') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

async function requirePhotographer(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new Error('missing_auth')
  const jwt = authHeader.replace('Bearer ', '')
  const sb = serviceClient()
  const { data: { user }, error } = await sb.auth.getUser(jwt)
  if (error || !user) throw new Error('unauthorized')
  return { user, sb }
}

interface BusinessRow {
  id: string
  custom_domain: string | null
  custom_domain_status: string
  custom_domain_verification_token: string | null
}

async function loadBusiness(sb: SupabaseClient, userId: string): Promise<BusinessRow | null> {
  const { data } = await sb
    .from('businesses')
    .select('id, custom_domain, custom_domain_status, custom_domain_verification_token')
    .eq('user_id', userId)
    .maybeSingle()
  return data as BusinessRow | null
}

// DNS-over-HTTPS lookup against Cloudflare. Returns the array of TXT values
// found at `_pixflow-verify.<domain>`. Each TXT record may be wrapped in
// quotes when relayed by some DNS servers — strip those before comparing.
async function fetchVerificationTxt(domain: string): Promise<string[]> {
  const name = `_pixflow-verify.${domain}`
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`
  const res = await fetch(url, {
    headers: { 'accept': 'application/dns-json' },
    // 5s ceiling — the dashboard's recheck button shouldn't hang forever
    // if Cloudflare or the user's DNS is slow.
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return []
  const data = await res.json().catch(() => null) as { Answer?: Array<{ data: string; type: number }> } | null
  if (!data?.Answer) return []
  return data.Answer
    .filter(a => a.type === 16) // TXT record type
    .map(a => a.data.replace(/^"|"$/g, '').trim())
}

// Best-effort Vercel domain attachment. When VERCEL_API_TOKEN is set, we add
// the domain to the linked project so Vercel's edge will start serving it
// (after the photographer also points the apex/CNAME at Vercel, which the
// dashboard tells them to do). Without the token, we still flip status to
// 'verified' in the DB and surface a flag in the response so the dashboard
// can warn that platform-side provisioning is pending.
async function attachToVercel(
  domain: string,
): Promise<{ ok: true; alreadyExists?: boolean } | { ok: false; reason: string }> {
  if (!VERCEL_API_TOKEN || !VERCEL_PROJECT_ID) {
    return { ok: false, reason: 'vercel_not_configured' }
  }
  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}` : ''
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(VERCEL_PROJECT_ID)}/domains${teamQuery}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: domain }),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) return { ok: true }
    // 409 with code=domain_already_in_use is fine — the domain might already
    // be on this project from a prior verification attempt. Anything else is
    // a real failure we should surface.
    const data = await res.json().catch(() => ({}))
    const code = (data as { error?: { code?: string } })?.error?.code ?? 'unknown'
    if (res.status === 409 && code === 'domain_already_in_use') {
      return { ok: true, alreadyExists: true }
    }
    return { ok: false, reason: `vercel_${code}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: `vercel_fetch_${msg.slice(0, 80)}` }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  let user, sb
  try {
    const auth = await requirePhotographer(req)
    user = auth.user
    sb = auth.sb
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unauthorized'
    return json({ ok: false, error: msg }, 401)
  }

  const business = await loadBusiness(sb, user.id)
  if (!business) {
    return json({ ok: false, error: 'no_business' }, 404)
  }
  if (!business.custom_domain || !business.custom_domain_verification_token) {
    return json({ ok: false, error: 'no_domain_claimed' }, 409)
  }

  const expected = business.custom_domain_verification_token
  let txtValues: string[]
  try {
    txtValues = await fetchVerificationTxt(business.custom_domain)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ ok: false, error: 'dns_lookup_failed', detail: msg.slice(0, 120) }, 502)
  }

  const matched = txtValues.includes(expected)
  if (!matched) {
    // Don't flip to 'error' on a single miss — DNS propagation routinely
    // takes hours. Stay in 'pending_dns' and let the photographer recheck.
    return json({
      ok: false,
      status: 'pending_dns',
      reason: txtValues.length === 0 ? 'no_txt_record' : 'txt_mismatch',
      found: txtValues,
    })
  }

  // TXT verified. Try to attach to Vercel so the platform starts accepting
  // traffic on this hostname. If the platform call fails, we still flip the
  // DB to 'verified' (the proof is good) but surface a warning so the
  // dashboard can show "domain verified — provisioning still pending".
  const vercel = await attachToVercel(business.custom_domain)

  await sb
    .from('businesses')
    .update({
      custom_domain_status: 'verified',
      custom_domain_verified_at: new Date().toISOString(),
    })
    .eq('id', business.id)

  return json({
    ok: true,
    status: 'verified',
    vercel_attached: vercel.ok,
    vercel_warning: vercel.ok ? null : vercel.reason,
  })
})
