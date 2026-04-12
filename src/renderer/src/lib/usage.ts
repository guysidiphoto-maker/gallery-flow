import { supabase } from './supabase'

export interface PlanUsage {
  storageUsedBytes: number
  storageLimitBytes: number | null
  galleriesCount: number
  maxGalleries: number | null
  photosThisMonth: number
  maxPhotosPerMonth: number | null
  planId: string
  planName: string
}

/**
 * Fetches the active plan + current usage for the logged-in business via
 * the `get_my_usage()` RPC (see migration 015). Returns null when no session.
 */
export async function fetchPlanUsage(): Promise<PlanUsage | null> {
  const { data, error } = await supabase.rpc('get_my_usage').maybeSingle()
  if (error || !data) return null
  const row = data as Record<string, unknown>
  return {
    storageUsedBytes: Number(row.storage_used_bytes || 0),
    storageLimitBytes: row.storage_limit_bytes != null ? Number(row.storage_limit_bytes) : null,
    galleriesCount: Number(row.galleries_count || 0),
    maxGalleries: row.max_galleries != null ? Number(row.max_galleries) : null,
    photosThisMonth: Number(row.photos_this_month || 0),
    maxPhotosPerMonth: row.max_photos_per_month != null ? Number(row.max_photos_per_month) : null,
    planId: String(row.plan_id || 'starter'),
    planName: String(row.plan_name || 'Starter'),
  }
}
