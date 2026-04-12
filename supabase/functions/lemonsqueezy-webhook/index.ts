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
