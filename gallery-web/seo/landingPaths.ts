// SEO landing URLs, kept apart from content.ts so the router (main bundle) doesn't
// ship every page's copy. tests/routes.test.ts checks the two stay in sync.
export const LANDING_PATHS: ReadonlySet<string> = new Set([
  '/face-recognition-photo-gallery',
  '/ai-event-photo-gallery',
  '/event-photographers',
  '/event-production-companies',
  '/wedding-photo-gallery',
  '/corporate-event-gallery',
  '/how-it-works',
])
