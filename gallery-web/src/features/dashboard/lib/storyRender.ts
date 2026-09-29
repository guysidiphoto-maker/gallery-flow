// Client helper for story generation: request a render and poll its status.
// Keeps endpoint paths and response shapes out of the dashboard JSX.

import { supabase } from '@/shared/lib/supabase'

// Default photo budget without curated favorites, tuned to the 30s clip
// ("favorites if any, otherwise the first 30").
export const STORY_DEFAULT_PHOTO_BUDGET = 30
export const STORY_MIN_PHOTOS = 12
export const STORY_MAX_PHOTOS = 60

// Rough render-time estimate for the user, calibrated to the Remotion renderer:
// a baseline cost per style + ~1.5s per extra
// photo (transforms, transitions, encoding scale roughly linearly).
export function estimateRenderSeconds(photoCount: number, style: StoryStyle): number {
  const baselineByStyle: Record<StoryStyle, number> = {
    'clean':       35,
    'cinematic':   55, // anamorphic look + slower transitions
    'fast-social': 25,
    'elegant':     45,
    'vintage':     50, // film grain + color grade
  }
  const base = baselineByStyle[style] ?? 35
  return Math.round(base + Math.max(0, photoCount - 12) * 1.5)
}

// Hebrew formatter: "45 שניות" / "כדקה" / "כ-2 דקות" / "כ-1:30 דקות".
export function formatStoryDuration(sec: number): string {
  if (sec < 60) return `כ-${sec} שניות`
  const minutes = Math.floor(sec / 60)
  const rem = sec % 60
  if (rem < 10) return `כ-${minutes} דקות`
  return `כ-${minutes}:${String(rem).padStart(2, '0')} דקות`
}

// Style ids match the Remotion compositions; order is the picker order.
export type StoryStyle = 'clean' | 'cinematic' | 'fast-social' | 'elegant' | 'vintage'

export interface StoryStyleMeta {
  id: StoryStyle
  label: string
  description: string
  hint: string
  approxDurationSec: number
}

export const STORY_STYLES: ReadonlyArray<StoryStyleMeta> = [
  {
    id: 'clean',
    label: 'Clean',
    description: 'תנועה עדינה + מעברים רכים',
    hint: 'Ken Burns + crossfade · 1080×1920',
    approxDurationSec: 30,
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'מסגרת רחבה, אופי קולנועי, מעברים איטיים',
    hint: 'Anamorphic look · 1080×1920',
    approxDurationSec: 35,
  },
  {
    id: 'fast-social',
    label: 'Fast Social',
    description: 'קצב מהיר לאינסטגרם / טיקטוק',
    hint: 'Quick cuts · 1080×1920',
    approxDurationSec: 20,
  },
  {
    id: 'elegant',
    label: 'Elegant',
    description: 'אסתטיקה רכה, רגעים נשימתיים',
    hint: 'Slow drift · 1080×1920',
    approxDurationSec: 35,
  },
  {
    id: 'vintage',
    label: 'Vintage',
    description: 'גוון פילם, שריטות עדינות, אופי נוסטלגי',
    hint: 'Film grain · 1080×1920',
    approxDurationSec: 30,
  },
]

export type StoryRenderStatus = 'queued' | 'rendering' | 'ready' | 'failed' | 'completed'

export interface StoryRenderResponse {
  ok: boolean
  status?: StoryRenderStatus
  renderId?: string
  message?: string
  error?: string
  /** Populated by the Vercel-Functions renderer when status='completed'. */
  outputUrl?: string | null
  outputPath?: string | null
  durationSeconds?: number
  fileSizeBytes?: number
}

export interface RequestStoryGenerationResult {
  ok: boolean
  status: StoryRenderResponse['status']
  /** Present on success — used to drive the polling loop in the Dashboard. */
  renderId?: string
  message?: string
  error?: string
  /** Human-readable Hebrew error for the toast. Hides infrastructure codes. */
  userError?: string
}

// Server error codes → Hebrew toast copy, so infra details never reach
// photographers. Unknown codes get a generic message (raw code in console).
function localizeRenderError(code?: string): string {
  switch (code) {
    case 'unauthenticated':
      return 'נדרשת התחברות מחדש'
    case 'not_owner':
      return 'אין הרשאה לייצר סטורי לגלריה הזו'
    case 'gallery_not_found':
      return 'הגלריה לא נמצאה'
    case 'invalid_gallery_id':
    case 'invalid_style':
    case 'invalid_photo_ids':
    case 'too_many_photos':
      return 'נתוני הבקשה אינם תקינים'
    case 'server_misconfigured':
    case 'renderer_not_ready':
      return 'ייצור סטורי לא זמין כרגע, נסי שוב בעוד דקה'
    case 'render_failed':
      return 'הייצור נכשל — אפשר לנסות שוב'
    case 'gallery_lookup_failed':
    case 'render_insert_failed':
      return 'שגיאה זמנית, נסי שוב'
    default:
      return 'יצירת הסטורי נכשלה'
  }
}

/** POST `/api/stories/render` with the owner's token; returns a normalized
 *  result. Pass `photoIds` for a curated story, omit for auto-selection. */
export async function requestStoryGeneration(
  galleryId: string,
  style: StoryStyle,
  // Render order; omitted → server auto-selects (favorites, else first 30).
  photoIds?: string[],
): Promise<RequestStoryGenerationResult> {
  // Pull the session token so the server can identify the caller. The
  // endpoint requires a Bearer token — without it we'd just get a 401.
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token

  if (!accessToken) {
    return { ok: false, status: 'failed', error: 'unauthenticated' }
  }

  try {
    const resp = await fetch('/api/stories/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ galleryId, style, photoIds }),
    })

    let payload: StoryRenderResponse = { ok: false }
    try {
      payload = (await resp.json()) as StoryRenderResponse
    } catch {
      // Non-JSON response (HTML error page from the platform, network blip).
      // Fall through with the default failure payload.
    }

    if (!resp.ok || !payload.ok) {
      const code = payload.error || `http_${resp.status}`
      return {
        ok: false,
        status: payload.status ?? 'failed',
        error: code,
        userError: localizeRenderError(code),
        message: payload.message,
        renderId: payload.renderId,
      }
    }

    return {
      ok: true,
      status: payload.status ?? 'queued',
      renderId: payload.renderId,
      message: payload.message,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'network_error'
    return {
      ok: false,
      status: 'failed',
      error: msg,
      userError: localizeRenderError(msg),
    }
  }
}

// ─── Polling helper ─────────────────────────────────────────────────────────
// Polled every 5s; network errors become 'failed' so callers have one path.

export interface StoryRenderStatusResponse {
  ok: boolean
  renderId?: string
  status?: StoryRenderStatus
  output_path?: string | null
  error_message?: string | null
  error?: string
}

/** GET the render status; keep polling until `ready` or `failed`. */
export async function pollStoryRender(
  renderId: string,
): Promise<StoryRenderStatusResponse> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token

  if (!accessToken) {
    return { ok: false, status: 'failed', error: 'unauthenticated' }
  }

  try {
    const resp = await fetch(
      `/api/stories/status?renderId=${encodeURIComponent(renderId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )

    let payload: StoryRenderStatusResponse = { ok: false }
    try {
      payload = (await resp.json()) as StoryRenderStatusResponse
    } catch {
      // Non-JSON response: degrade to a transient failure so the loop can
      // keep trying (caller decides when to give up).
    }

    if (!resp.ok || !payload.ok) {
      return {
        ok: false,
        status: payload.status ?? 'failed',
        error: payload.error || `http_${resp.status}`,
      }
    }

    return payload
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'network_error'
    return { ok: false, status: 'failed', error: msg }
  }
}
