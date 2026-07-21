// Shared cover-image resolution — single source of truth for "does this
// gallery have a cover, where does it come from, and what URL should each
// surface load". Used by the public hero/welcome and the private password
// gate so both agree on the same rules (incl. backward-compat defaults for
// galleries created before the cover toggle existed).

import { renderUrl } from '../supabase'

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

/**
 * Read cover config from a raw `delivery_settings` object.
 *
 * Backward compatibility is the whole point of this function. `coverEnabled`
 * and `coverSource` did not exist before this feature, so:
 *  - coverEnabled === false      → OFF (owner explicitly disabled)
 *  - coverEnabled === true        → ON
 *  - coverEnabled === undefined   → ON iff a cover was already chosen
 *                                   (legacy galleries keep their current look)
 */
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

  // Infer source when the explicit discriminator is absent (legacy rows). A
  // path under a `covers/` folder is a separately-uploaded cover; anything
  // else that has a value came from an existing gallery asset.
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

/** Convenience: is a cover effectively shown for this gallery? */
export function coverIsEnabled(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  return readCoverConfig(raw).enabled
}

/**
 * Background URL for the PRIVATE gate (password / private face-search).
 *
 * Deliberately small + low quality: the gate blurs the image hard, so extra
 * detail is wasted bytes on mobile networks — and, critically, a low-res
 * source means a face cannot be recognised before the gallery is unlocked
 * (privacy). One transform per gallery cover, cached a year at the edge.
 *
 * Falls back to an absolute cover URL only when no storage path is known
 * (e.g. an externally-hosted cover). Returns null when the cover is disabled
 * or unset, so the gate keeps its current flat-dark look.
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
