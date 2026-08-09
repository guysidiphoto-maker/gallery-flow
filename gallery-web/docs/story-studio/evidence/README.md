# Story Studio — Template Differentiation Evidence

_Rendered locally from the canonical `StoryStudioVideo` composition (the exact
one the server renders) via `scripts/story-evidence.mts`. Photos are **stock
(picsum)**, not customer data — this proves TEMPLATE differentiation, which is
image-agnostic. Regenerate: `node --experimental-strip-types scripts/story-evidence.mts`._

Same 16-photo gallery + same Brand Kit + same event ("Dana & Tom · 20 Jun 2026 ·
Caesarea") through all three templates. Only the template changes.

## Measured differences (same input, three templates)

| Template | Scenes | Duration | Pace (per scene) | Motion | Transitions | Frame treatment |
|---|---|---|---|---|---|---|
| **editorial-clean** | 16 | **34.4s** | slow (~3.8s) | subtle push-in / lots of stillness | slow cross-dissolve + soft-blur, **never cuts** | clean full-bleed |
| **cinematic-energy** | 16 | **29.8s** | medium (~2.8s) | **strong pans** + push-ins | dramatic light-leak + dissolve | **2.4:1 letterbox + heavy vignette** |
| **fast-highlights** | 16 | **23.6s** | fast (~1.35s) | **snap punch-ins** | **hard cuts** + whip | **reel-style segmented progress bars** |

The ~11s runtime spread from an identical gallery is the pacing difference made
real (a per-template `targetMult` stops `fitToTarget` from flattening every
template to the same length). This is locked by a regression test
(`planner.test.ts` → "templates are categorically different …").

## Frames

Six representative JPEGs per template (540×960, opening → closing):
`{template}__01-opening … 06-closing.jpg`. The `__04-mid.jpg` trio is the
clearest side-by-side — clean vs letterbox+vignette vs progress-bars.

Full plans used: `plan-editorial-clean.json`, `plan-cinematic-energy.json`,
`plan-fast-highlights.json` (inspect scene durations / motion / transitions).

## Full MP4s

Rendered to `/tmp/story-evidence/{editorial-clean,cinematic-energy,fast-highlights}.mp4`
(kept out of the repo to avoid binary bloat):
- editorial-clean.mp4 — 20.2 MB, 34.4s
- cinematic-energy.mp4 — 17.1 MB, 29.8s
- fast-highlights.mp4 — 14.5 MB, 23.6s

All 1080×1920 H.264. To view: `open /tmp/story-evidence/cinematic-energy.mp4`.

> Note: these local MP4s use stock photos and system Chrome. The deployed QA
> pipeline (`@sparticuz/chromium` on Vercel) previously produced real-photo MP4s
> from the same composition; re-running that deployed pass needs the QA env's
> Protection-Bypass token re-added (it was scheduled for revocation).
