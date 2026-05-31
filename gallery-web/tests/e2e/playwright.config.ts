import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the gallery-web smoke suite.
 *
 * Chromium-only on purpose — the suite is a guard against the obvious UX
 * regressions the team has been catching by hand (focus-trap bugs in the
 * editor, the public viewer hero failing to render, the sign-in screen
 * accidentally bringing back the purple gradient, etc). We don't need the
 * cross-browser matrix for that; we need fast feedback on every PR.
 *
 * `E2E_BASE_URL` defaults to the local Vite dev server. CI / preview hooks
 * should override it with the Vercel deployment URL.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
