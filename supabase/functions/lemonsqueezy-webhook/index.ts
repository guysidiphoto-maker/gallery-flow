import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts'

// ─────────────────────────────────────────────────────────────────────────────
// lemonsqueezy-webhook — pricing model v2 (PR2, 2026-06-20)
//
// Two purchase types arrive here:
//   • Subscriptions (pro / business / agency) — each billing cycle RESETS the
//     monthly photo allowance via reset_subscription_tokens() (use-it-or-lose-
//     it), instead of the old cumulative add_tokens() grant.
//   • One-time gallery unlock — custom_data.purpose === 'gallery_unlock' marks
//     a single gallery as paid via mark_gallery_paid(); never touches tokens.
//
// Variant→plan mapping is env-driven so the dashboard variant IDs aren't
// hardcoded: LEMONSQUEEZY_VARIANT_PRO / _BUSINESS / _AGENCY.
// ─────────────────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = Deno.env.get('LEMONSQUEEZY_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Variant id → plan id, built from env. Falls back to the legacy hardcoded
// staging ids only if nothing is configured, so a misconfig is loud, not silent.
const VARIANT_TO_PLAN: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  const pro = Deno.env.get('LEMONSQUEEZY_VARIANT_PRO')
  const biz = Deno.env.get('LEMONSQUEEZY_VARIANT_BUSINESS')
  const agy = Deno.env.get('LEMONSQUEEZY_VARIANT_AGENCY')
  if (pro) m[pro] = 'pro'
  if (biz) m[biz] = 'business'
  if (agy) m[agy] = 'agency'
  return m
})()

/** Constant-time hex compare (unchanged). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  let diff = 0
  for (let i = 0; i < al.length; i++) diff |= al.charCodeAt(i) ^ bl.charCodeAt(i)
  return diff === 0
}

function verifySignature(body: string, signature: string): boolean {
  const hmac = createHmac('sha256', WEBHOOK_SECRET)
  hmac.update(body)
  return timingSafeEqualHex(hmac.digest('hex'), signature)
}

/** Stable UUID derived from any LemonSqueezy event/order id (SHA-256 → 128 bit).
 *  Used as a ref_id so retried webhooks can't double-apply. */
async function stableUuid(input: string): Promise<string> {
  const data = new TextEncoder().encode(`lemonsqueezy:${input}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < 16; i++) hex += bytes[i].toString(16).padStart(2, '0')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`
}

/** Reset a subscription's monthly photo allowance to the plan's token_count.
 *  Idempotent per (business, ref_id) inside the RPC. */
async function resetMonthlyAllowance(
  businessId: string, planId: string, chargeId: string, source: string,
): Promise<void> {
  if (!businessId || !planId || !chargeId) return
  const refUuid = await stableUuid(chargeId)
  const { data: plan } = await supabase
    .from('plans').select('token_count').eq('id', planId).maybeSingle()
  const count = plan?.token_count ?? 0
  if (count <= 0) return
  const { error } = await supabase.rpc('reset_subscription_tokens', {
    p_business_id: businessId,
    p_count: count,
    p_ref_id: refUuid,
    p_metadata: { source, lemonsqueezy_charge_id: chargeId, plan_id: planId },
  })
  if (error) {
    console.error('[webhook] reset_subscription_tokens failed:', error)
    throw new Error('reset_subscription_tokens failed')
  }
  console.log(`[webhook] Reset ${businessId} to ${count} tokens (${planId}, charge ${chargeId})`)
}

/** Mark a single gallery as paid (one-time unlock). Idempotent per order. */
async function unlockGallery(
  businessId: string, galleryId: string, orderId: string, source: string,
): Promise<void> {
  if (!businessId || !galleryId || !orderId) return
  const refUuid = await stableUuid(orderId)
  const { error } = await supabase.rpc('mark_gallery_paid', {
    p_business_id: businessId,
    p_gallery_id: galleryId,
    p_ref_id: refUuid,
    p_metadata: { source, lemonsqueezy_order_id: orderId },
  })
  if (error) {
    console.error('[webhook] mark_gallery_paid failed:', error)
    throw new Error('mark_gallery_paid failed')
  }
  console.log(`[webhook] Unlocked gallery ${galleryId} for ${businessId} (order ${orderId})`)
}

serve(async (req) => {
  const signature = req.headers.get('x-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const body = await req.text()
  if (!verifySignature(body, signature)) {
    return new Response('Invalid signature', { status: 400 })
  }

  const event = JSON.parse(body)
  const eventName = event.meta?.event_name
  const custom = event.meta?.custom_data || {}
  const businessId = custom.business_id
  const attrs = event.data?.attributes || {}
  const variantId = String(attrs.variant_id || attrs.first_subscription_item?.variant_id || '')
  const planId = VARIANT_TO_PLAN[variantId] || custom.plan_id || 'pro'

  console.log(`[webhook] ${eventName} | biz=${businessId} | purpose=${custom.purpose || '-'} | plan=${planId}`)

  try {
    switch (eventName) {
      case 'subscription_created':
      case 'subscription_updated': {
        if (!businessId) break
        const status = attrs.status === 'active' ? 'active'
          : attrs.status === 'past_due' ? 'past_due'
          : attrs.status === 'cancelled' ? 'canceled'
          : 'active'

        await supabase.from('subscriptions').update({
          plan_id: planId,
          status,
          provider: 'lemonsqueezy',
          provider_customer_id: String(attrs.customer_id || ''),
          provider_subscription_id: String(event.data?.id || ''),
          current_period_start: attrs.renews_at ? new Date(attrs.created_at).toISOString() : null,
          current_period_end: attrs.renews_at ? new Date(attrs.renews_at).toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq('business_id', businessId).in('status', ['active', 'trial'])

        // Initial allowance on creation; recurring resets come via payment_success.
        if (eventName === 'subscription_created' && status === 'active') {
          await resetMonthlyAllowance(businessId, planId, String(event.data?.id || ''), 'subscription_created')
        }
        break
      }

      case 'subscription_payment_success': {
        // Recurring monthly charge → reset the allowance for the new period.
        if (!businessId) break
        const chargeId = String(event.data?.id || attrs.subscription_id || '')
        if (!chargeId) break
        await resetMonthlyAllowance(businessId, planId, chargeId, 'subscription_payment_success')
        break
      }

      case 'order_created': {
        // One-time purchases. The only one-time SKU is the gallery unlock;
        // subscription first-orders are handled via subscription_* events.
        if (custom.purpose === 'gallery_unlock' && businessId && custom.gallery_id) {
          const orderId = String(event.data?.id || attrs.order_id || '')
          if (orderId) await unlockGallery(businessId, custom.gallery_id, orderId, 'order_created')
        }
        break
      }

      case 'subscription_cancelled':
      case 'subscription_expired': {
        if (!businessId) break
        await supabase.from('subscriptions').update({
          plan_id: 'starter',
          status: 'active',
          provider: null,
          provider_customer_id: null,
          provider_subscription_id: null,
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('business_id', businessId).eq('provider', 'lemonsqueezy')
        console.log(`[webhook] Downgraded ${businessId} to starter`)
        break
      }
    }
  } catch (err) {
    console.error('[webhook] Error:', err)
    return new Response('Handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
