// JWT gate for owner endpoints: validates the Supabase Bearer token.

import type { VercelRequest } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'

export type GateFailure = { ok: false; status: number; code: string }
export type AuthedOk = { ok: true; userId: string }

/** Pull the raw JWT out of `Authorization: Bearer <token>` (case-insensitive). */
export function getBearerToken(req: VercelRequest): string | null {
  const raw = req.headers.authorization ?? (req.headers as Record<string, string>).Authorization
  if (!raw || typeof raw !== 'string') return null
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim())
  const token = m?.[1]?.trim()
  return token && token.length > 0 ? token : null
}

/** Verify the request carries a valid Supabase session JWT; returns the user id. */
export async function requireAuthedUser(
  req: VercelRequest,
  supabase: SupabaseClient,
): Promise<AuthedOk | GateFailure> {
  const token = getBearerToken(req)
  if (!token) return { ok: false, status: 401, code: 'auth_required' }
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return { ok: false, status: 401, code: 'invalid_token' }
  return { ok: true, userId: data.user.id }
}
