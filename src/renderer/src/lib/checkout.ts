import { supabase } from './supabase'

const LEMONSQUEEZY_VARIANTS = {
  pro: '1519997',
  business: '1520026',
} as const

/**
 * Opens LemonSqueezy checkout in the user's default browser.
 * Passes the Supabase business_id + user email as custom data so the
 * webhook can link the payment back to the correct account.
 */
export async function openCheckout(planId: 'pro' | 'business'): Promise<void> {
  const variantId = LEMONSQUEEZY_VARIANTS[planId]
  if (!variantId) throw new Error(`Unknown plan: ${planId}`)

  const { data: { session } } = await supabase.auth.getSession()
  const email = session?.user?.email || ''

  // Try to get business_id for webhook matching
  let businessId = ''
  try {
    const { data } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', session?.user?.id || '')
      .single()
    if (data) businessId = data.id
  } catch { /* best effort */ }

  const params = new URLSearchParams()
  if (email) params.set('checkout[email]', email)
  if (businessId) params.set('checkout[custom][business_id]', businessId)

  const url = `https://pixflow.lemonsqueezy.com/buy/${variantId}?${params.toString()}`
  window.open(url, '_blank')
}
