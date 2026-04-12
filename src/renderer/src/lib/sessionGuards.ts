import { useSession, type Business } from '../store/session'

/**
 * Returns the current authenticated business or throws if there isn't one.
 * Every mutation that writes to ownership-scoped tables must call this so
 * we never silently insert a row that RLS will reject.
 */
export function requireBusiness(): Business {
  const business = useSession.getState().business
  if (!business) {
    throw new Error(
      'No business in session — sign in and complete onboarding before using this action.'
    )
  }
  return business
}

/**
 * Convenience: returns business id directly. Throws if not signed in.
 */
export function requireBusinessId(): string {
  return requireBusiness().id
}
