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

export type PlanId = 'pro' | 'business' | 'agency'

/** Open the LemonSqueezy checkout for a subscription tier. Returns the hosted
 *  checkout URL (or null on failure). */
export async function startCheckout(planId: PlanId): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { planId },
  })
  if (error) {
    console.warn('[tokens] checkout failed', error)
    return null
  }
  return (data as { checkoutUrl?: string })?.checkoutUrl ?? null
}

/** Open the LemonSqueezy checkout for a one-time gallery unlock (₪590). Works
 *  whether the caller is the authenticated photographer (buy + bundle) or an
 *  unauthenticated client paying directly from the gallery gate — the edge
 *  function resolves the owning business from the gallery id. */
export async function startGalleryCheckout(galleryId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { galleryId },
  })
  if (error) {
    console.warn('[tokens] gallery checkout failed', error)
    return null
  }
  return (data as { checkoutUrl?: string })?.checkoutUrl ?? null
}

/** Token package metadata for the buy modal. Source of truth is the `plans`
 *  table; this is just the display copy. */
export interface TokenPackage {
  planId: PlanId
  name: string
  tokens: number
  pricePerMonthIls: number   // approximate ILS for display
  highlight?: string
}

// Monthly photo allowance per tier (resets each billing cycle). Source of truth
// for the amounts is the `plans` table; this is display copy for the buy modal.
export const TOKEN_PACKAGES: TokenPackage[] = [
  {
    planId: 'pro',
    name: 'מקצועי',
    tokens: 2000,
    pricePerMonthIls: 79,
  },
  {
    planId: 'business',
    name: 'עסקי',
    tokens: 10000,
    pricePerMonthIls: 159,
    highlight: 'הכי משתלם',
  },
  {
    planId: 'agency',
    name: 'סוכנות',
    tokens: 30000,
    pricePerMonthIls: 349,
  },
]

/** Display price for the one-time gallery unlock SKU (₪). */
export const GALLERY_UNLOCK_PRICE_ILS = 590
