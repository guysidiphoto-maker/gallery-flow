// The photographer's studio (`businesses` table, one row per owner account) and
// its plan. Direct table reads are RLS-scoped to the signed-in owner.

import { supabase } from '@/shared/lib/supabase'

export const DOMAIN_COLUMNS = 'custom_domain, custom_domain_status, custom_domain_verification_token'

/** Public business profile by URL slug, as a one-row array (RPC, so guests can call it). */
export async function getBusinessBySlug(slug: string) {
  return supabase.rpc('get_business_by_slug', { p_slug: slug })
}

/** `{ slug }` of a business, or null. */
export async function getBusinessSlug(businessId: string) {
  return supabase.from('businesses').select('slug').eq('id', businessId).maybeSingle()
}

/** The signed-in owner's business row (or null) with the given `columns`. */
export async function getOwnerBusiness(userId: string, columns: string) {
  return supabase.from('businesses').select(columns).eq('user_id', userId).maybeSingle()
}

/** Creates the owner's business on first sign-in; data is `{ id, slug }`. */
export async function createBusiness(userId: string, businessName: string, slug: string) {
  return supabase
    .from('businesses')
    .insert({ user_id: userId, business_name: businessName, slug })
    .select('id, slug')
    .single()
}

/** `{ brand_kit }` of a business, or null (RLS: owner only). */
export async function getBrandKitRow(businessId: string) {
  return supabase.from('businesses').select('brand_kit').eq('id', businessId).maybeSingle()
}

export async function updateBrandKit(businessId: string, brandKit: object) {
  return supabase.from('businesses').update({ brand_kit: brandKit }).eq('id', businessId)
}

/** The signed-in owner's plan (`get_my_plan`); data may be a row or a one-row array. */
export async function getMyPlan() {
  return supabase.rpc('get_my_plan')
}

/** Custom-domain columns of a business, or null. */
export async function getCustomDomain(businessId: string) {
  return supabase.from('businesses').select(DOMAIN_COLUMNS).eq('id', businessId).maybeSingle()
}

/** Claims a custom domain (`set_business_custom_domain`); data is `{ ok, domain?, verification_token?, error? }`. */
export async function claimCustomDomain(domain: string) {
  return supabase.rpc('set_business_custom_domain', { p_domain: domain })
}

/** Clears the custom domain and its verification state. */
export async function clearCustomDomain(businessId: string) {
  return supabase
    .from('businesses')
    .update({
      custom_domain: null,
      custom_domain_status: 'unverified',
      custom_domain_verification_token: null,
      custom_domain_added_at: null,
      custom_domain_verified_at: null,
    })
    .eq('id', businessId)
}
