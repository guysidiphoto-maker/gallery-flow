import { supabase } from './supabase'

/**
 * fetch() that attaches the current Supabase session as `Authorization: Bearer`.
 *
 * Used by owner endpoints (client-admin, import-center); the server verifies the JWT.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const headers = new Headers(init.headers ?? {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
