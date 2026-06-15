import { test, expect, type Page } from '@playwright/test'

/**
 * PR1 — Client dashboard "Social OS" navigation regression.
 *
 * Verifies the simplified primary navigation (Dashboard / Social Studio /
 * Library) and that the frozen/legacy areas (My Page, Tender) are NOT primary
 * — they live under "More". Requires the deployment-under-test to run with
 * VITE_FEATURE_NEW_IA=true (e.g. a preview build, or the local dev server
 * started with that env).
 *
 * Operator env:
 *   E2E_CLIENT_DASH_URL — full URL of an authenticated client dashboard
 *                         (flag-on build), e.g.
 *                         http://localhost:5174/<biz>/client/<uuid>/dashboard
 *   E2E_CLIENT_CODE     — optional access code if the client is code-gated
 *
 * Skips when E2E_CLIENT_DASH_URL is unset, matching the rest of the suite.
 */
const DASH_URL = process.env.E2E_CLIENT_DASH_URL ?? ''
const CLIENT_CODE = process.env.E2E_CLIENT_CODE ?? ''

async function passCodeGate(page: Page): Promise<void> {
  // The dashboard shows a code gate only when delivery_settings.clientCode is
  // set. If a code input is visible and we were given a code, enter it.
  const codeInput = page.locator('input[type="password"], input[inputmode="numeric"], input[type="text"]').first()
  if (CLIENT_CODE && await codeInput.isVisible().catch(() => false)) {
    await codeInput.fill(CLIENT_CODE)
    await codeInput.press('Enter')
  }
}

test.describe('client dashboard — Social OS nav (PR1)', () => {
  test('primary nav = Dashboard / Social Studio / Library; legacy under More', async ({ page }) => {
    test.skip(!DASH_URL, 'E2E_CLIENT_DASH_URL not set — skipping')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DASH_URL, { waitUntil: 'domcontentloaded' })
    await passCodeGate(page)

    const primary = page.locator('nav[aria-label="Primary"]')
    await expect(primary).toBeVisible({ timeout: 20_000 })

    // The three primary areas are present.
    for (const label of ['Dashboard', 'Social Studio', 'Library']) {
      await expect(primary.getByRole('button', { name: label })).toBeVisible()
    }

    // Legacy areas are NOT in the primary nav...
    await expect(primary.getByRole('button', { name: 'My Page' })).toHaveCount(0)
    await expect(primary.getByRole('button', { name: 'חיפוש למכרז' })).toHaveCount(0)

    // ...but reachable via More.
    await primary.getByRole('button', { name: 'More' }).click()
    await expect(page.getByRole('menuitem', { name: 'My Page' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'חיפוש למכרז' })).toBeVisible()
  })

  test('Social Studio unifies Feed / Compose / Calendar', async ({ page }) => {
    test.skip(!DASH_URL, 'E2E_CLIENT_DASH_URL not set — skipping')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DASH_URL, { waitUntil: 'domcontentloaded' })
    await passCodeGate(page)

    await page.locator('nav[aria-label="Primary"]').getByRole('button', { name: 'Social Studio' }).click()
    for (const sub of ['Feed', 'Compose', 'Calendar']) {
      await expect(page.getByRole('button', { name: sub, exact: true })).toBeVisible({ timeout: 15_000 })
    }
  })
})
