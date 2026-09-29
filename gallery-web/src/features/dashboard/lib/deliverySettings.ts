import { supabase } from '@/shared/lib/supabase'

// The only allowed write path for delivery_settings: direct column UPDATE is
// revoked, so every write goes through the owner-checked, validating RPC.
// Returns ok=false with the server's errors so callers can roll back.
export async function saveDeliverySettings(
  galleryId: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; errors?: unknown }> {
  const { data, error } = await supabase.rpc('update_gallery_settings', {
    p_gallery_id: galleryId,
    p_patch: patch,
  })
  if (error) return { ok: false, errors: [{ key: '_rpc', error: error.message }] }
  const res = (data ?? {}) as { ok?: boolean; errors?: unknown }
  return { ok: res.ok === true, errors: res.errors }
}

// Keys edited one character at a time; their writes are debounced so typing
// doesn't fire a round-trip per keystroke. Everything else writes immediately.
export const TEXT_INPUT_KEYS = new Set([
  'galleryTitle', 'galleryDescription', 'welcomeMessage',
  'clientName', 'studioName', 'studioWebsite',
  'eventLocation', 'eventType',
  'password', 'clientCode', 'galleryCode',
  'watermarkText', 'logoUrl', 'themeColor',
])

export const TEXT_WRITE_DEBOUNCE_MS = 600
