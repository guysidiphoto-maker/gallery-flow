import { test as base } from '@playwright/test'

/**
 * Gallery fixture.
 *
 * Several specs need a real gallery id in the test DB — the editor, the
 * Settings live preview, the Stories modal. Rather than seeding from the
 * suite (slow + flaky against a shared Supabase project), we read three
 * env vars and skip-if-missing.
 *
 * Operator workflow:
 *   - `E2E_TEST_GALLERY_ID`         — a gallery the test user owns
 *   - `E2E_TEST_GALLERY_WITH_PHOTOS` — same gallery, must have >= 12 photos
 *                                      (Stories modal requires it)
 *   - `E2E_PUBLIC_GALLERY_URL`      — full URL of a published gallery
 *                                      (e.g. https://pixflow-ai.com/eclipse/demo)
 */

export const E2E_TEST_GALLERY_ID = process.env.E2E_TEST_GALLERY_ID ?? ''
export const E2E_TEST_GALLERY_WITH_PHOTOS = process.env.E2E_TEST_GALLERY_WITH_PHOTOS ?? E2E_TEST_GALLERY_ID
export const E2E_PUBLIC_GALLERY_URL = process.env.E2E_PUBLIC_GALLERY_URL ?? ''

export function requireGallery(): void {
  if (!E2E_TEST_GALLERY_ID) {
    base.skip(true, 'E2E_TEST_GALLERY_ID not set — skipping gallery-required spec')
  }
}

export function requireGalleryWithPhotos(): void {
  if (!E2E_TEST_GALLERY_WITH_PHOTOS) {
    base.skip(true, 'E2E_TEST_GALLERY_WITH_PHOTOS not set — skipping')
  }
}

export function requirePublicGallery(): void {
  if (!E2E_PUBLIC_GALLERY_URL) {
    base.skip(true, 'E2E_PUBLIC_GALLERY_URL not set — skipping')
  }
}

/**
 * Build the dashboard URL that opens the editor for a given gallery id.
 * Centralised so a router change touches one line, not six specs.
 */
export function editorUrlFor(galleryId: string): string {
  return `/dashboard?gallery=${encodeURIComponent(galleryId)}`
}
