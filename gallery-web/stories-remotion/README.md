# Stories Generation — Phase 0 Spike (Remotion + Lambda)

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
