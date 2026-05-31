# Stories Renderer — How It Works

Pixflow's auto-generated Instagram Stories run through a Remotion composition that lays out gallery photos with motion, transitions, and (when a brand kit is configured) intro + outro + watermark surfaces.

Two render paths existed historically:

1. **Desktop** (`src/main/storyRenderer.ts`) — FFmpeg pipeline on the photographer's Mac. Still in use for the local "render now" button in the Electron app.
2. **Cloud** — until 2026-05-31 this was sketched as Remotion + AWS Lambda. **Replaced** by Vercel Functions on 2026-05-31 — see the section at the bottom.

## Composition

`gallery-web/stories-remotion/src/Clean.tsx` is the canonical Remotion composition. It takes:

- `images: string[]` — public Supabase URLs of the photos to feature.
- `durationSeconds: number` — default 30.
- `motionMode: 'none' | 'subtle' | 'dynamic'` — Ken-Burns intensity.
- `brand?: BrandKit` — optional. When present, prepends a 1.5s intro card, appends a 2.0s outro card, and layers a subtle bottom-right watermark across the body.

The composition is registered under id `'Clean'` in `stories-remotion/src/Root.tsx`. New styles (cinematic / fast-social / elegant / vintage) will land as additional compositions and the `COMPOSITION_BY_STYLE` map in `api/stories/render.ts` will switch on them.

## API surface

- `POST /api/stories/render` — auth + ownership + idempotency, then render. Returns `{ ok, status: 'completed', renderId, outputUrl, durationSeconds, fileSizeBytes }`.
- `GET /api/stories/status?renderId=…` — polled by the Dashboard. Promotes a `ready` render to the public `stories` table for the viewer (idempotent — keyed on storage path).

The `story_renders` table (migration 066) tracks one row per render with a partial UNIQUE on `(gallery_id, style) WHERE status IN ('queued','rendering')` so concurrent clicks short-circuit instead of double-billing.

## עדכון 2026-05-31 — עברנו ל-Vercel Functions

We dropped the AWS Lambda path entirely. The motivation is operational: the company is a non-technical owner running on Vercel — adding AWS means a second console, a second billing surface, a second IAM model, and a second deploy pipeline for a feature that already fits inside Vercel's function envelope.

### What changed

- **Renderer:** `gallery-web/api/stories/render.ts` now invokes `@remotion/renderer` + `@sparticuz/chromium` directly inside the Vercel Function. No external invocation, no `renderMediaOnLambda` call, no `lambda_render_id` round-trip.
- **Bundling:** the Remotion site is bundled **once at build time** by `gallery-web/scripts/bundle-stories.mjs` (wired as `prebuild`). Output goes to `public/stories-bundle/`, Vite copies it into `dist/stories-bundle/`, Vercel serves it from the same deployment. The render function points Chromium at `${VERCEL_URL}/stories-bundle/` as its serveUrl.
- **Storage:** the finished mp4 lands at `gallery-stories/{gallery_id}/{render_id}.mp4` via the service-role client. Bucket already exists (migration 007 + defensive re-assertion in 074).
- **Dependencies:** `@remotion/lambda` removed from both `gallery-web/package.json` and `gallery-web/stories-remotion/package.json`. Added `@remotion/renderer`, `@remotion/bundler`, `@sparticuz/chromium`, and pinned `remotion` to the same `^4.0.245` as the renderer.
- **Function config:** `vercel.json` now declares `api/stories/render.ts` at `memory: 3008`, `maxDuration: 300`, `runtime: nodejs22.x`. Chromium needs Node — no edge runtime here.

### What the operator must do post-merge

1. `cd gallery-web && npm install` — installs `@remotion/renderer`, `@remotion/bundler`, `@sparticuz/chromium`, `remotion`; removes `@remotion/lambda`.
2. Trigger a Vercel redeploy (push to `main` does this automatically — main is PR-only and Vercel auto-deploys it).
3. That's it. **No new env vars required.** The renderer reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (already present) and auto-resolves the bundle URL from `VERCEL_URL`.

Optional override: set `STORIES_BUNDLE_URL` if you ever want a render function in one project to load the bundle from a different deployment (useful for hot-swapping the composition without redeploying the API).

### What we lost vs Lambda

- **Hard ceiling of ~100s of output video.** The 300s `maxDuration` minus Chromium cold-start + mux overhead caps the practical output. Every shipping style today is 20-35s, so we're fine. If we ever want >2-minute stories, they move to Workflow DevKit (`DurableAgent`) instead of this synchronous path.
- **Per-render parallelism is bounded by Vercel's concurrent invocation limit**, not by our own Lambda concurrency quota. In practice this is fine for the current "one photographer clicks a button" usage; if we ever batch-render dozens at once, revisit.

### What the user sees

The Dashboard toast no longer shows infrastructure errors. The error-code → Hebrew copy map in `gallery-web/src/lib/storyRender.ts::localizeRenderError` translates `renderer_not_ready` / `render_failed` / `server_misconfigured` into user-safe Hebrew strings ("ייצור סטורי לא זמין כרגע, נסי שוב בעוד דקה" / etc.).
