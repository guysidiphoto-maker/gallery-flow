# Story Studio — Deployed Render Verification (render blocker CLOSED)

_2026-08-10 · isolated QA · synthetic data only_

## Environment
- **Branch:** `feat/story-studio-revival` · commit `9ae76e5` (local; **not pushed**, PR not updated — per instruction).
- **Deployment:** `pixflow-story-studio-qa` (`prj_KFifYyAvWc8aUDnF8zqvmok1xScE`), preview target, Node **24.x**, behind Deployment Protection. Reached for QA via a Vercel-issued ephemeral share link (not the persistent bypass secret). Latest verified deploy: `pixflow-story-studio-kt4yd72ck-…vercel.app` (`dpl_yY12RHbv5sh8u4vmQbSZn98jMFxi`).
- **DB:** `pixflow-cpv2-qa2` (`icxitoczqtcgdkwiaxxc`), synthetic. 3 galleries (wedding/corporate/concert), 16 images each, owner `studioa.owner@example.com`.

## Root cause (runtime) + fix
- **Runtime verdict (researched against current docs):** `@sparticuz/chromium` **149.0.0** (Chromium 149) Chrome-major-matches Remotion **4.0.469**'s tested Chrome 149; its Node engine floor `^22.17 || >=24` means **Node 20 is not achievable** with Chromium 149. So **Node 24.x + chromium 149** is the correct, minimal, documented fix — no dependency change needed (already pinned in package.json + lockfile). Node pinned in-repo via `.nvmrc` + `engines`.
- **The only regression found this pass:** stripping the Remotion bundle's `*.map` files (a size optimization) broke the render — Remotion serves the bundle from a local dir and its static server throws `ENOENT` (not a soft 404) on a referenced missing `bundle.js.map`. Reverted; keep the maps.

## Acceptance renders (3 galleries × auto + edited) — all on the deployed server
`ffprobe` via Remotion's bundled compositor binaries. All **1080×1920, H.264**, silent AAC track (Remotion default). Duration drift vs scene-plan ≤ 0.13s.

| Job | Template | Scenes | Plan → Actual | Drift | Size | Render wall |
|---|---|---|---|---|---|---|
| wedding-auto | editorial-clean | 16 | 34.49 → 34.62s | +0.13 | 3.46 MB | 185s |
| wedding-edit | editorial-clean | 16 | 36.72 → 36.84s | +0.12 | 3.68 MB | 194s |
| corporate-auto | cinematic-energy | 16 | 29.96 → 30.02s | +0.06 | 12.71 MB | 208s |
| corporate-edit | cinematic-energy | 16 | 32.48 → 32.55s | +0.07 | 12.56 MB | 219s |
| concert-auto | fast-highlights | 16 | 23.68 → 23.68s | 0.00 | 1.97 MB | 111s |
| concert-edit | fast-highlights | 16 | 26.64 → 26.65s | +0.01 | 2.12 MB | 121s |

Output paths: `gallery-stories/{gallery_id}/{render_id}.mp4` (+ `.jpg` poster). Render IDs:
ad289278 / 76837d73 (wedding), 21e6c1b5 / 13c4f66f (corporate), b78e3be2 / 346c2184 (concert).

## Visual QA (frames extracted from the deployed MP4s)
- **Editorial** — clean full-bleed; centered-serif opening card "Dana & Tom / 1 JUN 2026 · TEL AVIV"; watermark.
- **Cinematic** — 2.4:1 letterbox bars + heavy vignette; uppercase-left outro card "QA STUDIO A".
- **Fast** — reel-style segmented progress bars (top), no letterbox.
- **Edit proof** — "EDITED CUT" caption renders in the edited export (preview==export), and the edit shifted duration (34.62 → 36.84s). Reorder + duration + transition + focal + caption all applied server-side.
- No black frames, no missing images, outro complete on every clip.
- **Caveat:** the synthetic seed images are solid-gradient PNGs (no faces), so face-aware crop coherence cannot be visually judged here (no real customer photos allowed). That logic is covered by unit tests.

## Lifecycle (verified live on the deployed server)
- **Duplicate protection:** a 2nd render while one is in-flight → `render_in_progress` (returns the in-flight id); no duplicate active job.
- **Cooperative cancel:** `POST /api/stories/cancel` → `{cancelled:true}`; the running render then completed as `render_cancelled`, did **not** promote to ready (idempotent), and **dropped its uploaded artifacts** (cancelled mp4 → HTTP 400, no orphan).
- **Stale reap:** a gateway-504 job left a `rendering` row; reaped (also covered by the `/api/stories/sweep-stale` cron every 15m). Final state: **0 stuck in-flight rows**.
- **Retry after failure:** failed rows never block a new render.
- **Concurrency limit found:** 3 simultaneous renders OOM Chromium ("ran out of memory… decrease concurrency"). Renders must run **one at a time** per container — consistent with the 1-active-per-(gallery,style) lock and the queue/Lambda recommendation for scale.

## Security (verified live)
- No auth → **401**; valid auth + foreign renderId → **404**; foreign imageId in plan → **400 invalid_scene_plan** (tenant isolation live); 21-scene plan → **400 story_too_long** (cap enforced before any row/render).
- Error responses return stable codes only — no filesystem paths / stack traces / secrets (raw detail logged + persisted server-side).

## Regression
39 unit tests pass (incl. new `renderContract.test.ts`: runtime/package-compat, guard-in-sync, single-Chromium+browserExecutable, lifecycle contract, scene-plan→duration). `tsc` clean. Production build + stories bundle OK.

## GO / NO-GO
- **Draft PR:** ✅ **GO** — real MP4 rendering succeeds on the isolated Vercel deployment and all six outputs (3 templates × auto/edit) pass technical + visual QA; lifecycle + security verified live. (Not opened/updated yet, per instruction.)
- **Production:** ⛔ still NO-GO under this task (no prod deploy / no prod migration).

## Cleanup owed (synthetic QA)
Revoke the Vercel Protection-Bypass token; drop temp qa2 storage policies `qa_seed_gallery_images_*`; the seeded galleries `…0002/0003`, test render rows, and MP4/poster objects are disposable.
