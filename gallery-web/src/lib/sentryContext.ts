// Sentry context helpers — attaches user / gallery / action breadcrumbs
// to every event captured after they're called.
//
// Every helper is a no-op when Sentry isn't initialized (no DSN in env),
// so feature code can call them unconditionally without a guard. Failures
// inside the SDK are swallowed — observability must never crash the app.

import * as Sentry from '@sentry/react'

export interface SentryUser {
  id: string
  /** Optional — the dashboard knows the photographer's email; the gallery
   *  viewer does not. Passed through verbatim; the `beforeSend` hook in
   *  `sentry.ts` redacts it from request payloads / extras but we keep it
   *  on the user object so Sentry can group + search by it. */
  email?: string
}

export function setSentryUser(user: SentryUser): void {
  try {
    Sentry.setUser({ id: user.id, email: user.email })
  } catch {
    /* observability never throws */
  }
}

/** Clear the user context — call on sign-out. */
export function clearSentryUser(): void {
  try {
    Sentry.setUser(null)
  } catch {
    /* observability never throws */
  }
}

export interface SentryGallery {
  id: string
  slug?: string | null
  status?: string | null
}

/** Tag the current Sentry scope with the gallery the user is operating on,
 *  and drop a breadcrumb so the event timeline shows when the user opened
 *  it. Tags are searchable in the Sentry UI — `gallery_id:abc` filters
 *  every event from that gallery's session. */
export function setSentryGallery(gallery: SentryGallery): void {
  try {
    Sentry.setTag('gallery_id', gallery.id)
    if (gallery.slug) Sentry.setTag('gallery_slug', gallery.slug)
    if (gallery.status) Sentry.setTag('gallery_status', gallery.status)
    Sentry.addBreadcrumb({
      category: 'gallery',
      message: 'open',
      level: 'info',
      data: {
        gallery_id: gallery.id,
        slug: gallery.slug ?? null,
        status: gallery.status ?? null,
      },
    })
  } catch {
    /* observability never throws */
  }
}

/** Drop a Sentry breadcrumb for a user action. Categories are short strings
 *  that group related events in the Sentry timeline ("gallery", "section",
 *  "upload", "story"). `data` is attached verbatim and runs through the
 *  PII redactor in `beforeSend`, so passing IDs / counts is safe. */
export function trackAction(
  category: string,
  action: string,
  data?: Record<string, unknown>,
): void {
  try {
    Sentry.addBreadcrumb({
      category,
      message: action,
      level: 'info',
      data,
      timestamp: Date.now() / 1000,
    })
  } catch {
    /* observability never throws */
  }
}

/** Pull the latest Sentry event id (set on any captured exception) along
 *  with the currently-tagged gallery + user. Used by the error boundary's
 *  "report this" button so the photographer can paste an actionable blob
 *  into a support email. */
export interface SentryReportContext {
  eventId: string | null
  user: { id: string | null; email: string | null }
  gallery: { id: string | null; slug: string | null; status: string | null }
  url: string
  userAgent: string
  timestamp: string
}

export function getSentryReportContext(): SentryReportContext {
  let eventId: string | null = null
  let userId: string | null = null
  let userEmail: string | null = null
  let galleryId: string | null = null
  let gallerySlug: string | null = null
  let galleryStatus: string | null = null
  try {
    eventId = Sentry.lastEventId() ?? null
    const scope = Sentry.getCurrentScope()
    const scopeUser = scope.getUser?.()
    if (scopeUser) {
      userId = (scopeUser.id as string | undefined) ?? null
      userEmail = (scopeUser.email as string | undefined) ?? null
    }
    // Tags aren't part of the public getter API, but the scope serializes
    // them via `getScopeData()`; fall back gracefully if the shape shifts.
    const scopeData = (scope as unknown as { getScopeData?: () => { tags?: Record<string, string> } }).getScopeData?.()
    const tags = scopeData?.tags ?? {}
    galleryId = tags.gallery_id ?? null
    gallerySlug = tags.gallery_slug ?? null
    galleryStatus = tags.gallery_status ?? null
  } catch {
    /* observability never throws */
  }
  return {
    eventId,
    user: { id: userId, email: userEmail },
    gallery: { id: galleryId, slug: gallerySlug, status: galleryStatus },
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    timestamp: new Date().toISOString(),
  }
}
