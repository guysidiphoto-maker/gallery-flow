import { test, expect } from '@playwright/test'
import { E2E_PUBLIC_GALLERY_URL, requirePublicGallery } from '../fixtures/gallery'

/**
 * Public viewer smoke test.
 *
 * Regression target: the App.tsx viewer is the surface clients actually
 * see. A broken hero/section/grid pipeline is the worst possible
 * regression — silent and customer-visible. The published galleries
 * sometimes break because of:
 *   - a typography refactor stripping the `.hero__title` class
 *   - a Suspense boundary that swallows the section heading
 *   - a Sharp/edge transform 404'ing the photo grid sources
 *
 * Reads `E2E_PUBLIC_GALLERY_URL` (full URL) and asserts the three load-
 * bearing chunks are visible: hero, at least one section heading, at
 * least four photo tiles.
 */
test.describe('public viewer', () => {
  test('hero + section heading + photo grid render', async ({ page }) => {
    requirePublicGallery()

    const response = await page.goto(E2E_PUBLIC_GALLERY_URL)
    expect(response?.ok(), `viewer URL responded ok (got ${response?.status()})`).toBe(true)

    // Hero. App.tsx renders `<header class="hero ...">` with a `.hero__title`.
    await expect(page.locator('header.hero')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.hero__title')).toBeVisible()

    // At least one section heading. The viewer renders sections with an
    // <h2>; fall back to a generic heading role if class names change.
    const sectionHeading = page.getByRole('heading', { level: 2 }).first()
    await expect(sectionHeading).toBeVisible({ timeout: 15_000 })

    // Photo grid — at least four <img>s inside the gallery body.
    const photoImgs = page.locator('main img, .gallery img, [data-photo-tile] img')
    await expect.poll(async () => photoImgs.count(), {
      timeout: 15_000,
      message: 'photo grid should render at least four tiles',
    }).toBeGreaterThanOrEqual(4)
  })
})
