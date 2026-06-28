import { supabase } from '../supabase'

/**
 * fetch() that attaches the current Supabase session as `Authorization: Bearer`.
 *
 * Required for the AI/cost endpoints (score-images, generate-feed,
 * generate-campaign, plan-event, generate-captions). Their server-side gate
 * (gallery-web/server/ownerAuth.ts) verifies the JWT + business ownership and
 * returns 401/403 before any paid Anthropic call. These endpoints are always
 * invoked from the authenticated photographer dashboard, so a session is
 * present; if it somehow isn't, the request goes out tokenless and the server
 * correctly returns 401 (no silent insecure fallback).
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
