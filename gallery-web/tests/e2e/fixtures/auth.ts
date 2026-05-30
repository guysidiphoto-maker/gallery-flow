import { test as base, expect, type Page, type BrowserContext } from '@playwright/test'

/**
 * Auth fixture.
 *
 * Real Google OAuth in headless Chromium is brittle (consent screens,
 * device verification, captchas). Instead we inject a pre-signed Supabase
 * session JWT directly into the storage where supabase-js looks for it.
 *
 * Operator workflow:
 *   1. Create a dedicated test user in Supabase (e.g. `e2e@pixflow.test`).
 *   2. Sign that user a long-lived JWT with the project's service-role key.
 *      (See `gallery-web/tests/README.md` for the snippet.)
 *   3. Export it as `E2E_TEST_USER_JWT` before running the suite.
 *
 * If the env var is missing, auth-dependent tests `test.skip` so CI without
 * test creds stays green.
 */

export const E2E_TEST_USER_JWT = process.env.E2E_TEST_USER_JWT ?? ''
export const E2E_TEST_USER_REFRESH = process.env.E2E_TEST_USER_REFRESH ?? E2E_TEST_USER_JWT
export const E2E_SUPABASE_PROJECT_REF = process.env.E2E_SUPABASE_PROJECT_REF ?? ''

export function requireAuth(): void {
  if (!E2E_TEST_USER_JWT) {
    base.skip(true, 'E2E_TEST_USER_JWT not set — skipping auth-required spec')
  }
}

/**
 * Build the localStorage key supabase-js uses for the session blob.
 * supabase-js stores its session under `sb-<project-ref>-auth-token`.
 * If `E2E_SUPABASE_PROJECT_REF` is unset we fall back to the legacy key.
 */
function storageKey(): string {
  return E2E_SUPABASE_PROJECT_REF
    ? `sb-${E2E_SUPABASE_PROJECT_REF}-auth-token`
    : 'supabase.auth.token'
}

/**
 * Seed a Supabase session into the browser's localStorage so the dashboard
 * mounts as the test user. Must be called before the first `page.goto`
 * that crosses an auth boundary.
 */
export async function seedSupabaseSession(context: BrowserContext, baseURL: string): Promise<void> {
  if (!E2E_TEST_USER_JWT) return

  const key = storageKey()
  const session = {
    access_token: E2E_TEST_USER_JWT,
    refresh_token: E2E_TEST_USER_REFRESH,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: null,
  }

  // Use addInitScript so the session is in place *before* any app JS runs.
  await context.addInitScript(
    ({ key, session }: { key: string; session: unknown }) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(session))
      } catch {
        // localStorage can be blocked on some about: pages — ignore.
      }
    },
    { key, session },
  )

  // Touch the origin once so storage is actually scoped to it.
  const page = await context.newPage()
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await page.close()
}

export type AuthedFixtures = {
  authedPage: Page
}

/**
 * Drop-in replacement for `test` that yields a page already seeded with a
 * Supabase session. Skips the whole spec when no JWT is configured.
 */
export const authedTest = base.extend<AuthedFixtures>({
  authedPage: async ({ context, baseURL }, use) => {
    if (!E2E_TEST_USER_JWT) {
      base.skip(true, 'E2E_TEST_USER_JWT not set')
    }
    await seedSupabaseSession(context, baseURL ?? 'http://localhost:5173')
    const page = await context.newPage()
    await use(page)
    await page.close()
  },
})

export { expect }
