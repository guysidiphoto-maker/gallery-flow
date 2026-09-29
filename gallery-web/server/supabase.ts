import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env.js'

/** Service-role client (bypasses RLS), or null when the key isn't configured. */
export function serviceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return key ? createClient(SUPABASE_URL, key) : null
}

/** Anon client — same permissions as a logged-out browser. */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}
