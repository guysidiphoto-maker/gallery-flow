import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Session store — single source of truth for `{ user, business, status }`.
// Every code path that needs to know "who am I" or "which business owns this"
// reads from here. This replaces the ad-hoc auth state that lived in App.tsx
// and the `business` prop that used to be threaded through MainApp.
// ─────────────────────────────────────────────────────────────────────────────

export interface Business {
  id: string
  user_id: string
  business_name: string
  slug: string
  logo_url: string | null
  website_url: string | null
}

export type SessionStatus = 'loading' | 'unauthenticated' | 'needs_onboarding' | 'ready' | 'error'

interface SessionState {
  status: SessionStatus
  user: User | null
  business: Business | null
  errorMessage: string | null

  // Initialize the session by reading getSession() and resolving the
  // user's business. Also subscribes to onAuthStateChange so the store
  // stays consistent for the lifetime of the renderer.
  init: () => Promise<() => void>

  // Re-read the businesses row for the current user. Called after
  // onboarding completes so MainApp can render immediately.
  refreshBusiness: () => Promise<void>

  // Sign out and reset local state. Auth listener will flip status.
  signOut: () => Promise<void>
}

let initPromise: Promise<() => void> | null = null

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  business: null,
  errorMessage: null,

  async init() {
    // Idempotent: only attach the auth listener once even under React 18
    // strict-mode double invocation.
    if (initPromise) return initPromise

    initPromise = (async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
          set({ status: 'error', errorMessage: error.message })
        } else if (!session) {
          set({ status: 'unauthenticated', user: null, business: null })
        } else {
          set({ user: session.user })
          await get().refreshBusiness()
        }
      } catch (err) {
        set({ status: 'error', errorMessage: err instanceof Error ? err.message : String(err) })
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          set({ status: 'unauthenticated', user: null, business: null, errorMessage: null })
          return
        }
        // Always keep the user object fresh (token refresh updates session.user too).
        set({ user: session.user })
        // Only re-fetch the business row for events that meaningfully change
        // identity. TOKEN_REFRESHED / USER_UPDATED fire on a timer or for
        // unrelated profile changes — re-querying businesses on every fire
        // caused the app to bounce the user back to onboarding whenever that
        // request stalled or hit a transient error.
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          // Use the token from the callback directly — avoids deadlock with
          // getSession() which hangs when called inside onAuthStateChange.
          const token = session.access_token
          const userId = session.user.id

          // Direct fetch bypasses the Supabase client's interceptor which
          // may not have the token settled yet after exchangeCodeForSession.
          const fetchBusiness = async (): Promise<Business | null> => {
            try {
              const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/businesses?user_id=eq.${userId}&select=*&limit=1`
              const res = await fetch(url, {
                headers: {
                  'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json',
                },
              })
              if (!res.ok) return null
              const rows = await res.json()
              return Array.isArray(rows) && rows.length > 0 ? rows[0] as Business : null
            } catch { return null }
          }

          // Retry with delays — PostgREST may need a moment after new session
          const delays = event === 'SIGNED_IN' ? [0, 1500, 3000] : [0]
          for (const delay of delays) {
            if (delay > 0) await new Promise(r => setTimeout(r, delay))
            const biz = await fetchBusiness()
            if (biz) {
              set({ status: 'ready', business: biz })
              break
            }
            if (delay === delays[delays.length - 1]) {
              // Last attempt, no business found
              set({ status: 'needs_onboarding', business: null })
            }
          }
        }
      })

      return () => subscription.unsubscribe()
    })()

    return initPromise
  },

  async refreshBusiness() {
    const { user, business: existingBusiness } = get()
    if (!user) {
      set({ status: 'unauthenticated', business: null })
      return
    }

    // After OAuth, the Supabase client's fetch interceptor may not have the
    // auth token yet. Try getSession first; if it works, also try a direct
    // fetch with the token as a fallback for the businesses query.
    let accessToken: string | null = null
    try {
      const sessionResult = await Promise.race([
        supabase.auth.getSession().then(r => ({ kind: 'ok' as const, ...r })),
        new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 3000)),
      ])
      if (sessionResult.kind === 'timeout') {
        console.warn('[session] getSession() timed out in refreshBusiness')
      } else if (!sessionResult.data?.session) {
        set({ status: 'unauthenticated', business: null })
        return
      } else {
        accessToken = sessionResult.data.session.access_token
      }
    } catch {
      // getSession failed
    }

    // Try the businesses query. If the normal query hangs (auth not settled),
    // fall back to a direct fetch with the access token.
    let result: { kind: 'ok'; data: any; error: any } | { kind: 'timeout' }

    const normalQuery = supabase.from('businesses').select('*').eq('user_id', user.id).maybeSingle()
      .then(r => ({ kind: 'ok' as const, data: r.data, error: r.error }))

    result = await Promise.race([
      normalQuery,
      new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 5000)),
    ])

    // If timed out and we have a token, try direct fetch as fallback
    if (result.kind === 'timeout' && accessToken) {
      console.warn('[session] normal query timed out, trying direct fetch with token')
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/businesses?user_id=eq.${user.id}&select=*&limit=1`
        const res = await Promise.race([
          fetch(url, {
            headers: {
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
            },
          }).then(async r => {
            const data = await r.json()
            return { kind: 'ok' as const, data: Array.isArray(data) && data.length > 0 ? data[0] : null, error: null }
          }),
          new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 5000)),
        ])
        result = res
      } catch (e) {
        console.warn('[session] direct fetch also failed:', e)
      }
    }

    // Transient failures must NOT bounce an already-onboarded user back to
    // the onboarding screen. If we already have a business cached, keep it
    // and stay 'ready' — the next refresh will reconcile.
    if (result.kind === 'timeout') {
      console.warn('[session] businesses lookup timed out')
      if (existingBusiness) {
        set({ status: 'ready' })
      } else {
        set({ status: 'needs_onboarding', business: null })
      }
      return
    }

    if (result.error) {
      console.warn('[session] businesses query error', result.error)
      if (existingBusiness) {
        set({ status: 'ready' })
      } else {
        set({ status: 'needs_onboarding', business: null })
      }
      return
    }

    if (!result.data) {
      // Authoritative "no business" — only trust this when we don't already
      // have one. Avoids the case where a stale read returns null briefly.
      if (existingBusiness) {
        set({ status: 'ready' })
      } else {
        set({ status: 'needs_onboarding', business: null })
      }
      return
    }

    set({ status: 'ready', business: result.data as Business })
  },

  async signOut() {
    await supabase.auth.signOut()
    // The auth listener will fire SIGNED_OUT and reset state, but we also
    // clear here so any UI re-render in between doesn't see stale data.
    set({ status: 'unauthenticated', user: null, business: null, errorMessage: null })
  },
}))
