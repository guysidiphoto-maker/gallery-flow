// storyRender.ts — client helper for kicking off automated story generation.
//
// Phase 1 wraps the POST to /api/stories/render. The endpoint is a SCAFFOLD
// (see gallery-web/api/stories/render.ts) — it validates + auth-checks and
// returns `{ status: 'queued' }` so the Dashboard's UX flow is testable
// before Phase 2 actually invokes Remotion Lambda.
//
// Keeping this in a thin helper rather than inlining `fetch` in Dashboard
// means Phase 2 can change the response shape (polling, renderId, etc.)
// without re-touching the JSX call site.

import { supabase } from '../supabase'

// Default photo budget when the photographer hasn't curated favorites. Tuned
// to the 30s clip length — under 12 photos looks like a slideshow, over 30
// rushes past faces. Aligns with the photo-source rule in the dashboard:
// "favorites if any, otherwise the first 30".
export const STORY_DEFAULT_PHOTO_BUDGET = 30

// All five styles ported from the desktop FFmpeg renderer
// (src/main/storyRenderer.ts). The Lambda invocation in Phase 2 will pick the
// Remotion composition matching the style id. Order here is the order shown
// in the dashboard's style picker.
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

export interface StoryRenderResponse {
  ok: boolean
  status?: 'queued' | 'rendering' | 'ready' | 'failed'
  message?: string
  error?: string
}

export interface RequestStoryGenerationResult {
  ok: boolean
  status: StoryRenderResponse['status']
  message?: string
  error?: string
}

/**
 * POST `/api/stories/render` with the caller's Supabase access token. The
 * server-side endpoint will reject the request if the user isn't the gallery
 * owner. Returns a normalized result so the caller (Dashboard) just toasts
 * success vs error without parsing HTTP shape.
 */
export async function requestStoryGeneration(
  galleryId: string,
  style: StoryStyle,
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
      body: JSON.stringify({ galleryId, style }),
    })

    let payload: StoryRenderResponse = { ok: false }
    try {
      payload = (await resp.json()) as StoryRenderResponse
    } catch {
      // Non-JSON response (HTML error page from the platform, network blip).
      // Fall through with the default failure payload.
    }

    if (!resp.ok || !payload.ok) {
      return {
        ok: false,
        status: payload.status ?? 'failed',
        error: payload.error || `http_${resp.status}`,
        message: payload.message,
      }
    }

    return {
      ok: true,
      status: payload.status ?? 'queued',
      message: payload.message,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'network_error'
    return { ok: false, status: 'failed', error: msg }
  }
}
