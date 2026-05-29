// galleryClient — gated read/write access to the gallery's content.
//
// Replaces direct supabase.from('images' | 'stories' | 'gallery_hidden_images')
// calls with SECURITY DEFINER RPCs that check an unlock token. For galleries
// that have not opted into the signed gate, the RPCs fall through to the
// legacy public path automatically — the server decides, the client doesn't
// branch on the flag.
//
// See supabase/migrations/041_signed_gate_tokens.sql.

import { supabase } from '../supabase'

const TOKEN_KEY_PREFIX = 'gf_token_'

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
  // …plus every other (non-password_hash) column on `galleries`. The original
  // viewer code reads these via `gallery as any` shapes, so we keep them
  // loose here rather than re-typing the schema.
  [k: string]: unknown
}

// ── token storage ───────────────────────────────────────────────────────────

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

export function storeToken(galleryId: string, token: string, expiresAtIso: string): void {
  const stored: StoredToken = {
    token,
    expiresAt: new Date(expiresAtIso).getTime(),
  }
  try {
    localStorage.setItem(TOKEN_KEY_PREFIX + galleryId, JSON.stringify(stored))
  } catch { /* storage full / disabled — token will just be re-issued next visit */ }
}

export function clearToken(galleryId: string): void {
  try {
    localStorage.removeItem(TOKEN_KEY_PREFIX + galleryId)
  } catch { /* ignore */ }
}

// ── verify ──────────────────────────────────────────────────────────────────

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

// ── reads ───────────────────────────────────────────────────────────────────

export async function getMeta(galleryId: string): Promise<GalleryMeta | null> {
  const { data, error } = await supabase.rpc('gallery_get_meta', {
    p_gallery_id: galleryId,
  })
  if (error || !data) return null
  return data as GalleryMeta
}

export async function getImages<T = unknown>(
  galleryId: string,
  opts: { offset?: number; limit?: number } = {},
): Promise<T[]> {
  const token = getStoredToken(galleryId)
  const { data, error } = await supabase.rpc('gallery_get_images', {
    p_gallery_id: galleryId,
    p_token: token,
    p_offset: opts.offset ?? 0,
    p_limit: opts.limit ?? 1000,
  })
  if (error || !data) return []
  // The viewer's GalleryImage type aliases web_preview_path → storage_path.
  // Direct .select('storage_path:web_preview_path') used to do that; the RPC
  // returns the raw column name, so re-alias here. Without this the viewer
  // tries to render thumb / web URLs from undefined paths and shows nothing.
  const rows: Array<Record<string, unknown>> = (data as Array<Record<string, unknown>>).map(row => ({
    ...row,
    storage_path: row.storage_path ?? row.web_preview_path,
  }))

  // Supplement pixel dimensions when the RPC didn't include them, so the grid
  // can reserve exact space per tile (no layout shift). Best-effort: anon-
  // readable for live galleries; a gated/blocked read just leaves dims absent
  // and the grid falls back to a placeholder ratio.
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

  return rows as T[]
}

export async function getStories<T = unknown>(galleryId: string): Promise<T[]> {
  const token = getStoredToken(galleryId)
  const { data, error } = await supabase.rpc('gallery_get_stories', {
    p_gallery_id: galleryId,
    p_token: token,
  })
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
