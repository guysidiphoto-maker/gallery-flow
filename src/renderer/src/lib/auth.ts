import { supabase } from './supabase'

export type AuthState = 'unauthenticated' | 'needs_onboarding' | 'ready'

export interface Business {
  id: string
  user_id: string
  business_name: string
  slug: string
  logo_url: string | null
  website_url: string | null
}

export async function getAuthState(): Promise<{ state: AuthState; user?: any; business?: Business }> {
  // Race getSession against a 3s timeout in case it hangs internally.
  const sessionResult = await Promise.race([
    supabase.auth.getSession().then(r => ({ kind: 'ok' as const, ...r })),
    new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 3000)),
  ])

  if (sessionResult.kind === 'timeout') {
    console.warn('[getAuthState] getSession() timed out after 3s')
    return { state: 'unauthenticated' }
  }

  const session = sessionResult.data?.session
  if (sessionResult.error) {
    console.error('[getAuthState] getSession error:', sessionResult.error)
    return { state: 'unauthenticated' }
  }
  if (!session) return { state: 'unauthenticated' }

  const businessQuery = supabase
    .from('businesses')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle()

  const result = await Promise.race([
    businessQuery.then(r => ({ kind: 'ok' as const, data: r.data, error: r.error })),
    new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 3000)),
  ])

  if (result.kind === 'timeout') {
    console.warn('[getAuthState] businesses query timed out — assuming needs_onboarding. Run the businesses migration in Supabase.')
    return { state: 'needs_onboarding', user: session.user }
  }
  if (result.error) {
    console.warn('[getAuthState] businesses query error (assuming needs_onboarding):', result.error)
    return { state: 'needs_onboarding', user: session.user }
  }
  if (!result.data) return { state: 'needs_onboarding', user: session.user }
  return { state: 'ready', user: session.user, business: result.data }
}

export async function signInWithEmail(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error: error?.message ?? null }
}

export async function signUpWithEmail(email: string, password: string, fullName?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: fullName ? { full_name: fullName } : undefined },
  })
  return { error: error?.message ?? null }
}

type GoogleOAuthApi = {
  googleOAuth?: (authUrl: string, redirectMatch: string) => Promise<{ access_token?: string; refresh_token?: string; code?: string; error?: string }>
}

// Redirect URL the BrowserWindow watches for. The page itself never has to
// load — the main process intercepts the navigation and extracts the OAuth
// payload from query / fragment. This URL must be added to Supabase →
// Authentication → URL Configuration → Redirect URLs.
// Use the current window origin so it works regardless of which port the
// dev server picks (5173, 5174, …) and also in production (file:// origin).
const OAUTH_REDIRECT_URL = typeof window !== 'undefined' && window.location.origin.startsWith('http')
  ? `${window.location.origin}/auth/callback`
  : 'http://localhost:5173/auth/callback'

// Electron-friendly Google OAuth: ask Supabase for the authorize URL with
// skipBrowserRedirect, open it in a child BrowserWindow via IPC, capture the
// implicit-grant tokens from the callback, and hand them to supabase.auth.setSession.
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  console.log('[google-auth] step 1: requesting OAuth URL from Supabase...')
  console.log('[google-auth] redirect URL:', OAUTH_REDIRECT_URL)

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: OAUTH_REDIRECT_URL,
      skipBrowserRedirect: true,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })

  console.log('[google-auth] step 1 result:', { url: data?.url?.slice(0, 100), error: error?.message })

  if (error || !data?.url) {
    return { error: error?.message ?? 'Could not start Google sign-in' }
  }

  const api = (window as unknown as { api?: GoogleOAuthApi }).api
  if (!api?.googleOAuth) {
    return { error: 'Google sign-in is not available in this build' }
  }

  console.log('[google-auth] step 2: opening auth window via IPC...')
  const result = await api.googleOAuth(data.url, OAUTH_REDIRECT_URL)
  console.log('[google-auth] step 2 result:', {
    hasCode: !!result.code,
    hasAccessToken: !!result.access_token,
    hasRefreshToken: !!result.refresh_token,
    error: result.error,
  })

  if (result.error) {
    return { error: result.error === 'cancelled' ? 'Sign-in cancelled' : result.error }
  }

  // PKCE flow: exchange the code for a session.
  if (result.code) {
    console.log('[google-auth] step 3a: exchanging PKCE code for session...')
    const { error: exErr } = await supabase.auth.exchangeCodeForSession(result.code)
    console.log('[google-auth] step 3a result:', { error: exErr?.message ?? null })
    if (exErr) return { error: exErr.message }
    await new Promise(r => setTimeout(r, 1500))
    try {
      const { useSession } = await import('../store/session')
      await useSession.getState().refreshBusiness()
    } catch { /* best effort */ }
    return { error: null }
  }

  // Implicit flow fallback: set the session directly.
  if (result.access_token) {
    console.log('[google-auth] step 3b: setting session from implicit tokens...')
    const { error: setErr } = await supabase.auth.setSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token ?? '',
    })
    console.log('[google-auth] step 3b result:', { error: setErr?.message ?? null })
    if (setErr) return { error: setErr.message }
    // Give Supabase a moment to settle the new session, then explicitly
    // refresh the business. The onAuthStateChange listener races the token
    // propagation and often times out — this direct call is more reliable.
    await new Promise(r => setTimeout(r, 1500))
    try {
      const { useSession } = await import('../store/session')
      console.log('[google-auth] step 4: explicit refreshBusiness after setSession...')
      await useSession.getState().refreshBusiness()
      console.log('[google-auth] step 4 result: status =', useSession.getState().status)
    } catch (e) {
      console.warn('[google-auth] step 4 refreshBusiness failed:', e)
    }
    return { error: null }
  }

  console.log('[google-auth] FAILED: no code or token in result')
  return { error: 'No code or token returned by Google' }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/**
 * Slug availability check uses the SECURITY DEFINER RPC `is_business_slug_taken`.
 * The old direct SELECT on `businesses` is now blocked by RLS — anonymous and
 * other-user reads of the table are forbidden after migration 006.
 */
export async function checkSlugAvailable(slug: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_business_slug_taken', { p_slug: slug })
  if (error) {
    console.warn('[auth] is_business_slug_taken RPC failed', error)
    // Fail-open in dev so onboarding doesn't deadlock; the unique index on
    // businesses(LOWER(slug)) is the real backstop.
    return true
  }
  return !data
}

export async function createBusiness(params: {
  business_name: string
  slug: string
  logo_url?: string | null
  website_url?: string | null
}): Promise<{ business: Business | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { business: null, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('businesses')
    .insert({
      user_id: session.user.id,
      business_name: params.business_name,
      slug: params.slug,
      logo_url: params.logo_url || null,
      website_url: params.website_url || null,
    })
    .select('*')
    .single()

  if (error) return { business: null, error: error.message }

  // Refresh the session store so MainApp sees the new business immediately,
  // without waiting for the next onAuthStateChange tick.
  try {
    const { useSession } = await import('../store/session')
    await useSession.getState().refreshBusiness()
  } catch (err) {
    console.warn('[auth] could not refresh session store after createBusiness', err)
  }

  return { business: data, error: null }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}
