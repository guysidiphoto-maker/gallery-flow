import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// create-checkout — LemonSqueezy edition (PR2, 2026-06-20)
//
// Replaces the previous Stripe implementation. Creates a LemonSqueezy hosted
// checkout and returns { checkoutUrl } (the field tokenClient.startCheckout
// expects). Handles TWO purchase types:
//
//   1) Subscription  — body { planId: 'pro' | 'business' | 'agency' }
//        Requires an authenticated photographer. Embeds custom_data.business_id
//        so the webhook (lemonsqueezy-webhook) knows whose allowance to reset.
//
//   2) One-time gallery unlock — body { galleryId: '<uuid>' }
//        Works authed (photographer buys + bundles) OR public (the couple pays
//        directly via a link on the gallery gate). business_id is resolved from
//        the gallery server-side. Embeds custom_data { business_id, gallery_id,
//        purpose: 'gallery_unlock' } so the webhook can mark the gallery paid.
//
// Variant IDs come from env vars (set after the products are created in the
// LemonSqueezy dashboard) — no hardcoded placeholder IDs:
//   LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID,
//   LEMONSQUEEZY_VARIANT_PRO, LEMONSQUEEZY_VARIANT_BUSINESS,
//   LEMONSQUEEZY_VARIANT_AGENCY, LEMONSQUEEZY_VARIANT_GALLERY
// ─────────────────────────────────────────────────────────────────────────────

const LS_API_KEY = Deno.env.get('LEMONSQUEEZY_API_KEY')!
const LS_STORE_ID = Deno.env.get('LEMONSQUEEZY_STORE_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_URL = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://pixflow-ai.com'

const PLAN_VARIANT: Record<string, string | undefined> = {
  pro:      Deno.env.get('LEMONSQUEEZY_VARIANT_PRO'),
  business: Deno.env.get('LEMONSQUEEZY_VARIANT_BUSINESS'),
  agency:   Deno.env.get('LEMONSQUEEZY_VARIANT_AGENCY'),
}
const GALLERY_VARIANT = Deno.env.get('LEMONSQUEEZY_VARIANT_GALLERY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Create a LemonSqueezy checkout and return its hosted URL. */
async function createLsCheckout(opts: {
  variantId: string
  custom: Record<string, string>
  email?: string | null
  name?: string | null
}): Promise<string> {
  const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${LS_API_KEY}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          // custom_data echoes back verbatim in every webhook as
          // event.meta.custom_data — this is the join key to our DB.
          checkout_data: {
            custom: opts.custom,
            ...(opts.email ? { email: opts.email } : {}),
            ...(opts.name ? { name: opts.name } : {}),
          },
          product_options: {
            redirect_url: `${SITE_URL}/?checkout=success`,
          },
        },
        relationships: {
          store:   { data: { type: 'stores',   id: String(LS_STORE_ID) } },
          variant: { data: { type: 'variants', id: String(opts.variantId) } },
        },
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`lemonsqueezy_checkout_failed: ${res.status} ${detail}`)
  }
  const body = await res.json()
  const url = body?.data?.attributes?.url
  if (!url) throw new Error('lemonsqueezy_checkout_no_url')
  return url
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { planId, galleryId } = await req.json().catch(() => ({}))

    // ── One-time gallery unlock ───────────────────────────────────────────
    if (galleryId) {
      if (!GALLERY_VARIANT) throw new Error('gallery_variant_not_configured')

      // Resolve the owning business from the gallery (public-safe: the couple
      // may be unauthenticated when paying directly).
      const { data: gallery } = await admin
        .from('galleries')
        .select('id, business_id')
        .eq('id', galleryId)
        .single()
      if (!gallery) throw new Error('gallery_not_found')

      const url = await createLsCheckout({
        variantId: GALLERY_VARIANT,
        custom: {
          business_id: gallery.business_id,
          gallery_id: gallery.id,
          purpose: 'gallery_unlock',
        },
      })
      return json({ checkoutUrl: url })
    }

    // ── Subscription ──────────────────────────────────────────────────────
    if (!planId || !(planId in PLAN_VARIANT)) throw new Error('invalid_plan')
    const variantId = PLAN_VARIANT[planId]
    if (!variantId) throw new Error(`variant_not_configured_for_${planId}`)

    // Subscriptions require an authenticated photographer.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('missing_auth')
    const { data: { user }, error: authErr } =
      await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) throw new Error('unauthorized')

    const { data: biz } = await admin
      .from('businesses')
      .select('id, business_name')
      .eq('user_id', user.id)
      .single()
    if (!biz) throw new Error('no_business_found')

    const url = await createLsCheckout({
      variantId,
      custom: { business_id: biz.id, plan_id: planId },
      email: user.email,
      name: biz.business_name,
    })
    return json({ checkoutUrl: url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error'
    console.error('[create-checkout]', msg)
    return json({ error: msg }, 400)
  }
})
