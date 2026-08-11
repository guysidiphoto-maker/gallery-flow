# Pixflow Story Studio — V1 Completion Report

_2026-08-10 · isolated QA · synthetic / openly-licensed assets only_

## 1. Exact tested commit
Branch `feat/story-studio-revival` @ **`5850c89`** (final code) — creative cycle-2 fix.
(Earlier this session: d2c59a9 Music V1, 3d4fc5f creative cycle 1, 5850c89 cycle 2.)

## 2. QA deployment identity
- Vercel project **pixflow-story-studio-qa** (`prj_KFifYyAvWc8aUDnF8zqvmok1xScE`), Node 24.x, preview target, Deployment Protection ON (reached via Vercel-issued ephemeral share link, not a persistent secret).
- Final deployment `dpl_Gj28qyozYfw4ZMbxgS2PTogT5Grx` (`…-19r7cp6vv…`).
- DB **pixflow-cpv2-qa2** (`icxitoczqtcgdkwiaxxc`), synthetic. 3 galleries (wedding/corporate/concert), 15 real openly-licensed photos each (Lorem Picsum → Unsplash License, free commercial use), owner `studioa.owner@example.com`.

## 3. Final feature inventory (what shipped in V1)
- **Music V1** — 3 bundled, license-clean tracks (synthesized in-repo), track select / no-music / volume / fade-in / fade-out; `<Audio>` in the composition via `staticFile` (no external fetch, no SSRF); allow-listed track ids; `muted:true` render when no music (no misleading silent track). Preview==export. Proven on the deployed render (non-silent AAC, peak 30496).
- **Editor completeness** — intro/outro card editing (title/date/outro toggle/logo), add-photo from gallery, keyboard reorder + a11y, per-scene reset, caption position, honest save/saving/**failed** status, duplicate-id fix. (All browser-verified.)
- **Automatic-edit engine (deterministic, improved)** — strong opener/closer, burst-dedup, orientation interleave, **rule-of-thirds face-safe focal**, **per-scene motion-intensity variation** + seeded motion/transition variation (no mechanical loops), template-driven pace, **image-hook title cards** (darkened hero photo behind the title), lighter cinematic vignette.
- **Three distinct templates** (unanimously judged genuinely distinct, not recolors): Editorial (clean, slow, dissolves), Cinematic (letterbox+vignette, pans, light-leaks), Fast (reel progress bars, punch-ins, hard cuts+whips).
- **Render + lifecycle** — synchronous Vercel render (chromium 149 + Node 24), poster, stale-reap + cron, cooperative cancel, idempotent completion, 18-scene/45s first-release cap.

## 4. Realistic creative validation (3 packs, real MP4s on the deployed server)
All 1080×1920 H.264, plan-matched durations (ffprobe-verified).

| Pack | Template | Final render (gallery/id.mp4) | Dur |
|---|---|---|---|
| Wedding | Editorial | `dddddddd-…0001/ffe6c9b6-e485-4936-b284-49a5fe87ab9f.mp4` (rendered via the real Launcher UI, cycle-2) | 36.3s |
| Corporate | Cinematic | `dddddddd-…0002/4b4a777e-f40a-4765-825c-e4c6dd3427bd.mp4` | 30.0s |
| Concert | Fast | `dddddddd-…0003/aea41bbf-54e0-44d4-bbe3-3ea13d98ac0d.mp4` | 22.4s |

Public base: `https://icxitoczqtcgdkwiaxxc.supabase.co/storage/v1/object/public/gallery-stories/`.
Representative frames committed under `docs/story-studio/evidence/final/`.

## 5. Creative quality gate — three independent reviewers (inspected rendered frames + plans)
Scores are the average of 3 reviewers (event-photographer, motion-director, social-editor lenses), improved build:

| Template | Cycle-0 (gradients→then stock) | Cycle-1 (engine fixes) | Notes |
|---|---|---|---|
| Corporate (Cinematic) | 5.8 | **7.2** | strongest; postable on real photos |
| Concert (Fast) | 6.1 | **7.3** | Reels-native |
| Wedding (Editorial) | 4.8 | 5.9 → **~7 after cycle-2** | cycle-2 fixed the invisible-title bug that tanked it |

**Gate result: the ≥8.0 average is NOT met on random stock content — and all three reviewers unanimously attribute this to CONTENT, not the engine.** The packs are random openly-licensed photos with no thematic relationship to the labeled event (the "wedding" pool contains a leopard, a guitar, a mountain). Image-selection and emotional-progression score 5–6 because the engine cannot turn unrelated stock into a coherent event story. **Engine-controlled categories** (opening, crop/focal, motion, transitions, typography, pacing, template differentiation) score **7.5–8**. On a real, tagged event library the reviewers project all three would clear 8.

## 6. Defects found and fixed (this phase)
1. **Focal hardcoded to center (0.5,0.5) → cropped faces** — all 3 reviewers. Fixed: rule-of-thirds upper-biased default.
2. **Text-on-black openings** — 2 reviewers. Fixed: darkened hero-photo title cards.
3. **Single fixed motion intensity + mechanical loops** — 2 reviewers. Fixed: per-scene variation + seeded jitter.
4. **Heavy cinematic vignette crushing shadows** — 2 reviewers. Fixed: lighter vignette.
5. **Editorial opening/outro title invisible** — 2 reviewers (cycle-2). Root cause: an in-flow title (fade entrance, `transform:none`) painted BELOW the absolutely-positioned cover image (CSS stacking); fixed with `position:relative`+`zIndex` + text-shadow + darker centered scrim. Regression test added.
6. **Stale draft with dead image ids → black editor preview** (QA-data). Cleared.

## 7. Browser QA matrix (deployed app + local demo, Claude-in-Chrome)
| Flow | Result |
|---|---|
| Story Studio button in real dashboard | ✓ |
| Open editor on real gallery (15 real photos) | ✓ |
| Auto plan (editorial 15 scenes) + real thumbnails | ✓ |
| Edit (duration) → preview updates | ✓ |
| Autosave → "✓ נשמר" + persisted | ✓ |
| Refresh recovery (reopen → restored 4.3s draft) | ✓ |
| **Render start → progress → complete → download** (Launcher UI) | ✓ (poster + "⬇ הורד MP4") |
| **Cancel** (re-render → cancel → idle; server row `cancelled by user`, no orphan output) | ✓ |
| Retry (re-render button) / duplicate lock (API live) | ✓ |
| Image-hook opening + face-safe crop on deployed render | ✓ |
| Desktop / iPhone 390×844 / Android 412×915 / landscape 844×390 | ✓ (no overflow, controls reachable) |
| Hebrew RTL / English LTR (title direction per string) | ✓ |

## 8. Performance & cost
- Real-photo render: ~265–285s at 3009MB (heavier than gradient's ~150–195s). Under the 300s ceiling for ≤18 scenes / ≤45s.
- **Concurrency finding:** back-to-back real-photo renders on a WARM Vercel container OOM Chromium ("decrease concurrency"). Renders must run one at a time per container (matches the 1-active-per-gallery lock); cold-start spacing avoids it. Reinforces the queue/Lambda recommendation before higher concurrency.
- Cost ~0.15–0.24 GB-hr per real render.

## 9. Security / storage
- Auth + owner isolation on every endpoint; tenant isolation (foreign imageId → 400); no error-detail leakage; music trackId allow-listed (no URL/SSRF). (Verified live 401/404/invalid_scene_plan/story_too_long earlier + code review.)
- **No migration added** — the provisional `story_renders` columns stay in `docs/`; the branch has zero files under `supabase/migrations`; `115_` is the clean slot when unblocked (no reconciliation collision — verified).

## 10. Known limitations
- **Creative ≥8.0 average is blocked by content**, not engine (needs real/approved themed event photos, or a licensed stock-search API — an external credential/legal item). Engine categories already ~8.
- Horizontal focal locked at x=0.5 (upper-bias Y fixed; content-aware X needs face detection not present in QA data).
- Music: no beat-sync / no catalogue (documented future work; only bundled test tracks + user-owned upload path in the contract).
- Persistence (autosave/draft) depends on the provisional migration; applied to disposable QA only, NOT prod/shared (guardrail).

## 11. Cleanup
- Dropped temp qa2 storage policy `qa_seed_packs_2026`.
- **Owed (user):** revoke the Vercel Protection-Bypass token; drop `qa_seed_gallery_images_*` policies. qa2 seed rows/objects are disposable.
- Production + shared Staging + unrelated PRs untouched. No prod deploy, no prod migration.

## 12. GO / NO-GO
- **Draft PR #225 (human review): ✅ GO** — code complete + tested (45 tests, tsc, build), real MP4s render on the deployed server for all 3 templates, Music V1 works, the full Launcher render/download/cancel lifecycle is browser-verified, and creative quality is materially improved (Corporate 7.2 / Concert 7.3 / Wedding ~7). Keep as **Draft**.
- **Creative ≥8.0 average gate: ⛔ BLOCKED (content, not engine)** — needs real/approved themed event photos or licensed stock-search access.
- **Production: ⛔ NO-GO** until explicit approval (and the migration landing).

---

## 13. Update — real Gallery→Story flow + creative validation honestly BLOCKED

The product's source of truth is a real Pixflow gallery (not a manual asset folder). Two integration gaps were closed and verified end-to-end on the deployed app (gallery `הופעה חיה`, 15 real photos):

**Reused (already existed):** Story Studio button in the real dashboard, editor with storyboard, drag/keyboard/button reorder, add/remove photo, per-scene duration/motion/transition/fit/focal/caption, intro/outro/title/date/logo, music V1, template select, live preview, per-scene + full reset, undo/redo, autosave, draft restore, render/download/cancel lifecycle.

**Implemented (was missing):**
1. **Pre-generation photo selection** — the Launcher now opens a picker (defaults to Highlights/Top Picks, "select all" / "only recommended", the photographer's order preserved, count-aware "Create Story"); nothing generates until confirmed. Resuming a saved draft skips selection.
2. **Locked photographer order is the DEFAULT** (`preserveOrder`): exact supplied sequence, no dedupe/re-selection/interleave/opener-closer moves. The smart re-sequence is an explicit **"Suggested Edit"** toggle that never silently replaces the locked version; manual edits survive the toggle.
3. `onPlanChange` emits the plan synchronously so a fresh gallery renders immediately.

**Exact Gallery→Story user flow (verified on deployed):**
`Gallery → Stories tab → STORY STUDIO → Select photos (highlights pre-checked, order preserved) → Create Story → Editor (locked order default; Suggested Edit optional; full scene + global controls; music; live preview) → Render → progress → download.`

**Controls that genuinely persist AND change the exported MP4** (preview==export by construction; verified): scene order, per-scene duration, motion + per-scene intensity, transition, fit, focal, caption + position, intro/outro title/date/logo, template, music track/volume/fades, total duration (via length + edits). All flow into the ScenePlan the server renders.

**Creative-quality score: 🚫 BLOCKED BY MISSING APPROVED EVENT CONTENT.** The earlier stock-photo reviews (7.2 / 7.3 / ~7) are **not** valid product-quality evidence — the sets are visually unrelated to their events (a leopard in the "wedding"). Per instruction, the **≥8.0 gate is neither passed nor lowered**; it remains open until an approved, coherent event gallery is provided. The deterministic engine quality (crop, motion, transitions, typography, template differentiation, opening) is demonstrably ~8 in the engine-controlled categories, but a valid ≥8.0 product verdict requires real event photos.

**Revised GO / NO-GO:**
- **Functional Gallery→Story integration + editor + lifecycle: ✅ GO for human review** (Draft PR #225).
- **Creative-quality ≥8.0 gate: 🚫 BLOCKED** pending an approved coherent event gallery (not waived, not faked).
- **Production: ⛔ NO-GO.**

---

## 14. Creative validation on an APPROVED REAL EVENT gallery (the honest result)

Approved gallery: **IAC · Teens Track — closing event, 17 Jan 2026** (`~/Downloads/IAC 2026 2/17-01-26/Teens track closing event`). **10 photos, all landscape ~2048×1366.** Photos were used **locally only** — served over `localhost` to the renderer and **never uploaded** to any Pixflow project/storage. Rendered with system Chrome + `@sparticuz`-free local Remotion, one render at a time. Harness: `scripts/qa-render-event.mts` (+ `qa-scan-mp4.mts` for defect scans).

### 14.1 Three MP4s from the same event (`/tmp/qa-event/`)
| Version | What it is | Scenes | Dur | Audio | Notes |
|---|---|---|---|---|---|
| **Locked** | photographer's exact filename order (auto engine, `preserveOrder`) | 8 | 34.4s | muted | de-duped 10→8 (dropped 2 near-dupes) |
| **Suggested** | engine smart re-sequence ("Suggested Edit") | 8 | 34.4s | muted | closes on the sunset-group hero |
| **Manual** | photographer's hand cut via the editor controls | 6 | 23.7s | **warm bundled track** | the deliverable |

### 14.2 Engine + composition improvements this cycle (all evidence-driven)
- **Perceptual de-dup** (dHash via `sharp`, Hamming ≤12) drops near-identical frames — reviewers' #1 ask; 10→8 automatically, and the Manual curates to 6 distinct beats.
- **Real fix for intermittent black frames**: 2048px originals under software-rendered Chrome intermittently painted a fully-black frame mid-scene (confirmed at full res). Serving **preview-sized (≤1280px) images** + `concurrency:2` eliminated them (verified frame-accurate). Also capped the fit-background `blur()` radius (very large radii are a known headless-Chrome black-frame trigger).
- **Cinematic letterbox matte** for the all-landscape wides: a dark ambient blurred bed + a band-darkening gradient that clears only where the photo sits, so the sharp shot floats on an intentional matte (not a bright "blurry duplicate", not dead-black).
- **Per-photo focal**, **role-based pacing** (2.4s punch → 3.8s hero hold), **diversified motion** (push/pull, no move >2×), **de-clustered wides** (the two letterboxed shots are separated by a filled beat).
- **Unique title backdrop** (title no longer sits over the same photo as beat 1) via optional `card.coverSrc`.
- **Watermark gated to photo scenes only** (removed the double-brand on the title/outro cards); for the deliverable the persistent mark is off — a posted social story carries the brand on the cards, and it remains a per-user toggle in-app.
- **Bundled, license-clean "warm" music** on the deliverable (real AAC track, soft fade in/out) — the actual posted-story experience.

### 14.3 Independent creative review — three reviewers, complete cuts, 10 categories each
Three independent reviewers (event-photographer, motion-director, social-editor lenses) scored the **Manual** deliverable from the rendered frames (dense contact sheet every 0.5s + per-scene key frames + exact plan) across **six** improve→render→review cycles. Every cycle's corroborated defects were fixed and the cut re-rendered.

| Cycle | Key fix that cycle | Photographer | Motion dir. | Social ed. | **Avg** |
|---|---|---|---|---|---|
| 1 (comparative) | baseline curated | 7.1 | 8.0 | 8.1 | 7.7 |
| 3 | curate to 6 distinct beats, kill wide-cluster | 7.8 | 7.5 | 7.6 | 7.6 |
| 4 | unique title backdrop, separate wides, vary motion | 7.9 | 7.7 | 7.5 | 7.7 |
| 5 | true dark matte, watermark off cards | 7.9 | 7.9 | 7.7 | 7.8 |
| 6 (final) | watermark off, music, punch cut, stronger travel, deeper scrim | 7.7 | 7.8 | 7.9 | **7.8** |

**Final Manual scorecard (shipped build):** every reviewer marks it **`gate_pass: true`** individually (professional, deliverable, beats a Pic-Time canned slideshow). Category means ≈ opening 8 / progression 8 / selection 8 / crop 7.3 / pacing 8 / motion 7.3 / transitions 8 / typography 8 / ending 7.7 / technical 8. **No category below 7.**

**Defects found and fixed across the cycles:** near-duplicate photos; intermittent black frames (texture pressure); a genuinely black mid-scene frame; muddy/bright letterbox bands → dead-black bands → refined ambient matte; title-photo == beat-1 repeat; two letterboxed wides adjacent (mid-story sag); global focal → per-photo; mechanical/uniform push-in → diversified push/pull + a punch cut; near-static letterboxed frames → clearer travel; persistent watermark double-branding the outro → gated to scenes then off; low title/outro contrast → deeper scrim; muted → bundled licensed music.

### 14.4 Honest gate status — NOT fabricated, NOT lowered
- **Strict ≥8.0 average is NOT numerically met.** The Manual deliverable stably plateaus at **7.6–7.9 (final 7.8)** across six cycles; all three reviewers rate it individually passing, but the arithmetic mean sits ~0.2 under the line.
- **The residual gap is (1) inherent to this gallery and (2) V2 scope**, per the reviewers' own remaining notes:
  - **Inherent to the source**: all-landscape 10-photo set → unavoidable letterboxing on the wides (they cite the band height even when the matte is tasteful), a few clipped window highlights, and limited shot variety (two similar group shots). A gallery with portrait/mixed orientation and 18–24 frames would very likely clear 8.0 with the same engine.
  - **V2 features**: a "signature" motion accent (parallax / whip / rack-focus), kinetic/animated typography, and a bespoke animated logo end-card — all beyond deterministic-V1 scope.
- **Preview == export parity: holds by construction** — the `@remotion/player` preview and the `renderMedia` export consume the **identical** `ScenePlan` through the **identical** `StoryStudioVideo` composition; there is no separate preview path. Every change this cycle (matte, watermark gating, cover, music) lives in that shared component, so both reflect it.
- **Technical cleanliness: verified** — no black/broken/stretched/repeated frames in the shipped cuts (the earlier automated luma flags were seek-decode artifacts of the stripped ffmpeg, disproven by direct full-res frame inspection); consistent transitions; legible type; real AAC audio on the deliverable.

### 14.5 Final GO / NO-GO
- **Draft PR #225 (human review): ✅ GO.** Code complete, 46 tests + tsc + build green, real-event MP4s render clean locally, Music V1 present on the deliverable, full editor/lifecycle browser-verified, and the Manual cut is a genuine, distinctive, deliverable story (unanimous individual reviewer pass at 7.8). Keep as **Draft**.
- **Strict creative ≥8.0 average: ⛔ NOT MET (7.8), not waived, not faked.** Recommendation: re-run the gate on an approved **mixed-orientation, 18–24 photo** event gallery (expected to clear 8.0 unchanged), or greenlight the V2 motion/typography items — a founder decision, not an engineering blocker.
- **Production: ⛔ NO-GO** until explicit approval + the provisional `story_renders` migration lands.

_Cleanup still owed by the user: revoke the Vercel Protection-Bypass token; drop any leftover qa2 seed policies. No approved photo was uploaded; nothing was merged or deployed._

---

## 15. V2 build — engine upgrade + Track A PASS (in progress)

Built in the user's ordered brief; validated on the SAME hard Track A gallery (IAC Teens Track, 10 photos, all landscape). Nothing deployed; Draft branch only.

**Done + tested:**
1. **Canonical scene plan v2** — added per-scene `transitionOut`, `captionStyle`, `role`, `locked`, `beatAlignedSec`; plan-level `audio` analysis + `beatSyncStrength`; version 2 with lossless `upgradeScenePlan()`; guard + differentiation vocab synced. New serialization/versioning + beat-sync tests.
3. **Curated motion system** — new `parallax` (two-plane counter-drift bed) and `reveal` (directional entrance) motions in the composition; role-based selection in the planner (portraits hold still, wides drift cinematically, people beats pan toward the crowd, close breathes out).
4. **Curated transition system** — new `fade-color` (through charcoal, never pure black), `masked-reveal` (soft gradient wipe), `match-cut` (fast composition-match); content/role-based selection.
6. **Genuine music beat analysis** — `scripts/analyze-audio.py` (scipy/numpy spectral-flux onset + autocorrelation tempo + peak-pick) on the bundled tracks -> `musicAnalysis.json` (warm 107.7bpm/52 beats). `applyBeatSync()` aligns unlocked cuts to beats; locked scenes keep their duration. License provenance carried on every export.
7. **Automatic first cut** — real face detection (`scripts/detect-faces.py`, OpenCV, offline) + per-image sharpness/brightness/warmth drive a real event arc: hook on the strongest group, establishing rooms letterboxed, people beats face-framed, the portrait held still, a warm close. Face-aware fill/letterbox classification and crowd-centroid focal (degrade gracefully with no face data; never invent a signal).

**Track A gate result (3 independent reviewers, complete MP4s):**

| Cut | Photographer | Motion dir. | Social ed. | Avg |
|---|---|---|---|---|
| AUTO (fully automatic) | 7.2 | 7.6 | 7.0 | 7.3 |
| REFINED (deliverable) | 8.2 | 8.3 | 8.3 | **8.27** |

**REFINED clears Track A** (avg 8.27 >= 8.0, no category < 8, no black frames, no duplicate/near-dup scene, no face-crop, preview==export by construction). Up from V1's 7.8. The fully AUTOMATIC cut reaches 7.3 (up from V1's mechanical auto ~6.5): the face arc, still-held portrait and cinematic letterbox all land; remaining weaknesses are push-in-heavy motion and a soft auto ending (warmth heuristic closed on a standing group, not the sunset hero — a real limitation without scene/colour understanding).

**Remaining before V2 is complete (NOT yet done — do not call V2 shipped):**
- Item 2: deeper editor-control browser audit + new controls (lock toggle, beat-sync slider, request-another-variation, duplicate-version).
- Item 5: animated typography + animated logo end-card + chapter/moment labels.
- Item 8: Track B showcase gate — BLOCKED on an approved richer (18-24 photo, mixed-orientation) gallery.
- Item 9: further tests (motion/transition selection, framing fallbacks, undo/redo, locked preservation in re-edit).

**Tests:** 50 passing; tsc + production build clean. **Client media:** the approved photos were used locally only (served over localhost), never uploaded or committed; the rendered MP4s live in /tmp and `~/Downloads/Pixflow-Story-Studio-QA/` only. **Safety:** completed on the Draft branch; not merged, pushed, or deployed; no migration. **Owed:** revoke the Vercel Protection-Bypass token before final delivery (not present in code/history/artifacts; a dashboard setting).

---

## 16. V2 completion pass — editor, auto-cut, typography, tests, Track A rescore

**Item 2 — automatic cut improved + rescored.** Two reviewer-flagged weaknesses fixed: (a) ending selector now closes on the strongest emotional payoff (crowd size + warmth + sharpness) so the auto cut lands on the sunset hero, not a generic group; (b) a motion-diversity budget forbids two consecutive scenes sharing a movement family (portraits hold, closer keeps pull-out), killing the push-in monotony; (c) the arc keeps a single establishing room (near-duplicate wides dropped). Real signals only.

**Track A rescore (3 independent reviewers, complete MP4s):**
| Cut | Photographer | Motion dir. | Social ed. | Avg |
|---|---|---|---|---|
| V1 AUTO | — | — | — | ~6.5 |
| V2 AUTO | 7.9 | 7.9 | 8.1 | **7.97** |
| V1 REFINED | 7.7 | 7.8 | 7.9 | 7.8 |
| V2 REFINED | 8.7 | 8.0 | 8.7 | **8.47** |

V2 REFINED clears Track A (8.47, no category <8). V2 AUTO reaches 7.97 (was 6.5) — a genuinely strong fully-automatic cut, just under the pro bar.

**Item 1 — real editor controls (browser-verified on the local demo).** Added per-scene: LOCK toggle, motion intensity, transition-in + transition-OUT, transition-duration slider, caption typography style. Added global: "request another variation" (fresh seed, preserves manual edits + locks) and a beat-sync strength slider (attaches the track's real analysis, snaps unlocked cuts to the beat — changes preview AND export). All wired to the ONE canonical ScenePlan. Browser QA confirmed: controls render in RTL, the lock toggles and PERSISTS through a re-variation (locked-scene preservation), the live preview renders the new composition (preview==export), autosave shows ✓ נשמר.

**Item 3 — typography/branding.** Caption styles (editorial/bold/minimal), restrained animated entrance (honours prefers-reduced-motion), brand-accent chapter rule, safe Stories/Reels margins, RTL/LTR; animated logo end-card (scale+fade) when a Brand Kit logo exists.

**Item 4 — tests.** plannerV2.test.ts (fit classification, arc hook/closer, ending selector, motion-diversity, portrait-holds-still, role+lock flags) + scenePlanContract.test.ts (version upgrade, per-scene field round-trip, beat-sync + locked preservation). 56 automated tests, tsc + build clean; editor lock/variation browser-verified.

**Still open (media-independent, minor):** a "duplicate version" Launcher feature (save a copy of a whole draft as a separate version) and a few more edge tests (undo/redo unit, render-failure/cancel already covered by V1 lifecycle). **Track B** (showcase gate, 8.5) is the primary remaining INPUT: it needs an approved richer gallery.

**Guardrails honoured:** client media local only (never uploaded/committed); rendered MP4s live in /tmp + ~/Downloads only; completed on the Draft branch, nothing merged/pushed/deployed; no migration; existing gallery/face-recognition behaviour untouched. Owed: revoke the Vercel Protection-Bypass token before final delivery.

---

## 17. Track B — showcase gate on an approved rich event (honest NO-GO on strict gates)

Approved source: a coherent real event (live music performance, 65 photos) picked automatically from the approved local root as the strongest candidate (predominantly landscape — flagged). Read-only; no source renamed/moved/deleted/uploaded/committed. Five real MP4s produced locally: AUTO (fully automatic), REFINED (via the ACTUAL editor UI — deletions + autosave + plan export, no JSON edits), + Editorial/Cinematic/Fast template variants.

**Engine features exercised (all reusable product logic):** auto photo-selection from 64 by a real-signal story-score proxy (sharpness + face presence); `recommendTemplate()` auto-choosing the template from event energy (dark + crowd-dense -> cinematic); face-driven arc with round-robin interleave; template-aware full-bleed vs letterbox; energetic motion + whip/cut transitions on reel templates; beat-synced cuts; the editor loaded a real gallery and produced the refined cut through the UI.

**Three independent reviewers, 12 categories, four improve-render-review cycles.** Scores oscillated within reviewer noise (unchanged AUTO scored 8.12 then 7.78 on identical footage). Plateau: **AUTO ~7.9** (7.8-8.1), **REFINED ~8.3** (8.1-8.4). Defects fixed across cycles: single-letterbox-scene (-> full-bleed reels), static peak clusters (-> motion on every scene), dissolve-heavy transitions (-> whip accents), weak candid frames (-> editor tightening 18->15).

**Gate result (honest):**
- Automatic V2 >= 8.0: **NOT reliably met** (~7.9, borderline).
- Refined V2 >= 8.5: **NOT met** (~8.3) — but consistently rated a strong professional deliverable that "clearly beats a Pic-Time/Pixieset auto-slideshow" and is "the one to ship."
- No rendering defect / preview==export mismatch: **met** (no black frames, cut faces, distortion, repeats; the letterbox defect was fixed).
- Remaining ceiling (reviewer-named): whip-transition over-use (needs selective whips), uniform motion intensity (needs dynamic contrast), some mid-tier source frames, and a landscape-dominant source that doesn't stress mixed orientation.

**Verdict: strict numeric gates NO-GO (honest near-miss, not hidden); qualitative GO for founder review of the actual videos.** Local package: `~/Downloads/Pixflow-Story-Studio-QA/TrackB/` (5 MP4s + plans + contact sheets + README). 57 tests pass; Draft branch only; nothing merged/pushed/deployed; no migration; source read-only; no client media committed. Owed: revoke the Vercel Protection-Bypass token.
