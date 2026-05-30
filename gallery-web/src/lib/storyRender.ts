// storyRender.ts — client helper for kicking off automated story generation
// and polling the resulting render.
//
// Phase 1 wrapped only the POST to /api/stories/render with a queued stub.
// Phase 2 also exposes `pollStoryRender(renderId)` which the Dashboard calls
// every 5s after a successful render request — it lets the JSX render the
// "in progress" toast while the photographer keeps working.
//
// Keeping all the network shape in this module means the Dashboard doesn't
// hard-code endpoint paths or response shapes — Phase 3 could swap polling
// for SSE / Workflow DevKit without touching the JSX.

import { supabase } from '../supabase'

export type StoryStyle = 'clean'

export type StoryRenderStatus = 'queued' | 'rendering' | 'ready' | 'failed'

export interface StoryRenderResponse {
  ok: boolean
  status?: StoryRenderStatus
  renderId?: string
  message?: string
  error?: string
}

export interface RequestStoryGenerationResult {
  ok: boolean
  status: StoryRenderResponse['status']
  /** Present on success — used to drive the polling loop in the Dashboard. */
  renderId?: string
  message?: string
  error?: string
}

/**
 * POST `/api/stories/render` with the caller's Supabase access token. The
 * server-side endpoint will reject the request if the user isn't the gallery
 * owner. Returns a normalized result so the caller (Dashboard) just toasts
 * success vs error without parsing HTTP shape.
 *
 * Phase 2: `photoIds` optional. When provided, the server uses exactly those
 * images for the render (curated stories). Omit to use the full gallery.
 */
export async function requestStoryGeneration(
  galleryId: string,
  style: StoryStyle,
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
      body: JSON.stringify({
        galleryId,
        style,
        ...(photoIds && photoIds.length > 0 ? { photoIds } : {}),
      }),
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
    return { ok: false, status: 'failed', error: msg }
  }
}

// ─── Polling helper ─────────────────────────────────────────────────────────
// The Dashboard polls this every 5s after a successful render request.
// Network errors are coerced to a 'failed' status so the JSX has exactly one
// decision tree to walk.

export interface StoryRenderStatusResponse {
  ok: boolean
  renderId?: string
  status?: StoryRenderStatus
  output_path?: string | null
  error_message?: string | null
  error?: string
}

/**
 * GET `/api/stories/status?renderId=<id>` with the caller's access token.
 * Returns a normalized status snapshot. Callers should keep polling until
 * `status` is `ready` or `failed`.
 */
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
