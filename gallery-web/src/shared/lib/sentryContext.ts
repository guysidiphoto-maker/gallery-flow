// Sentry user/action context. Every helper is a safe no-op when Sentry isn't
// initialized, so feature code can call them unconditionally.

import { loadedSentry, withSentry } from './sentry'

interface SentryUser {
  id: string
  /** Kept on the user object (not redacted) so Sentry can group/search by it. */
  email?: string
}

export function setSentryUser(user: SentryUser): void {
  withSentry(S => S.setUser({ id: user.id, email: user.email }))
}

/** Breadcrumb for a user action; `data` passes through the PII redactor. */
export function trackAction(
  category: string,
  action: string,
  data?: Record<string, unknown>,
): void {
  const timestamp = Date.now() / 1000
  withSentry(S => S.addBreadcrumb({ category, message: action, level: 'info', data, timestamp }))
}

interface SentryReportContext {
  eventId: string | null
  user: { id: string | null; email: string | null }
  gallery: { id: string | null; slug: string | null; status: string | null }
  url: string
  userAgent: string
  timestamp: string
}

/** Last event id + tagged user/gallery, for the error boundary's "report this" blob. */
export function getSentryReportContext(): SentryReportContext {
  let eventId: string | null = null
  let userId: string | null = null
  let userEmail: string | null = null
  let galleryId: string | null = null
  let gallerySlug: string | null = null
  let galleryStatus: string | null = null
  const Sentry = loadedSentry()
  if (Sentry) try {
    eventId = Sentry.lastEventId() ?? null
    const scope = Sentry.getCurrentScope()
    const scopeUser = scope.getUser?.()
    if (scopeUser) {
      userId = (scopeUser.id as string | undefined) ?? null
      userEmail = (scopeUser.email as string | undefined) ?? null
    }
    // Tags have no public getter; getScopeData() is best-effort.
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
