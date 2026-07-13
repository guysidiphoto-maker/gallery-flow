import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import type { User } from '@supabase/supabase-js'
import { track, AnalyticsEvent } from './analytics'

// Fire the CompleteRegistration conversion at most once per new user, per
// browser. onAuthStateChange emits SIGNED_IN on every login and sometimes on
// token refresh, so we (a) only count users created in the last few minutes as
// a genuine sign-up, and (b) dedupe via localStorage keyed by user id.
function maybeTrackSignUp(user: User): void {
  try {
    const created = user.created_at ? Date.parse(user.created_at) : NaN
    if (Number.isNaN(created)) return
    // Genuine new registration: account created within the last 10 minutes.
    if (Date.now() - created > 10 * 60 * 1000) return
    const key = `pf_signup_tracked_${user.id}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
    track(AnalyticsEvent.CONVERSION, { method: 'google' })
  } catch {
    /* never let tracking break auth */
  }
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/dashboard' },
  })
  if (error) console.error('[auth] Google sign-in error:', error.message)
}

export async function signOut() {
  await supabase.auth.signOut()
  window.location.href = '/'
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
      if (event === 'SIGNED_IN' && session?.user) maybeTrackSignUp(session.user)
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}
