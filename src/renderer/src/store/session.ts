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
          // On fresh sign-in, PostgREST may not immediately recognize the new
          // session tokens. Give it a beat, then try twice with a generous
          // timeout. This avoids the "businesses lookup timed out → onboarding
          // screen" false positive that happened after Google OAuth.
          if (event === 'SIGNED_IN') {
            await new Promise(r => setTimeout(r, 600))
          }
          await get().refreshBusiness()
          // If we landed on needs_onboarding after a SIGNED_IN but have no
          // business yet, retry once — the first attempt may have raced the
          // session propagation.
          if (event === 'SIGNED_IN' && get().status === 'needs_onboarding' && !get().business) {
            await new Promise(r => setTimeout(r, 2000))
            await get().refreshBusiness()
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

    // Force the Supabase JS client to settle its internal auth state before
    // we fire a PostgREST query. Right after setSession (e.g. Google OAuth),
    // the fetch interceptor may not have the new access token yet, causing
    // the businesses query to hang indefinitely (sent without auth → RLS
    // blocks → PostgREST returns nothing → our timeout fires).
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        set({ status: 'unauthenticated', business: null })
        return
      }
    } catch {
      // getSession failed — fall through to the query which has its own timeout
    }

    // Race the businesses lookup against a timeout so a network stall
    // can't strand the user on a black loading screen.
    const result = await Promise.race([
      supabase.from('businesses').select('*').eq('user_id', user.id).maybeSingle()
        .then(r => ({ kind: 'ok' as const, data: r.data, error: r.error })),
      new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 8000)),
    ])

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
