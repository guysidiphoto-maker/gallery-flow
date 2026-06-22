// Post-build step for homepage SSR.
//
// Vercel serves a static file for "/" (the built dist/index.html) BEFORE
// applying rewrites, so the "/" → /api/page SSR rewrite never fires and the
// homepage ships as the generic static shell. Renaming the built shell to
// dist/app.html removes the static match for "/", so the rewrite takes effect
// and the homepage is server-rendered. All SPA-fallback routes (catch-all) and
// the gallery/share bootstraps reference /app.html instead.
//
// GUARDED: if the shell is missing before or after the rename, the build fails
// (non-zero exit) so a broken state — which would 404 the whole SPA — can never
// deploy.

import { existsSync, renameSync } from 'node:fs'

const SRC = 'dist/index.html'
const DST = 'dist/app.html'

if (!existsSync(SRC)) {
  console.error(`[rename-shell] FATAL: ${SRC} not found — aborting build so a broken SPA shell can't deploy.`)
  process.exit(1)
}

renameSync(SRC, DST)

if (existsSync(SRC) || !existsSync(DST)) {
  console.error(`[rename-shell] FATAL: rename did not produce ${DST} cleanly — aborting build.`)
  process.exit(1)
}

console.log('[rename-shell] dist/index.html → dist/app.html ✅ (homepage "/" now SSR via api/page)')
