// Photographer-facing token API. Single seam for balance reads + checkout.

import { supabase } from '../supabase'

export async function getMyTokenBalance(): Promise<number> {
  const { data, error } = await supabase.rpc('get_my_token_balance')
  if (error) {
    console.warn('[tokens] balance fetch failed', error)
    return 0
  }
  return typeof data === 'number' ? data : 0
}

/** Open the LemonSqueezy checkout for a token package. The CTA flow already
 *  exists in the marketing landing pages — this lets the in-app dashboard
 *  use the same edge function. */
export async function startCheckout(planId: 'pro' | 'business'): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { planId },
  })
  if (error) {
    console.warn('[tokens] checkout failed', error)
    return null
  }
  return (data as { checkoutUrl?: string })?.checkoutUrl ?? null
}

/** Token package metadata for the buy modal. Source of truth is the `plans`
 *  table; this is just the display copy. */
export interface TokenPackage {
  planId: 'pro' | 'business'
  name: string
  tokens: number
  pricePerMonthIls: number   // approximate ILS for display
  highlight?: string
}

export const TOKEN_PACKAGES: TokenPackage[] = [
  {
    planId: 'pro',
    name: 'מקצועי',
    tokens: 2000,
    pricePerMonthIls: 79,
    highlight: 'הכי משתלם',
  },
  {
    planId: 'business',
    name: 'עסקי',
    tokens: 10000,
    pricePerMonthIls: 159,
  },
]
