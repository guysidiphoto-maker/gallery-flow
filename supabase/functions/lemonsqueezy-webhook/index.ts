import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts'

const WEBHOOK_SECRET = Deno.env.get('LEMONSQUEEZY_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function verifySignature(body: string, signature: string): boolean {
  const hmac = createHmac('sha256', WEBHOOK_SECRET)
  hmac.update(body)
  const digest = hmac.digest('hex')
  return digest === signature
}

// Map LemonSqueezy variant IDs to plan IDs
const VARIANT_TO_PLAN: Record<string, string> = {
  '1519997': 'pro',
  '1520026': 'business',
}

/** Idempotently grant the plan's token allocation to the business. The ledger
 *  is the audit trail; we use the LemonSqueezy event id as ref_id so a
 *  retried webhook doesn't double-grant. */
async function grantPlanTokens(
  businessId: string,
  planId: string,
  eventId: string,
  source: string,
): Promise<void> {
  if (!businessId || !planId || !eventId) return
  const eventUuid = stableUuid(eventId)
  // Skip if we've already credited this exact event.
  const { data: existing } = await supabase
    .from('token_ledger')
    .select('id')
    .eq('business_id', businessId)
    .eq('ref_id', eventUuid)
    .eq('reason', 'purchase')
    .maybeSingle()
  if (existing) {
    console.log(`[webhook] Tokens already granted for event ${eventId}; skipping`)
    return
  }
  const { data: plan } = await supabase
    .from('plans')
    .select('token_count')
    .eq('id', planId)
    .maybeSingle()
  const count = plan?.token_count ?? 0
  if (count <= 0) return
  const { error } = await supabase.rpc('add_tokens', {
    p_business_id: businessId,
    p_count: count,
    p_reason: 'purchase',
    p_ref_id: eventUuid,
    p_metadata: { source, lemonsqueezy_event_id: eventId, plan_id: planId },
  })
  if (error) {
    console.error(`[webhook] add_tokens failed:`, error)
    throw new Error('add_tokens failed')
  }
  console.log(`[webhook] Granted ${count} tokens to ${businessId} (event ${eventId})`)
}

/** Stable UUID derived from any LemonSqueezy event id. Used as token_ledger
 *  ref_id so a retried webhook can't double-credit. Deterministic FNV-1a
 *  128-bit hash — collisions across LemonSqueezy event ids are not a concern
 *  in practice. */
function stableUuid(input: string): string {
  const s = `lemonsqueezy:${input}`
  let h1 = 0x811c9dc5, h2 = 0xdeadbeef, h3 = 0xcafebabe, h4 = 0x13371337
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0
    h3 = Math.imul(h3 ^ c, 0x01000193) >>> 0
    h4 = Math.imul(h4 ^ c, 0x01000193) >>> 0
  }
  const hex = h1.toString(16).padStart(8, '0')
            + h2.toString(16).padStart(8, '0')
            + h3.toString(16).padStart(8, '0')
            + h4.toString(16).padStart(8, '0')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`
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
  const customData = event.meta?.custom_data || {}
  const businessId = customData.business_id
  const attrs = event.data?.attributes || {}
  const variantId = String(attrs.variant_id || attrs.first_subscription_item?.variant_id || '')
  const planId = VARIANT_TO_PLAN[variantId] || 'pro'

  console.log(`[webhook] Event: ${eventName} | Business: ${businessId} | Plan: ${planId}`)

  try {
    switch (eventName) {
      case 'subscription_created':
      case 'subscription_updated': {
        if (!businessId) break

        const status = attrs.status === 'active' ? 'active'
          : attrs.status === 'past_due' ? 'past_due'
          : attrs.status === 'cancelled' ? 'canceled'
          : 'active'

        await supabase
          .from('subscriptions')
          .update({
            plan_id: planId,
            status,
            provider: 'lemonsqueezy',
            provider_customer_id: String(attrs.customer_id || ''),
            provider_subscription_id: String(event.data?.id || ''),
            current_period_start: attrs.renews_at ? new Date(attrs.created_at).toISOString() : null,
            current_period_end: attrs.renews_at ? new Date(attrs.renews_at).toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('business_id', businessId)
          .in('status', ['active', 'trial'])

        console.log(`[webhook] Updated subscription for ${businessId}: ${planId} (${status})`)

        // Initial token grant on subscription creation. The grant is keyed off
        // the LemonSqueezy event id so a retried webhook is a no-op.
        if (eventName === 'subscription_created' && status === 'active') {
          await grantPlanTokens(businessId, planId, String(event.data?.id || ''),
                                'subscription_created')
        }
        break
      }

      case 'subscription_payment_success':
      case 'order_created': {
        // Recurring monthly grant (subscription) OR one-time top-up purchase
        // (order). Both events fire on every successful charge. Idempotency
        // is handled inside grantPlanTokens via the ledger ref_id check.
        if (!businessId) break
        const orderId = String(event.data?.id || attrs.order_id || '')
        if (!orderId) break
        await grantPlanTokens(businessId, planId, orderId, eventName)
        break
      }

      case 'subscription_cancelled':
      case 'subscription_expired': {
        if (!businessId) break

        await supabase
          .from('subscriptions')
          .update({
            plan_id: 'starter',
            status: 'active',
            provider: null,
            provider_customer_id: null,
            provider_subscription_id: null,
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('business_id', businessId)
          .eq('provider', 'lemonsqueezy')

        console.log(`[webhook] Downgraded ${businessId} to starter`)
        break
      }
    }
  } catch (err) {
    console.error(`[webhook] Error:`, err)
    return new Response('Handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
