// Owner CRM reads (`cpv2_owner_*` RPCs); each returns only the signed-in owner's
// clients/galleries. Writes go through /api/client-admin (features/clients/api.ts).

import { supabase } from '@/shared/lib/supabase'

export async function listClientsOverview() {
  return supabase.rpc('cpv2_owner_clients_overview')
}

export async function getClientDetail(clientId: string) {
  return supabase.rpc('cpv2_owner_client_detail', { p_client_id: clientId })
}

export async function listAssignableGalleries() {
  return supabase.rpc('cpv2_owner_assignable_galleries')
}

/** `[{ capability, active, expires_at }]` for the signed-in owner's business. */
export async function listMyEntitlements() {
  return supabase.rpc('my_business_entitlements')
}
