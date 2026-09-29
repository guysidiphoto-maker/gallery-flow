// Gated gallery reads/writes via SECURITY DEFINER RPCs that check an unlock token.
// Galleries without the signed gate fall through to the public path server-side,
// so the client never branches on the flag.

import { supabase } from '@/shared/lib/supabase'

const TOKEN_KEY_PREFIX = 'gf_token_'

// Retry with backoff so a single network blip doesn't surface as "Gallery not
// found" or a truncated gallery. `isEmptyOk` accepts a legitimately empty result.
async function rpcWithRetry(
  fn: () => PromiseLike<{ data: unknown; error: unknown }>,
  opts: { tries?: number; isEmptyOk?: (data: unknown) => boolean } = {},
): Promise<{ data: unknown; error: unknown }> {
  const tries = opts.tries ?? 3
  let last: { data: unknown; error: unknown } = { data: null, error: new Error('no attempt') }
  for (let i = 0; i < tries; i++) {
    last = await fn()
    if (!last.error && last.data != null) return last
    // A clean empty result the caller considers terminal — don't retry.
    if (!last.error && opts.isEmptyOk?.(last.data)) return last
    if (i < tries - 1) await new Promise(r => setTimeout(r, 400 * (i + 1)))
  }
  return last
}

// Re-alias web_preview_path → storage_path and best-effort fill missing pixel
// dims. Shared by getImages and bootstrapGallery so both produce identical rows.
async function normalizeImageRows(
  galleryId: string,
  data: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = data.map(row => ({
    ...row,
    storage_path: row.storage_path ?? row.web_preview_path,
  }))
  if (rows.length > 0 && rows[0].width == null) {
    const { data: dimRows } = await supabase
      .from('images')
      .select('id, width, height')
      .eq('gallery_id', galleryId)
    if (dimRows) {
      const byId = new Map(dimRows.map(d => [d.id as string, d]))
      for (const r of rows) {
        const d = byId.get(r.id as string)
        if (d?.width && d?.height) { r.width = d.width; r.height = d.height }
      }
    }
  }
  return rows
}

export interface BootstrapResult<M = unknown, I = unknown, S = unknown> {
  // 'unavailable' = RPC missing or transient failure: fall back to the multi-call path.
  status: 'ok' | 'not_found' | 'unavailable'
  galleryId?: string
  meta?: M
  images?: I[]
  sections?: S[]
  // One-time-payment gallery not yet paid: images are empty and the viewer shows a paywall.
  locked?: boolean
}

interface StoredToken {
  token: string
  expiresAt: number  // unix ms
}

export interface VerifyResult {
  ok: boolean
  retry_after_seconds?: number
  token?: string
  expires_at?: string
}

export interface GalleryMeta {
  id: string
  has_password: boolean
  signed_gate_enabled: boolean
  // Plus every other non-secret `galleries` column; kept loose rather than re-typing the schema.
  [k: string]: unknown
}

export function getStoredToken(galleryId: string): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY_PREFIX + galleryId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredToken
    if (!parsed?.token || !parsed?.expiresAt || parsed.expiresAt < Date.now()) {
      localStorage.removeItem(TOKEN_KEY_PREFIX + galleryId)
      return null
    }
    return parsed.token
  } catch {
    return null
  }
}

function storeToken(galleryId: string, token: string, expiresAtIso: string): void {
  const stored: StoredToken = {
    token,
    expiresAt: new Date(expiresAtIso).getTime(),
  }
  try {
    localStorage.setItem(TOKEN_KEY_PREFIX + galleryId, JSON.stringify(stored))
  } catch { /* storage full / disabled — token will just be re-issued next visit */ }
}

export async function verifyPassword(galleryId: string, password: string): Promise<VerifyResult> {
  const { data, error } = await supabase.rpc('verify_gallery_password', {
    p_gallery_id: galleryId,
    p_password: password,
  })
  if (error) return { ok: false }
  const res = (data ?? {}) as VerifyResult
  if (res.ok && res.token && res.expires_at) {
    storeToken(galleryId, res.token, res.expires_at)
  }
  return res
}

// First load in one round trip: meta + first image page + sections by slug.
export async function bootstrapGallery<M = GalleryMeta, I = unknown, S = unknown>(
  businessSlug: string,
  gallerySlug: string,
  limit = 300,
): Promise<BootstrapResult<M, I, S>> {
  const { data, error } = await rpcWithRetry(() =>
    supabase.rpc('gallery_bootstrap', {
      p_business_slug: businessSlug,
      p_gallery_slug: gallerySlug,
      p_limit: limit,
    }),
  )
  if (error || !data) return { status: 'unavailable' }
  const res = data as { ok?: boolean; error?: string; gallery_id?: string; meta?: M; images?: unknown; sections?: S[]; locked?: boolean }
  if (res.ok !== true) {
    return { status: res.error === 'not_found' ? 'not_found' : 'unavailable' }
  }
  const images = await normalizeImageRows(
    res.gallery_id as string,
    (res.images as Array<Record<string, unknown>>) ?? [],
  )
  return {
    status: 'ok',
    galleryId: res.gallery_id,
    meta: res.meta,
    images: images as I[],
    sections: (res.sections ?? []) as S[],
    locked: res.locked === true,
  }
}

export async function getMeta(galleryId: string): Promise<GalleryMeta | null> {
  const { data, error } = await rpcWithRetry(() =>
    supabase.rpc('gallery_get_meta', { p_gallery_id: galleryId }),
  )
  if (error || !data) return null
  return data as GalleryMeta
}

export async function getImages<T = unknown>(
  galleryId: string,
  opts: { offset?: number; limit?: number } = {},
): Promise<T[]> {
  const res = await getImagesResult<T>(galleryId, opts)
  return res.ok ? res.data : []
}

// Like getImages but distinguishes a real empty page from a transient failure,
// so background pagination doesn't silently truncate a large gallery on a blip.
export async function getImagesResult<T = unknown>(
  galleryId: string,
  opts: { offset?: number; limit?: number } = {},
): Promise<{ ok: true; data: T[] } | { ok: false }> {
  const token = getStoredToken(galleryId)
  const { data, error } = await rpcWithRetry(
    () => supabase.rpc('gallery_get_images', {
      p_gallery_id: galleryId,
      p_token: token,
      p_offset: opts.offset ?? 0,
      p_limit: opts.limit ?? 1000,
    }),
    // Empty array = past the last page; don't burn retries on it.
    { isEmptyOk: d => Array.isArray(d) },
  )
  if (error || !data) return { ok: false }
  const rows = await normalizeImageRows(galleryId, data as Array<Record<string, unknown>>)
  return { ok: true, data: rows as T[] }
}

export async function getStories<T = unknown>(galleryId: string): Promise<T[]> {
  const token = getStoredToken(galleryId)
  const { data, error } = await rpcWithRetry(
    () => supabase.rpc('gallery_get_stories', { p_gallery_id: galleryId, p_token: token }),
    { isEmptyOk: d => Array.isArray(d) },
  )
  if (error || !data) return []
  return data as T[]
}

export async function getHidden(galleryId: string): Promise<string[]> {
  const token = getStoredToken(galleryId)
  const { data, error } = await supabase.rpc('gallery_get_hidden', {
    p_gallery_id: galleryId,
    p_token: token,
  })
  if (error || !data) return []
  return (data as Array<{ image_id: string }>).map(r => r.image_id)
}

export async function setHidden(
  galleryId: string,
  imageId: string,
  hidden: boolean,
): Promise<void> {
  const token = getStoredToken(galleryId)
  await supabase.rpc('gallery_set_hidden', {
    p_gallery_id: galleryId,
    p_image_id: imageId,
    p_hidden: hidden,
    p_token: token,
  })
}
