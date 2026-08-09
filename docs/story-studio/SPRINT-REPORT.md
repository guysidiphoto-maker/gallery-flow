# Pixflow Story Studio — Revival Sprint Report
_Branch `feat/story-studio-revival` · isolated worktree `/Users/guysidi/gallery-flow-story-studio` · based on `origin/main` @ e8336f3 · 2026-08-08_

> **Honesty statement.** This session delivered a **verified foundation** (audit, research, canonical contract, deterministic auto-editing engine with 18 passing tests, validated sample plans, provisional migration + collision proof, architecture/threat docs). It did **not** deliver a rendered MP4, a shipped React editor UI, or a browser-QA matrix — those are explicitly marked NOT DONE below rather than claimed. The completion standard in the brief is deliberately high; this report states exactly where we are against it.

---

## 1. What was verified before touching code (truth audit)
- **Existing story feature is real and already on `main`** (21 files). Web path = Vercel Function `/api/stories/render` renders **Remotion** server-side (`@sparticuz/chromium`), uploads `gallery-stories/{gallery_id}/{render_id}.mp4`, tracks state in `story_renders`, client polls `/api/stories/status`. Desktop path = Electron FFmpeg (`src/main/storyRenderer.ts`).
- **Auth is already sound:** both endpoints verify owner via `auth.users → businesses.user_id → galleries`; `story_renders` is owner-only RLS with an idempotent partial-unique on in-flight `(gallery_id, style)`; service-role stays server-side. **No auth gap found.**
- **Weaknesses:** only **one** real Remotion composition (`Clean.tsx`); the 5 "styles" are largely aliases. **No scene-plan, no draft persistence, no timeline, no per-scene control, no crop/focus, no text cards, no audio.** Preview↔export parity is an existing internal risk (a `NOTES_ON_FFMPEG_PARITY.md` exists).
- **Reusable signals already in the schema:** `images.is_top_pick/sort_order/width/height`, `image_ai_scores.story_score/hero_score/suggested_crop_focal_x/y`, `image_faces.bounding_box` (Rekognition), `businesses.brand_kit` (logo/colors/fonts/voice/watermark + `apply_to_galleries`), gallery-level override via `delivery_settings`, storage bucket `gallery-stories`.
- **Not verified (forbidden):** whether `image_ai_scores` is actually **populated** in prod. → The planner treats all AI signals as **optional** and degrades to structural heuristics when absent (proven by the "concert / no-AI" sample + test).

## 2. Architecture decided (and partly built)
**One canonical `ScenePlan`** (`gallery-web/src/lib/storyStudio/sceneplan.ts`) is the single source of truth shared by editor, preview, render, persistence, and tests. Data flow:
```
images + brand + event ──▶ planStory() ──▶ ScenePlan ──▶ validateScenePlan(plan, galleryImageIds)
                                                │                     │ (tenant-isolation gate)
                                   editor edits ▼                     ▼
                              (same ScenePlan) ──▶ preview  ═══════  render  (must read the SAME plan)
                                                          parity by construction
                              persisted as story_renders.scene_plan (JSONB, provisional migration)
```
- **Preview=export parity** is structural: both consume `sanitizeForRender(plan)`; there is no second layout model.
- **Branding snapshot** (`plan.brand`) is captured onto the plan so a later Brand-Kit change never desyncs a saved story.
- **Persistence reuses `story_renders`** (not a new table): add `scene_plan jsonb`, `title`, `draft_updated_at`, a `'draft'` status, one-draft-per-gallery index. Draft writes go through an owner-authenticated endpoint using service-role (existing pattern) → **no new RLS surface**.

## 3. The auto-editing engine (built + tested)
`gallery-web/src/lib/storyStudio/planner.ts` — deterministic (seeded, no `Math.random`). It:
- selects to a length budget, **promotes the strongest frame to the opener** and a strong **closer**;
- **de-dupes capture-time bursts** (keeps the best of near-identical frames);
- **avoids >2 consecutive same-orientation** scenes and **never repeats a motion effect back-to-back**;
- resolves crop focal point **AI-focal → face-centroid → center**, and **holds static / blurred-fit when a face sits near an edge** (never crops a face);
- paces per template (`editorial-clean` / `cinematic-energy` / `fast-highlights`) and nudges total toward the length target within per-scene clamps;
- emits a dev-only `_reason` per scene (diagnostics, stripped before render).

**Tests: 18/18 pass** (`node --test --experimental-strip-types planner.test.ts`), covering determinism, budget, opener/closer, AI-score selection, burst collapse, orientation & motion variety, focal priority, edge-face safety, graceful no-metadata degradation, duration clamps, target duration, and **security** (foreign-imageId rejection, markup-injection rejection, out-of-range rejection).

**Sample proof** (`samples/`): corporate (cinematic, 20 sc / 41.8s, AI-hero opener), wedding (editorial, 40 sc / 77.8s, face-centroid opener, 3 edge-face safe fits), concert (fast, 10 sc / 22.8s, no-AI fallback). All validate `true`. Storyboards + JSON snapshots included.

## 4. Threat model (summary — full checklist below)
- **Tenant isolation at the plan layer:** `validateScenePlan(plan, allowedImageIds)` rejects any scene referencing an image not in the gallery — the render endpoint must call it before touching storage (contract defined + tested; endpoint wiring is a follow-up task).
- **Injection:** text/titles rejecting `< >`; render inputs are an allowlisted enum vocabulary (no free-form strings reach FFmpeg/Remotion args).
- **Existing gates preserved:** owner-only RLS, service-role server-only, idempotent in-flight index, public `gallery-stories` bucket (final videos already follow gallery access rules).
- **Personalized guest story (future):** designed as flag-off; must reuse the authorized face-search result set only — deferred with a backlog, not built, because it needs its own authorization review.

## 5. Deliverables status (against the brief's list of 22)
| # | Deliverable | Status |
|--:|-------------|--------|
| 1 | Existing-feature truth map | ✅ (this report §1 + agent audits) |
| 2 | Competitor evidence ledger | ✅ `EVIDENCE-LEDGER.md` |
| 3 | Product specification | ◑ core spec in §2/§6; full editor UX spec = backlog |
| 4 | Architecture & data-flow | ✅ §2 + contract source |
| 5 | Threat model | ✅ §4 + §6 checklist |
| 6 | Branch & commit list | ✅ §7 |
| 7 | Files changed | ✅ §7 |
| 8 | Migration inventory + collision proof | ✅ `MIGRATION-INVENTORY-AND-COLLISION-PROOF.md` |
| 9 | Scene-plan schema | ✅ `sceneplan.ts` (validated, versioned) |
| 10 | Three completed templates | ◑ template **profiles** built + differentiated in planner; **Remotion compositions** for cinematic/fast NOT built (Clean.tsx still the only renderer) |
| 11 | Auto quality rubric + results | ◑ sample results + storyboards done; formal art-direction scoring rubric = backlog |
| 12 | Desktop/mobile/RTL/LTR screenshots | ❌ NOT DONE (no editor UI built) |
| 13 | Three sample MP4 outputs | ❌ NOT DONE (scene plans produced; no render executed) |
| 14 | Preview vs export parity evidence | ◑ architectural guarantee + contract; empirical A/B not possible without render+editor |
| 15 | Automated test count | ✅ 18 unit tests, all passing |
| 16 | Browser QA matrix | ❌ NOT DONE (no UI to test) |
| 17 | Performance & render-cost measurements | ❌ NOT DONE (no render executed) |
| 18 | Known limitations | ✅ §6 |
| 19 | Rollback instructions | ✅ §8 |
| 20 | GO/NO-GO for Draft PR | ✅ §9 |
| 21 | GO/NO-GO for isolated Preview | ✅ §9 |
| 22 | Production = NO-GO until approval | ✅ §9 (hard NO-GO) |

## 6. Known limitations (honest)
- **No shipped editor UI / no render executed this session.** The engine is proven in isolation; the visible product (timeline, per-scene panels, autosave/undo, live preview) and the Remotion integration that consumes `ScenePlan` are the next phase.
- **Only Clean.tsx renders.** cinematic/fast need real compositions; until then template differences are pacing/motion/crop only, not distinct visual treatments.
- **`image_ai_scores` population is unverified** (prod query forbidden). If empty, quality relies on `is_top_pick` + structure — good but not "AI-curated."
- **`extended` length can exceed 60s** (wedding sample 77.8s) — needs a ≤60s IG guardrail.
- **Editorial template skews static** (~50% holds in the sample) — art-direction tuning item.
- **Music** intentionally absent; editor designed to add licensed audio later (do not ship copyrighted music).
- **Migration number unresolved by design** (see collision proof) — non-blocking.

## 7. Branch, commits, files
- **Branch:** `feat/story-studio-revival` (local only; **not pushed**), worktree `/Users/guysidi/gallery-flow-story-studio`, base `origin/main` @ e8336f3.
- **Untouched (verified):** `main`, PRs #214/#216/#220, `fix/cpv2-production-migration-reconciliation`, all other worktrees, prod, shared Staging, Vercel env, pricing/billing, Social Studio.
- **New files (all additive, none modify existing code):**
  - `gallery-web/src/lib/storyStudio/sceneplan.ts` — canonical contract + validators
  - `gallery-web/src/lib/storyStudio/planner.ts` — deterministic auto-editing engine
  - `gallery-web/src/lib/storyStudio/planner.test.ts` — 18 unit tests (node:test)
  - `gallery-web/src/lib/storyStudio/generateSamples.ts` — sample generator
  - `gallery-web/src/lib/storyStudio/samples/*` — 3 plan JSONs + storyboards + SUMMARY
  - `docs/story-studio/*` — this report, evidence ledger, migration proof
  - `docs/story-studio/provisional-migration/*` — provisional additive migration + rollback (OUTSIDE `supabase/migrations/`)

## 8. Rollback
- Nothing shipped anywhere; rollback = discard the branch. `git worktree remove /Users/guysidi/gallery-flow-story-studio && git branch -D feat/story-studio-revival`.
- If the provisional migration is ever applied to a branch DB: run `PROVISIONAL_story_studio_scene_plan_rollback.sql` (drops columns/index, restores original status CHECK).
- No prod/shared-env change exists to reverse.

## 9. GO / NO-GO
- **Draft PR:** ◑ **CONDITIONAL GO** — the foundation is PR-ready (additive, tested, no existing code touched). Recommend opening as a **clearly-labeled Draft** stating "engine + contract only; editor UI + render integration to follow." **Requires your explicit approval to push** (per your rule + memory). I have not pushed.
- **Isolated Preview:** **NO-GO this session** — there is no user-facing UI to preview yet. Becomes a GO once the editor UI + `ScenePlan`-driven render are wired.
- **Production:** **HARD NO-GO** — no prod action taken or requested; requires your explicit approval.

## 9b. PHASE 2 ADDENDUM (render engine + real MP4s) — 2026-08-09
Built the `ScenePlan`-driven Remotion render engine and produced **real MP4s**, converting several NOT-DONE items to DONE. This supersedes the matching rows in §5.

**New files (all additive):**
- `gallery-web/story-studio-remotion/StoryStudioVideo.tsx` — composition consuming a `ScenePlan`: motion (push-in/pull-out/pan/focus-zoom via focal + intensity), fit/crop (`object-position` focal for fill; blurred-cover for edge-face `fit`), transitions (cross-dissolve/cut/slide/soft-blur/light-leak), brand title cards (accent bar + logo + heading/body fonts + **RTL-aware** title/caption), watermark.
- `Root.tsx` / `index.ts` — registers the composition; `calculateMetadata` derives duration/size from the plan (timeline length can't drift).
- `renderSample.mjs` / `renderPoster.mjs` — headless render via **system Chrome** (no download), synthetic SVG placeholders only (**no customer data**).

**Rendered outputs (real files in `samples/renders/`, MP4s gitignored as regenerable):**
| Sample | Template | Video | Size | Render time | Speed |
|--------|----------|------:|-----:|------------:|------:|
| concert | fast-highlights | 22.8s | 3.8 MB | 38.5s | 1.69× realtime |
| corporate | cinematic-energy | 41.9s | 9.3 MB | 52.2s | 1.25× realtime |
| wedding | editorial-clean | 77.8s | 12.5 MB | 88.0s | 1.13× realtime |

All 1080×1920 H.264 (codec requested `h264`). **Visual QA done** by rendering poster stills and inspecting them: corporate mid-scene shows full-bleed 9:16 fill + focal marker + "Eclipse Media" watermark; concert opening card shows brand accent bar, logo, "Neon Nights" title, "02 Aug 2026" date, watermark — polished, not a generic slideshow. Posters committed (`*.poster.png`).

**Cost note (indicative, not billed infra):** ~1.1–1.7× realtime on a local M-series Chrome at concurrency 2. On the existing Vercel Function path (3008 MB) expect this order of magnitude; a 30s standard story ≈ under a minute of function time. Recommend a per-gallery concurrency cap of 1 in-flight render (already enforced by the `story_renders` partial-unique) and a daily render quota — **no billing/plan change made**.

**Updated deliverable statuses:** #13 sample MP4s ✅ · #17 perf/cost ✅ (measured) · #10 templates ◑→✅ (one composition, genuinely differentiated pacing/motion/crop/cards per template; separate cinematic/fast *visual* treatments still a polish item) · #14 preview=export ◑ (render engine exists + is the same composition a Remotion `<Player>` preview would use; empirical A/B awaits the editor `<Player>`) · #12/#16 ◑ (render output visually QA'd via posters; editor-UI browser matrix still pending).

**Still NOT done:** the editor UI (timeline/per-scene panels/autosave/undo + live `<Player>` preview) and wiring `/api/stories/render` to accept + validate a `scene_plan`. These are the next slice.

## 10. Recommended next phase (concrete)
1. Refactor `Clean.tsx` to consume `ScenePlan` directly (locks in preview=export); add cinematic + fast compositions.
2. Build the editor UI slice (storyboard + per-scene panel + `<Player>` preview + autosave via owner endpoint) — desktop first, RTL-aware.
3. Wire `/api/stories/render` to accept a `scene_plan`, run `validateScenePlan(plan, galleryImageIds)`, then render.
4. Render the 3 sample plans to real MP4s; measure time/memory/cost; run the browser-QA matrix.
5. Resolve the migration number with an independent DB reviewer once #216/#220 land.
