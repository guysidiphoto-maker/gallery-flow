import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' })
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PRICE_MAP: Record<string, { monthly: string; annual: string }> = {
  pro: {
    monthly: Deno.env.get('STRIPE_PRICE_PRO_MONTHLY') || '',
    annual: Deno.env.get('STRIPE_PRICE_PRO_ANNUAL') || '',
  },
  business: {
    monthly: Deno.env.get('STRIPE_PRICE_BIZ_MONTHLY') || '',
    annual: Deno.env.get('STRIPE_PRICE_BIZ_ANNUAL') || '',
  },
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing auth')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user) throw new Error('Unauthorized')

    const { planId, billingCycle } = await req.json()
    if (!planId || !PRICE_MAP[planId]) throw new Error('Invalid plan')

    const cycle = billingCycle === 'annual' ? 'annual' : 'monthly'
    const priceId = PRICE_MAP[planId][cycle]
    if (!priceId) throw new Error(`Price not configured for ${planId}/${cycle}`)

    // Find or create Stripe customer
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, business_name')
      .eq('user_id', user.id)
      .single()
    if (!biz) throw new Error('No business found')

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('business_id', biz.id)
      .eq('status', 'active')
      .maybeSingle()

    let customerId = sub?.provider_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: biz.business_name,
        metadata: { supabase_user_id: user.id, business_id: biz.id },
      })
      customerId = customer.id
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: 'https://pixflow-ai.com/?checkout=success',
      cancel_url: 'https://pixflow-ai.com/?checkout=cancel',
      subscription_data: {
        metadata: { business_id: biz.id, plan_id: planId },
      },
      metadata: { business_id: biz.id, plan_id: planId },
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
