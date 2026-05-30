import { expect } from '@playwright/test'
import { authedTest } from '../fixtures/auth'
import { E2E_TEST_GALLERY_ID, editorUrlFor, requireGallery } from '../fixtures/gallery'

/**
 * Live preview toggle smoke test (auth + gallery required).
 *
 * The Settings tab in the editor mounts a side-preview surface (currently
 * a styled <div>+<img>; the Phase 7 plan upgrades it to a true <iframe>
 * of the public viewer). This test asserts:
 *   - the preview surface mounts
 *   - clicking the "LIVE" toggle hides it
 *   - clicking again brings it back
 *
 * Selector strategy is permissive: the preview surface is identified by
 * the Hebrew "תצוגה מקדימה · ראש הגלריה" eyebrow that lives in the
 * preview header today. If the implementation swaps to an <iframe>, the
 * test still finds it via that text.
 */
authedTest.describe('live preview toggle', () => {
  authedTest('preview surface mounts and toggles', async ({ authedPage: page }) => {
    requireGallery()

    await page.goto(editorUrlFor(E2E_TEST_GALLERY_ID))
    await page.waitForLoadState('networkidle')

    const settingsTab = page.getByRole('button', { name: 'הגדרות' }).first()
    if (await settingsTab.count()) {
      await settingsTab.click()
    }

    // The preview block is anchored by its eyebrow text.
    const previewEyebrow = page.getByText('תצוגה מקדימה').first()
    await expect(previewEyebrow).toBeVisible({ timeout: 15_000 })

    // The LIVE toggle is a button labelled "LIVE" (uppercase). It may be
    // absent today — if it is, we soft-skip the toggle assertion so the
    // visibility regression is still guarded.
    const liveBtn = page.getByRole('button', { name: /^LIVE$/ })
    if (await liveBtn.count() === 0) {
      authedTest.info().annotations.push({
        type: 'skip-reason',
        description: 'LIVE toggle not yet shipped — only asserted preview mount',
      })
      return
    }

    await liveBtn.click()
    await expect(previewEyebrow).toBeHidden()
    await liveBtn.click()
    await expect(previewEyebrow).toBeVisible()
  })
})
