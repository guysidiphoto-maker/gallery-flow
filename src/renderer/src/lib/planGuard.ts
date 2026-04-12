import { supabase } from './supabase'

export interface PlanLimits {
  planId: string
  planName: string
  storageUsedBytes: number
  storageLimitBytes: number | null
  galleriesCount: number
  maxGalleries: number | null
  photosThisMonth: number
  maxPhotosPerMonth: number | null
}

export interface PlanViolation {
  type: 'storage' | 'galleries' | 'photos'
  current: number
  limit: number
  label: string
}

export async function fetchPlanLimits(): Promise<PlanLimits | null> {
  const { data, error } = await supabase.rpc('get_my_usage').maybeSingle()
  if (error || !data) return null
  const row = data as Record<string, unknown>
  return {
    planId: String(row.plan_id || 'starter'),
    planName: String(row.plan_name || 'Starter'),
    storageUsedBytes: Number(row.storage_used_bytes || 0),
    storageLimitBytes: row.storage_limit_bytes != null ? Number(row.storage_limit_bytes) : null,
    galleriesCount: Number(row.galleries_count || 0),
    maxGalleries: row.max_galleries != null ? Number(row.max_galleries) : null,
    photosThisMonth: Number(row.photos_this_month || 0),
    maxPhotosPerMonth: row.max_photos_per_month != null ? Number(row.max_photos_per_month) : null,
  }
}

/**
 * Check whether a publish of `newPhotoCount` images (each ~15.5MB) would
 * violate the active plan. Returns an empty array when everything is fine.
 */
export function checkPlanViolations(
  limits: PlanLimits,
  newPhotoCount: number,
  estimatedNewBytes: number
): PlanViolation[] {
  const violations: PlanViolation[] = []

  if (limits.maxGalleries != null && limits.galleriesCount >= limits.maxGalleries) {
    violations.push({
      type: 'galleries',
      current: limits.galleriesCount,
      limit: limits.maxGalleries,
      label: `Gallery limit reached (${limits.galleriesCount}/${limits.maxGalleries})`,
    })
  }

  if (limits.maxPhotosPerMonth != null && limits.photosThisMonth + newPhotoCount > limits.maxPhotosPerMonth) {
    violations.push({
      type: 'photos',
      current: limits.photosThisMonth,
      limit: limits.maxPhotosPerMonth,
      label: `Monthly photo limit (${limits.photosThisMonth + newPhotoCount}/${limits.maxPhotosPerMonth})`,
    })
  }

  if (limits.storageLimitBytes != null && limits.storageUsedBytes + estimatedNewBytes > limits.storageLimitBytes) {
    const usedGB = ((limits.storageUsedBytes + estimatedNewBytes) / (1024 * 1024 * 1024)).toFixed(1)
    const limitGB = (limits.storageLimitBytes / (1024 * 1024 * 1024)).toFixed(0)
    violations.push({
      type: 'storage',
      current: limits.storageUsedBytes + estimatedNewBytes,
      limit: limits.storageLimitBytes,
      label: `Storage limit (${usedGB} GB / ${limitGB} GB)`,
    })
  }

  return violations
}

/** Increment the monthly usage counters after a successful publish. */
export async function bumpUsage(photoCount: number): Promise<void> {
  await supabase.rpc('bump_monthly_usage', { p_photos: photoCount, p_galleries: 1 })
}
