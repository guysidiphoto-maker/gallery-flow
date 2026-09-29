import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/shared/lib/supabase'

// The photographer's business row (id + public slug). New users get one
// auto-created on first sign-in.
export function useBusiness(user: User | null) {
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [businessSlug, setBusinessSlug] = useState<string | null>(null)

  async function resolveBusiness() {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, slug')
      .eq('user_id', user!.id)
      .maybeSingle()

    if (biz) {
      setBusinessId(biz.id)
      setBusinessSlug(biz.slug)
      return
    }
    const displayName = user!.user_metadata?.full_name || user!.user_metadata?.name || user!.email || 'Studio'
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36)
    const { data: newBiz, error } = await supabase
      .from('businesses')
      .insert({ user_id: user!.id, business_name: displayName, slug })
      .select('id, slug')
      .single()
    if (error) {
      console.error('Failed to create business:', error)
    } else if (newBiz) {
      setBusinessId(newBiz.id)
      setBusinessSlug(newBiz.slug)
    }
  }

  return { businessId, businessSlug, setBusinessId, resolveBusiness }
}
