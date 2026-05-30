import { test, expect } from '@playwright/test'

/**
 * Sign-in screen smoke test.
 *
 * Regression target: every couple of sprints somebody re-introduces the
 * loud purple gradient on the welcome screen. The editorial sign-in look
 * is the brand promise — if it ships gradient-y, we want a red CI.
 *
 * Asserts:
 *   - /dashboard mounts (no router crash)
 *   - the Pixflow wordmark renders
 *   - the Hebrew "התחברות עם Google" button is present
 *   - no element on the page reports a purple-ish linear-gradient on its
 *     `background` / `background-image` (the recurring regression)
 */
test.describe('sign-in screen', () => {
  test('renders editorial style, not the purple-gradient throwback', async ({ page }) => {
    await page.goto('/dashboard')

    // Wordmark — copy lives in Dashboard.tsx around the logo block.
    await expect(page.getByText('Pixflow').first()).toBeVisible()

    // Google sign-in CTA (Hebrew).
    await expect(
      page.getByRole('button', { name: 'התחברות עם Google' }),
    ).toBeVisible()

    // Purple-gradient regression guard. We scan computed styles for any
    // linear-gradient containing the old brand purples (#7c3aed / #8b5cf6
    // / "purple"). If anyone re-introduces the welcome gradient this
    // fails loudly instead of slipping into prod again.
    const offending = await page.evaluate(() => {
      const PURPLE = /linear-gradient[^;]*(#7c3aed|#8b5cf6|#a855f7|purple|rgb\(\s*(?:12[0-7]|1[3-7]\d),\s*\d+,\s*23\d\s*\))/i
      const hits: string[] = []
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('*')).slice(0, 2000)) {
        const cs = window.getComputedStyle(el)
        const blob = `${cs.backgroundImage} ${cs.background}`
        if (PURPLE.test(blob)) hits.push(el.tagName + ' ' + blob.slice(0, 120))
      }
      return hits
    })
    expect(offending, 'no purple gradients on the sign-in screen').toEqual([])
  })
})
