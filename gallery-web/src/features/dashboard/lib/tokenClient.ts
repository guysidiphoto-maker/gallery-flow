// Photographer-facing token API. Single seam for balance reads + checkout.

import { createCheckout, getMyTokenBalance as fetchTokenBalance } from '@/shared/data/tokens'

export async function getMyTokenBalance(): Promise<number> {
  const { data, error } = await fetchTokenBalance()
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
  const { data, error } = await createCheckout(planId)
  if (error) {
    console.warn('[tokens] checkout failed', error)
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
  pricePerMonthIls: number   // approximate USD for display
  highlight?: string
}

// Monthly photo allowance per tier (resets each billing cycle). Source of truth
// for the amounts is the `plans` table; this is display copy for the buy modal.
export const TOKEN_PACKAGES: TokenPackage[] = [
  {
    planId: 'pro',
    name: 'Solo',
    tokens: 2000,
    pricePerMonthIls: 39,
  },
  {
    planId: 'business',
    name: 'Pro',
    tokens: 10000,
    pricePerMonthIls: 75,
    highlight: 'הכי משתלם',
  },
  {
    planId: 'agency',
    name: 'Studio',
    tokens: 30000,
    pricePerMonthIls: 120,
  },
]
