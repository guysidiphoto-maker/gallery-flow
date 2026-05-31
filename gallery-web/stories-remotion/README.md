# Stories Generation — Phase 0 Spike (Remotion + Lambda)

> **DEPRECATED 2026-05-31 — the AWS Lambda path was dropped.** The production
> renderer now runs inside Vercel Functions using `@remotion/renderer` +
> `@sparticuz/chromium`. See `docs/STORIES_LAMBDA_EXPLAINED.md` (bottom
> section). Sections below referencing `@remotion/lambda`, `renderMediaOnLambda`,
> `REMOTION_LAMBDA_FUNCTION_NAME` etc. are historical and no longer apply —
> the spike workspace itself remains useful for local rendering via
> `npm run render:gallery`.

This directory is a **scaffold-only spike**. It is NOT production code, NOT
wired into the Dashboard, and NOT installed by `gallery-web`'s root
`package.json`. Its job is to prove (or disprove) that we can replace the
desktop Electron + FFmpeg story renderer with a serverless React (Remotion)
pipeline before we commit to the full Phase 1 rewrite.

---

## What this spike IS

- A Remotion v4 React composition that reproduces the desktop "clean" style:
  - 1080×1920 vertical
  - 30 FPS
  - Ken Burns motion (zoom-in / zoom-out / pan-left / pan-right / drift-up / drift-down)
  - Soft crossfade transitions between scenes
  - Orientation-based scene grouping (portrait = solo, landscape = 1 / 2 / 3 stacked)
- A local Node render script (`src/render-local.ts`) that takes a gallery id,
  downloads images, renders the mp4 with the Remotion CLI, and uploads the
  result back to Supabase Storage at the existing path
  `{slug}/{galleryId}/story_clean.mp4`.
- A parity table (`NOTES_ON_FFMPEG_PARITY.md`) mapping each desktop motion /
  transition primitive to its Remotion equivalent, with any visual gaps
  flagged.

## What this spike is NOT

- No Lambda deploy is run — only documented (see "Lambda path" below).
- No Dashboard UI button, no API route, no Workflow DevKit integration yet.
- No quality A/B harness — manual visual comparison is the success bar.
- Other styles (`vintage`, `fast-social`, branded outro, scroll) are out of
  scope. Only `clean` is implemented.
- Does not need to integrate with `vite build`. The directory only needs to
  type-check on its own (`tsc --noEmit -p tsconfig.json`).

---

## Tech stack

| Concern             | Choice                                                                 |
|---------------------|------------------------------------------------------------------------|
| Composition         | React + Remotion v4                                                    |
| Local render        | `remotion render` CLI (Chromium headless, single host)                 |
| Cloud render        | Remotion Lambda (one warm function per render, S3-backed)              |
| Orchestration       | Vercel Workflow DevKit (`DurableAgent`) — deferred to Phase 1          |
| Storage             | Supabase Storage bucket `galleries`, path `{slug}/{galleryId}/story_clean.mp4` |
| Asset access        | Public Supabase URLs via `https://…/storage/v1/object/public/…`        |

Remotion Lambda was picked over FFmpeg-on-Vercel because:

1. Vercel Functions have a 15-min wall-clock cap and no native FFmpeg —
   piping a 30s 1080p video through `ffmpeg-static` would be slow, cold-
   starty, and constantly OOM at 1024 MB.
2. Remotion Lambda chunks the render across many parallel Lambdas (50 by
   default), so a 30s clip finishes in 30–60s wall-clock.
3. We keep React-defined motion, which means the same composition can
   preview in-browser (Remotion Studio) AND render the final mp4 with the
   exact same code — that is the whole point of using Remotion.

---

## Local render (for the spike's quality A/B)

```bash
cd gallery-web/stories-remotion
npm install            # pulls Remotion, @remotion/lambda, @remotion/cli
npm run studio         # opens Remotion Studio at http://localhost:3000
                       # → pick the Clean composition → drop test images in
                       # → tweak motion live, then "Render Video" to MP4
```

To render a real gallery to mp4 from the CLI:

```bash
# 1. Drop sample images into ./fixtures/sample-gallery/
#    (or set --image-dir to any folder of jpegs)
npm run render:local -- --image-dir=./fixtures/sample-gallery --duration=30 --out=./out/clean.mp4
```

To pull, render, and re-upload a real Supabase gallery (one-shot, idempotent):

```bash
# Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars
npm run render:gallery -- --gallery-id=<uuid> --slug=<slug> --duration=30
```

The script writes the mp4 to a temp dir, then PUTs it to
`galleries/{slug}/{galleryId}/story_clean.mp4` with `Cache-Control: public,
max-age=31536000, immutable`. Existing object at that path is overwritten.

---

## Lambda render (production target, NOT executed in this spike)

```bash
# One-time setup (requires AWS credentials with Lambda + S3 perms):
npx remotion lambda policies user           # paste into IAM user policy
npx remotion lambda policies role           # paste into Lambda exec role
export AWS_ACCESS_KEY_ID=…
export AWS_SECRET_ACCESS_KEY=…
export REMOTION_AWS_REGION=us-east-1

# Build & deploy the bundle to S3 (returns a `serveUrl`):
npm run lambda:deploy

# Deploy the Lambda function itself (returns a `functionName`):
npm run lambda:deploy-function

# Trigger a render:
npm run lambda:render -- --serve-url=<url> --function=<name> --image-dir=./fixtures/sample-gallery
```

Expected per-render cost on Lambda (us-east-1, 30s 1080×1920 @ 30fps,
default 50 concurrency, 2048 MB memory):

| Component         | Approx cost     |
|-------------------|-----------------|
| Lambda compute    | $0.04 – $0.15   |
| S3 (asset + mp4)  | $0.005          |
| Data transfer     | $0.005          |
| **Total / render**| **$0.05 – $0.20** |

That assumes the Supabase images are publicly readable so Lambda fetches
them straight from the Smart CDN (no per-Lambda Supabase auth churn).

---

## Success bar for this spike

The spike is "successful" if **all** of these are true once Phase 1
implements the actual render:

1. A 30-second clip at 1080×1920 from 12 sample photos renders in **under
   2 minutes** on a developer M-series Mac via the local CLI path.
2. Motion vocabulary visually matches the desktop "clean" output (no
   jittery zoom — see "sub-pixel" note in `NOTES_ON_FFMPEG_PARITY.md`).
3. Soft crossfades feel as smooth as the FFmpeg `xfade=fade` transitions.
4. Lambda dry-run cost estimate (from `remotion lambda render --print-cost`)
   stays inside the $0.05–$0.20 envelope.

If any of those fail, fall back to the FFmpeg-on-Sandbox path (Vercel
Sandbox + `ffmpeg-static`) before committing to a serverless rewrite.

---

## Next step (Phase 1, not in this PR)

1. Wire a Vercel API route (`gallery-web/api/render-story.ts`) that takes
   `{ galleryId, slug }`, kicks off a `DurableAgent` workflow, and returns
   a `runId` for polling.
2. The workflow triggers `renderMediaOnLambda` from `@remotion/lambda/client`
   and waits on the returned progress, streaming percent back to the client.
3. Add a "Generate Story" button to the Dashboard that hits the route.
4. Quality A/B harness: render the same 12-photo gallery via the desktop
   path AND the Remotion path, post side-by-side mp4s into a private QA
   bucket for review.

See `NOTES_ON_FFMPEG_PARITY.md` for the per-effect parity table and known
visual gaps.

---

## Phase 1 — Wiring (this PR)

Phase 1 connects the Dashboard to a stubbed render endpoint so the photographer
flow ("click → choose style → see toast → story appears") is exercised end-to-end
**without** actually invoking Remotion Lambda. The render itself is still
deferred to Phase 2.

### What shipped

- **Dashboard CTA — `gallery-web/src/pages/Dashboard.tsx`**
  - New button **"צור סטורי אוטומטית"** appears in the editor's *Stories* tab
    next to the existing **"העלאת סטורי"** (manual upload).
  - Gated on `galleryImages.length >= STORY_GENERATE_MIN_PHOTOS` (currently 12).
    Below that, only the manual upload is visible — auto-rendering 4-photo
    galleries produces a slideshow, not a story.
  - Click opens a small style picker modal (focus-trapped, ESC/backdrop to
    dismiss). Phase 1 has only **clean** as an option; Phase 2 will add
    `vintage`, `fast-social`, etc. as those compositions land.
  - Confirm → calls `requestStoryGeneration(galleryId, style)` from
    `gallery-web/src/lib/storyRender.ts`.
  - Toasts via the existing `useToast` hook (`gallery-web/src/components/Toast.tsx`):
    - **In-flight**: `מייצר סטורי — זה ייקח דקה או שתיים` (info)
    - **Success**: `הסטורי נשלח לעיבוד · <server message>` (success)
    - **Failure**: `יצירת הסטורי נכשלה: <error>` (error)
  - **The manual upload is untouched** — it remains the escape hatch for
    photographers who want a hand-edited clip.

- **Helper — `gallery-web/src/lib/storyRender.ts`**
  - `requestStoryGeneration(galleryId, style)` POSTs `/api/stories/render`
    with the caller's Supabase access token. Normalizes the server response
    so the Dashboard JSX just branches on `result.ok`.

- **Endpoint scaffold — `gallery-web/api/stories/render.ts`**
  - `POST { galleryId: string, style: 'clean' }`.
  - Validates `galleryId` (UUID shape) and `style` (enum).
  - Auth: extracts the Bearer token, calls `supabase.auth.getUser`, then
    service-role reads the gallery row + joined `businesses.user_id` to
    confirm the caller is the owner. Wrong user → `403 not_owner`.
  - On success: returns `{ ok: true, status: 'queued', message: 'Lambda
    integration pending Phase 2' }` (HTTP 200). No render is performed.
  - Includes an inline **`TODO Phase 2`** block describing the cutover.

### What is stubbed vs real (Phase 1)

| Surface                                       | Real / Stubbed |
|-----------------------------------------------|----------------|
| Dashboard CTA, modal, focus trap, toasts      | **Real**       |
| `requestStoryGeneration` helper + fetch       | **Real**       |
| Endpoint input validation + auth/owner check  | **Real**       |
| Endpoint Lambda invocation + mp4 produced     | **Stubbed** — returns `queued`, no work performed |
| `stories` row insertion + storage upload      | **Stubbed** — Dashboard does NOT append to `stories` state on Phase 1 success |
| Progress polling / render status              | **Stubbed** — no polling endpoint yet |

### Phase 2 cutover (explicit steps)

When Phase 2 is ready to replace the stub, edit only
`gallery-web/api/stories/render.ts` — the Dashboard call site and helper
should not need to change.

1. Add a `story_renders` table keyed by `(gallery_id, style)` with
   `status` ∈ {`queued`, `rendering`, `ready`, `failed`}, `render_id`
   (from Remotion Lambda), and `created_at`. Use it to short-circuit
   duplicate POSTs for the same in-flight (gallery, style) pair so the
   photographer can't double-bill themselves by clicking twice.
2. Replace the stubbed success branch with:
   ```ts
   import { renderMediaOnLambda } from '@remotion/lambda/client'
   const { renderId } = await renderMediaOnLambda({
     region: process.env.REMOTION_AWS_REGION!,
     functionName: process.env.REMOTION_LAMBDA_FUNCTION_NAME!,
     serveUrl: process.env.REMOTION_LAMBDA_SERVE_URL!,
     composition: 'Clean',
     inputProps: { galleryId, style },
     codec: 'h264',
     privacy: 'public',
   })
   ```
   `serveUrl` + `functionName` come from `npm run lambda:deploy` +
   `npm run lambda:deploy-function` in this directory (see the "Lambda
   render" section above).
3. After Lambda finishes (either via webhook or polling), upload the
   resulting mp4 to `{slug}/{galleryId}/story_{style}.mp4` and insert the
   `stories` row — this is exactly what `src/render-local.ts` already
   does for the local-CLI path, so the upload helper there can be lifted
   into the function or extracted into a small shared module.
4. Add `/api/stories/status?renderId=…` returning `{ status, progress,
   storage_path }` so the Dashboard can poll and push the new row into
   its local `stories` state when ready (replacing the Phase 1 "we don't
   append on success" behavior).
5. Update the Dashboard's success toast to switch from "נשלח לעיבוד" to a
   progress indicator driven by the status endpoint.

The `gallery-web/stories-remotion/src/render-local.ts` script is the
canonical reference for what the Lambda function body needs to do — same
download/render/upload pipeline, just hosted on Remotion Lambda instead
of a developer Mac.

---

## Phase 2 — Lambda wiring (this PR)

Phase 2 replaces the queued stub in `gallery-web/api/stories/render.ts`
with a real `renderMediaOnLambda` call, adds a sibling
`/api/stories/status` endpoint for Dashboard polling, and persists
in-flight renders in a new `story_renders` table.

The code is fully wired. **Only the AWS-side deploy is left.** An operator
runs the steps below to flip the feature on; there is no further code
change.

### Pre-deploy checklist

- `supabase/migrations/066_story_renders.sql` has been applied (the agent
  ran `apply_migration` against `vlyiqfawkrjvqcmkpfvs`).
- `gallery-web/package.json` declares `@remotion/lambda` but it is NOT
  installed yet — the deploy step below installs it.
- The Dashboard is already wired to start polling every 5s and refresh the
  stories list on completion. No client changes are needed.

### Required Vercel env vars (Production)

The `/api/stories/render` endpoint **fails closed** if any of these are
missing — it returns `{ error: 'lambda_not_configured' }` and does NOT
write a `story_renders` row, so you cannot silently lose a render request.

| Env var                          | Where it comes from                        |
|----------------------------------|--------------------------------------------|
| `REMOTION_LAMBDA_FUNCTION_NAME`  | `npx remotion lambda functions deploy` output |
| `REMOTION_LAMBDA_SERVE_URL`      | `npx remotion lambda sites create` output |
| `AWS_REGION`                     | The region you deployed Lambda into (e.g. `us-east-1`) |
| `AWS_ACCESS_KEY_ID`              | IAM user with the policy from `npx remotion lambda policies user` |
| `AWS_SECRET_ACCESS_KEY`          | Same IAM user secret                       |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already set in
Production for the existing endpoints — reuse them.

### Operator runbook (one-time cutover)

```bash
# 1. Install the spike's deps into the spike directory (Lambda CLI lives here).
cd gallery-web/stories-remotion
npm install

# 2. Install @remotion/lambda inside gallery-web so the Vercel build can
#    bundle it into the /api/stories/render function. Phase 2 added it to
#    gallery-web/package.json but did not install.
cd ..
npm install

# 3. AWS credentials + IAM (one-time per AWS account):
cd stories-remotion
npx remotion lambda policies user           # paste into the IAM user policy
npx remotion lambda policies role           # paste into the Lambda exec role
export AWS_ACCESS_KEY_ID=…
export AWS_SECRET_ACCESS_KEY=…
export REMOTION_AWS_REGION=us-east-1

# 4. Deploy the bundle to S3. Outputs a `serveUrl` — copy it.
npm run lambda:deploy
# → https://remotionlambda-….s3.us-east-1.amazonaws.com/sites/gallery-stories/index.html

# 5. Deploy the Lambda function. Outputs a `functionName` — copy it.
npm run lambda:deploy-function
# → remotion-render-4-0-245-mem2048mb-disk10240mb-240sec

# 6. Set the three env vars in Vercel (Production scope):
vercel env add REMOTION_LAMBDA_SERVE_URL production       # paste serveUrl
vercel env add REMOTION_LAMBDA_FUNCTION_NAME production   # paste functionName
vercel env add AWS_REGION production                      # e.g. us-east-1
vercel env add AWS_ACCESS_KEY_ID production
vercel env add AWS_SECRET_ACCESS_KEY production

# 7. Redeploy production so the new env vars are visible to the function.
#    (Or push a no-op commit if main is the production source.)
vercel --prod
```

### Smoke test

1. Open the Dashboard as a photographer who owns a gallery with ≥12 photos.
2. Switch to the *Stories* tab → click **צור סטורי אוטומטית**.
3. Confirm the style → toast says "מייצר סטורי".
4. Network tab should show:
   - `POST /api/stories/render` → 200 `{ ok: true, status: 'rendering', renderId: '…' }`
   - `GET /api/stories/status?renderId=…` every 5s.
5. After 30–90s the status response flips to `status: 'ready'` with an
   `output_path` populated. The Dashboard toasts "הסטורי מוכן" and the new
   mp4 appears in the stories list.

### Rollback (if Lambda is misbehaving)

Remove `REMOTION_LAMBDA_FUNCTION_NAME` from Vercel env. The endpoint will
fail-closed with `lambda_not_configured`, so photographers see a clear
error toast instead of silently-broken queueing. Code stays untouched.

### Files touched this PR

- `supabase/migrations/066_story_renders.sql` — new table + partial UNIQUE + RLS.
- `gallery-web/api/stories/render.ts` — Lambda call replaces the stub.
- `gallery-web/api/stories/status.ts` — new polling endpoint.
- `gallery-web/src/lib/storyRender.ts` — adds `pollStoryRender` + `renderId`.
- `gallery-web/src/pages/Dashboard.tsx` — starts polling on success, cleans up on unmount.
- `gallery-web/package.json` — declares `@remotion/lambda` dep (install at step 2 above).
