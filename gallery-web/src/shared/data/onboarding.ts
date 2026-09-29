// First-run tour / checklist progress (`onboarding_progress`), one row per
// user + surface + version. RLS returns only the signed-in user's rows.

import { supabase } from '@/shared/lib/supabase'

export interface OnboardingRow {
  user_id: string
  surface: string
  version: number
  status: string
  step: number
}

/** `{ status, step }` or null. */
export async function getOnboardingProgress(userId: string, surface: string, version: number) {
  return supabase
    .from('onboarding_progress')
    .select('status, step')
    .eq('user_id', userId)
    .eq('surface', surface)
    .eq('version', version)
    .maybeSingle()
}

export async function upsertOnboardingProgress(row: OnboardingRow) {
  return supabase.from('onboarding_progress').upsert(row, { onConflict: 'user_id,surface,version' })
}
