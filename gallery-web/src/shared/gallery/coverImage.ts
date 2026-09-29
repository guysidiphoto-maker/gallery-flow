// Cover-image resolution shared by the public hero and the password gate so both
// apply the same rules, including defaults for galleries predating the cover toggle.

import { renderUrl } from '@/shared/lib/supabase'

export type CoverSource = 'none' | 'gallery_asset' | 'custom_upload'

export interface CoverConfig {
  /** Effective on/off after backward-compat resolution. */
  enabled: boolean
  source: CoverSource
  /** Storage path inside the gallery bucket (preferred, stable). */
  path: string | null
  /** Absolute URL fallback (custom/external cover, or legacy stored URL). */
  url: string | null
  /** Focal point / zoom, reused from the existing coverCrop field. */
  crop: { zoom: number; x: number; y: number } | null
}

const isHttpUrl = (v: unknown): v is string =>
  typeof v === 'string' && /^https?:\/\//i.test(v)

/** An unset `coverEnabled` means ON iff a cover was already chosen, so older galleries keep their look. */
export function readCoverConfig(
  raw: Record<string, unknown> | null | undefined,
): CoverConfig {
  const r = raw || {}
  const path = (r.coverImagePath as string | null | undefined) ?? null
  const url = (r.coverImageUrl as string | null | undefined) ?? null
  const id = (r.coverImageId as string | null | undefined) ?? null
  const rawSource = r.coverSource as CoverSource | undefined
  const hasAny = !!(path || url || id)

  const explicit =
    typeof r.coverEnabled === 'boolean' ? (r.coverEnabled as boolean) : undefined
  const enabled = explicit === undefined ? hasAny : explicit

  // Legacy rows lack coverSource: a `covers/` path is a custom upload, else a gallery asset.
  const source: CoverSource =
    rawSource ??
    (hasAny
      ? path && /\/covers\//.test(path)
        ? 'custom_upload'
        : 'gallery_asset'
      : 'none')

  const crop =
    (r.coverCrop as { zoom: number; x: number; y: number } | null | undefined) ?? null

  return { enabled, source, path, url, crop }
}

export function coverIsEnabled(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  return readCoverConfig(raw).enabled
}

/**
 * Image paths are `{business}/{galleryId}/...`, so a cover without the gallery id
 * segment belongs to another gallery. Blocks cross-gallery covers within a business.
 */
export function coverPathBelongsToGallery(
  path: string | null | undefined,
  galleryId: string | null | undefined,
): boolean {
  if (!path || !galleryId) return false
  return path.split('/').includes(galleryId)
}

/**
 * Private-gate background. Deliberately small and low quality so faces can't be
 * recognised before unlock (privacy) and the heavy blur doesn't waste bytes.
 */
export function gateCoverBackgroundUrl(
  raw: Record<string, unknown> | null | undefined,
  bucket: string,
  opts?: { width?: number; quality?: number },
): string | null {
  const cfg = readCoverConfig(raw)
  if (!cfg.enabled) return null
  const width = opts?.width ?? 900
  const quality = opts?.quality ?? 45
  if (cfg.path) return renderUrl(bucket, cfg.path, width, quality)
  if (isHttpUrl(cfg.url)) return cfg.url
  return null
}
