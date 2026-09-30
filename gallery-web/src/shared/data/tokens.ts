// Upload tokens and subscription checkout for the signed-in owner.

import { supabase } from '@/shared/lib/supabase'

/** The signed-in owner's token balance (`get_my_token_balance`); data is a number. */
export async function getMyTokenBalance() {
  return supabase.rpc('get_my_token_balance')
}

/** Starts a LemonSqueezy subscription checkout (`create-checkout` edge function); data is `{ checkoutUrl }`. */
export async function createCheckout(planId: string) {
  return supabase.functions.invoke('create-checkout', { body: { planId } })
}
