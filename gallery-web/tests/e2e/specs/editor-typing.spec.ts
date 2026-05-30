import { expect } from '@playwright/test'
import { authedTest } from '../fixtures/auth'
import { E2E_TEST_GALLERY_ID, editorUrlFor, requireGallery } from '../fixtures/gallery'

/**
 * Editor typing smoke test (auth + gallery required).
 *
 * Regression target: the focus-trap bug. Twice now a refactor of the
 * editor modal accidentally re-mounted the input on every keystroke,
 * stealing focus and dropping characters. The user noticed both times by
 * typing into the title and seeing only the last letter land.
 *
 * Test: type a known string into the gallery-title input, then assert
 * the *full* value is in the field. Cheap and catches the regression
 * cold.
 */
authedTest.describe('editor typing', () => {
  authedTest('typing into the title input lands every character', async ({ authedPage: page }) => {
    requireGallery()

    await page.goto(editorUrlFor(E2E_TEST_GALLERY_ID))
    await page.waitForLoadState('networkidle')

    // The gallery editor modal opens via the URL query param. Switch to
    // the Settings tab where the title input lives.
    const settingsTab = page.getByRole('button', { name: 'הגדרות' }).first()
    if (await settingsTab.count()) {
      await settingsTab.click()
    }

    // The title input is labelled "כותרת הגלריה" (Gallery title).
    const titleInput = page.getByLabel('כותרת הגלריה')
    await expect(titleInput).toBeVisible({ timeout: 15_000 })

    // Use a randomized probe so re-runs against a polluted DB don't false-
    // pass against an old value, and so the assertion is unambiguous.
    const probe = `e2e-${Date.now().toString(36)}-abcdefg`

    await titleInput.click()
    await titleInput.fill('') // clear so we measure exactly what we typed
    await titleInput.pressSequentially(probe, { delay: 12 })

    // The regression bit us because re-mounting the input on each
    // keystroke kept only the last character. So assert the *whole*
    // string is present, not just any text.
    await expect(titleInput).toHaveValue(probe)
  })
})
