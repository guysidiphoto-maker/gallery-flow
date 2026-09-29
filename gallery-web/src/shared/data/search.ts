// Owner-side global search (`search_owner_content`): the RPC scopes itself to the
// signed-in owner's clients, galleries and photos.

import { supabase } from '@/shared/lib/supabase'

export async function searchOwnerContent(query: string, filters: unknown) {
  return supabase.rpc('search_owner_content', { p_query: query, p_filters: filters })
}
