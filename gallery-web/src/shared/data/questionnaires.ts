// Lead questionnaires (`questionnaires` table) that prospects fill in via `/q/...`.

import { supabase } from '@/shared/lib/supabase'

/** The active questionnaire with this id or slug, or null. */
export async function getActiveQuestionnaire(key: { id: string } | { slug: string }) {
  const query = supabase
    .from('questionnaires')
    .select('*')
    .eq('is_active', true)
  return 'id' in key ? query.eq('id', key.id).maybeSingle() : query.eq('slug', key.slug).maybeSingle()
}
