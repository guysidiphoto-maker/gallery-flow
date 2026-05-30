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

export type StoryStyle = 'clean'

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
