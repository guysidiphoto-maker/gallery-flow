# gallery-web e2e smoke suite

Playwright Chromium-only smoke tests for the web dashboard, the editor, and
the public viewer. The goal is **catching the obvious regression in CI on
every PR** — the focus-trap typing bug, the purple-gradient sign-in
throwback, a broken stories modal, a viewer that ships without a hero.

Specs live in `tests/e2e/specs/`. The fixtures in `tests/e2e/fixtures/`
make every spec skip-if-missing-env so a CI run without secrets stays
green instead of flaking red.

## First-time setup (operator)

```bash
cd gallery-web
npm install
npx playwright install --with-deps chromium
```

## Environment variables

The suite needs three secrets to fully exercise the dashboard. **All
three are optional** — specs that need a missing one will `test.skip`.

| Var | What | How to get it |
| --- | --- | --- |
| `E2E_BASE_URL` | App base URL. Default `http://localhost:5173`. | Set to the Vercel preview URL in CI. |
| `E2E_TEST_USER_JWT` | Long-lived Supabase access token for a dedicated `e2e@pixflow.test` user. | See "Signing the test JWT" below. |
| `E2E_TEST_USER_REFRESH` | Refresh token for the same user (optional, falls back to JWT). | Same flow as above. |
| `E2E_SUPABASE_PROJECT_REF` | Your Supabase project ref (e.g. `abcd1234`). | Supabase Dashboard → Project Settings → General. |
| `E2E_TEST_GALLERY_ID` | A gallery id the test user owns. | Create one in the dashboard, copy the UUID. |
| `E2E_TEST_GALLERY_WITH_PHOTOS` | Same gallery, must have **>= 12 photos** (Stories modal requirement). | Upload to the test gallery. |
| `E2E_PUBLIC_GALLERY_URL` | Full URL of any published gallery. | e.g. `https://pixflow-ai.com/eclipse-media/demo`. |

## Signing the test JWT

Real Google OAuth in headless Chromium is brittle. Instead we inject a
pre-signed Supabase session blob into `localStorage` via Playwright's
`addInitScript`. To mint the JWT:

```ts
// scripts/mint-e2e-jwt.mjs
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // service-role key, never commit
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const { data, error } = await supabaseAdmin.auth.admin.generateLink({
  type: 'magiclink',
  email: 'e2e@pixflow.test',
})
if (error) throw error
// Extract the access_token from data.properties.action_link or use the
// admin REST API to sign a session directly. See:
// https://supabase.com/docs/reference/javascript/auth-admin-api
console.log(data)
```

Then export the resulting access token as `E2E_TEST_USER_JWT`. Refresh
the token any time it expires (default JWT TTL is 1 hour — for a
durable CI secret, use a service that mints on demand or extend the TTL
in Supabase Auth settings).

Reference: <https://supabase.com/docs/guides/auth/server-side/creating-a-client>
and <https://supabase.com/docs/reference/javascript/auth-admin-generatelink>.

## Running the suite

```bash
# against the local dev server (in another shell: `npm run dev`)
npm run test:e2e

# interactive UI mode (best for writing/debugging specs)
npm run test:e2e:ui

# open the last HTML report
npm run test:e2e:report

# point at a Vercel preview deployment
E2E_BASE_URL=https://pixflow-ai-git-feature.vercel.app npm run test:e2e
```

## CI integration

### GitHub Actions

Drop this into `.github/workflows/e2e.yml`:

```yaml
name: e2e
on: [pull_request]
jobs:
  playwright:
    runs-on: ubuntu-latest
    timeout-minutes: 12
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: gallery-web/package-lock.json }
      - run: npm ci
        working-directory: gallery-web
      - run: npx playwright install --with-deps chromium
        working-directory: gallery-web
      - run: npm run test:e2e
        working-directory: gallery-web
        env:
          E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
          E2E_TEST_USER_JWT: ${{ secrets.E2E_TEST_USER_JWT }}
          E2E_SUPABASE_PROJECT_REF: ${{ secrets.E2E_SUPABASE_PROJECT_REF }}
          E2E_TEST_GALLERY_ID: ${{ secrets.E2E_TEST_GALLERY_ID }}
          E2E_TEST_GALLERY_WITH_PHOTOS: ${{ secrets.E2E_TEST_GALLERY_WITH_PHOTOS }}
          E2E_PUBLIC_GALLERY_URL: ${{ secrets.E2E_PUBLIC_GALLERY_URL }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: gallery-web/playwright-report/
          retention-days: 7
```

### Vercel preview hook

Use a Vercel deploy hook that pings a small GitHub Action workflow with
the preview URL as input. The action then runs the same `npm run
test:e2e` step above with `E2E_BASE_URL` set to the preview URL. Wire
the action's status back to the PR via the GitHub Checks API.

Reference: <https://vercel.com/docs/deployments/deploy-hooks>.

## Adding a new spec

Skip-if-missing is the contract: every spec that needs a secret must
call the matching `require*()` helper from `tests/e2e/fixtures/` so the
suite is safe to run without creds. Prefer Hebrew text selectors —
the app is RTL Hebrew. Avoid `waitForTimeout`; use `waitForSelector` /
`expect(...).toBeVisible()` so specs stay fast and deterministic.
