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
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { state: 'unauthenticated' }

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', session.user.id)
    .single()

  if (!business) return { state: 'needs_onboarding', user: session.user }
  return { state: 'ready', user: session.user, business }
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      skipBrowserRedirect: false,
    }
  })
  return { error: error?.message ?? null }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export async function checkSlugAvailable(slug: string): Promise<boolean> {
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('slug', slug)
    .limit(1)
  return !data || data.length === 0
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
  return { business: data, error: null }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}
