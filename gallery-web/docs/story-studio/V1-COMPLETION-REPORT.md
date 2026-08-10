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
