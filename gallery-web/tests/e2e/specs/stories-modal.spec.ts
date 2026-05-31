import { expect } from '@playwright/test'
import { authedTest } from '../fixtures/auth'
import {
  E2E_TEST_GALLERY_WITH_PHOTOS,
  editorUrlFor,
  requireGalleryWithPhotos,
} from '../fixtures/gallery'

/**
 * Stories modal smoke test (auth + gallery-with-12+-photos required).
 *
 * The auto-stories flow is the highest-value moment in the dashboard and
 * the most fragile (style picker, photo curator, time estimate, all
 * driven by a single dialog). Asserts:
 *   - clicking "צור סטורי אוטומטית" opens the modal
 *   - exactly five style cards render
 *   - the photo curator surface is visible
 *   - the time estimate updates when the selected style changes
 */
authedTest.describe('stories modal', () => {
  authedTest('opens, shows 5 styles + curator, time estimate reacts to style', async ({ authedPage: page }) => {
    requireGalleryWithPhotos()

    await page.goto(editorUrlFor(E2E_TEST_GALLERY_WITH_PHOTOS))
    await page.waitForLoadState('networkidle')

    // Navigate to the Stories tab.
    const storiesTab = page.getByRole('button', { name: 'סטוריז' }).first()
    await expect(storiesTab).toBeVisible({ timeout: 15_000 })
    await storiesTab.click()

    // Trigger the auto-story flow.
    const autoStoryCta = page.getByRole('button', { name: 'צור סטורי אוטומטית' })
    await expect(autoStoryCta).toBeVisible()
    await autoStoryCta.click()

    // Modal anchored by its dialog role.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // Five style cards. The picker renders them with role="radio" or a
    // data-attribute — we accept either, since the implementation has
    // churned.
    const styleCards = dialog.locator('[data-story-style], [role="radio"]')
    await expect(styleCards).toHaveCount(5)

    // Photo curator is identified by its Hebrew heading.
    await expect(dialog.getByText(/בחירת תמונות|מציאת תמונות|אוצרות/i).first()).toBeVisible()

    // Time estimate. The label always contains the Hebrew word "דקות"
    // (minutes) or "שניות" (seconds). Snapshot the text, switch styles,
    // assert the text changed.
    const estimate = dialog.locator('text=/(דקות|שניות)/').first()
    const before = (await estimate.innerText()).trim()

    // Pick a different style than whatever is currently selected.
    const second = styleCards.nth(1)
    await second.click()

    await expect.poll(async () => (await estimate.innerText()).trim(), {
      timeout: 5_000,
      message: 'time estimate should update when style changes',
    }).not.toBe(before)
  })
})
