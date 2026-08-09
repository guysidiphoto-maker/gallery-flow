# Story Studio — Deployed QA Report (isolated Preview, DB-backed)
_2026-08-09 · branch `feat/story-studio-revival` @ `1cac3f8` (local, NOT pushed)_

## Environment (all synthetic, isolated)
- **Preview URL:** `https://pixflow-story-studio-qa-preview.vercel.app` (stable alias → latest preview)
- **Vercel project:** `pixflow-story-studio-qa` (`prj_KFifYyAvWc8aUDnF8zqvmok1xScE`) — isolated, Preview target, no custom domain, behind Deployment Protection (accessed via your bypass cookie).
- **DB:** `pixflow-cpv2-qa2` (`icxitoczqtcgdkwiaxxc`) — proven synthetic (all emails @qa.test/@example.com). **Deployed client verified to target qa2 only — no prod/staging leak.**
- **Migration:** additive `story_renders` (scene_plan/title/draft_updated_at/'draft' status/one-draft-per-gallery index) applied to qa2; rollback verified reversible.
- **Test identity:** synthetic `studioa.owner@example.com` (throwaway QA password), business `qa-studio-a`, gallery `dddddddd-…0001` seeded with 16 synthetic images (4 top-picks).

## Verified end-to-end on the deployed app ✅
1. Log in (synthetic session) → **real dashboard** loads (studioa.owner).
2. Open real gallery → editor shows **16 images**.
3. Stories tab → **"STORY STUDIO" button (integrated in the real dashboard)**.
4. Click → editor opens with **auto first-cut from the 16 real images** ("16 סצנות · 34.5s · 9:16").
5. **Top-picks prioritized**, opener promoted.
6. Real **Brand Kit + event** applied (opening card shows the real gallery name).
7. **Preview plays real images** (no black frame); cinematic template shows vignette treatment.
8. **Template switch** (editorial→cinematic) re-plans live.
9. **Autosave → PERSISTED to qa2** (SQL-verified: story_renders draft row, template=cinematic-energy, 16 scenes, timestamp).
10. **Draft GET returns the saved plan** (200) — the restore data path for "leave & return".
11. **Security:** deployed serverPlan guard runs (tenant isolation, client-src discard, dims from server, injection/range checks).

## Defects found via deployed QA — and fixed (commit 1cac3f8)
| # | Defect | Fix |
|---|--------|-----|
| 1 | Draft/render functions 500 `ERR_MODULE_NOT_FOUND` — Vercel keeps `.ts` import specifiers at runtime | Self-contained `api/stories/_scenePlanGuard.ts` (no relative `.ts` imports); api imports it via `.js` |
| 2 | Draft PUT would fail — `onConflict` can't use a **partial** unique index | Replaced with delete-draft-then-insert |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` set to a short new-format key → "Invalid API key" (404) | Diagnosed (safe role-claim log); you replaced with the legacy `service_role` JWT → 200 |
| 4 | Render 500 `ENOENT @remotion/compositor-linux-x64-gnu` | `vercel.json includeFiles` for the compositor binary |

## ✅ THREE TEMPLATES RENDERED + VALIDATED on the deployed isolated QA (2026-08-09)
Same 16-image gallery + deterministic planner (length=standard); template drives pacing/motion/cards. All rendered on `pixflow-story-studio-qa` → qa2, 3009MB, Node 24, @sparticuz/chromium 149.

| Template | renderId | render time | video | file | opening card identity |
|---|---|---|---|---|---|
| Cinematic | a39e5472 | 195s | 1080×1920, 34.62s | 8.0 MB | uppercase left + letterbox + vignette |
| Editorial | 8f7d7967 | 151s | 1080×1920, 34.52s | 3.0 MB | centered elegant serif, thin line, small-caps subtitle |
| Fast | 56e7318c | 137s | 1080×1920, 33.75s | 2.9 MB | bold UPPERCASE left, block accent, tick-bar |

- All 3: valid H.264, play start-to-finish, correct 9:16, durations match scene plans (within tolerance), real scene content, no black frames, watermark renders, opening cards render with real event data ("Dana & Tom · 20 Jun 2026 · Caesarea").
- **Templates visibly different:** Editorial (centered serif, calm, push-in/pull-out subtle) vs Fast (bold uppercase left, focus-zoom/push-in medium, slide/cut) vs Cinematic (letterbox+vignette). Honest note: Cinematic and Fast cards are both left/uppercase — distinguished by treatment (letterbox/vignette vs tick-bar) + motion; could be pushed further apart in a polish pass.
- Public URLs (qa2, synthetic): `…/gallery-stories/dddddddd-…/{a39e5472,8f7d7967,56e7318c}.mp4`.

## Preview = export
Same canonical ScenePlan drives both, and the editor `<Player>` renders the **identical `StoryStudioVideo` composition** the server renders. Confirmed: the deployed Editorial MP4 opening card ("Dana & Tom", centered serif) matches the editor's editorial rendering; scene order/duration/motion/transition/branding come from the one persisted plan. No second layout model exists.

## Render-job lifecycle (observed on deployed QA)
- **Idempotency / duplicate:** partial-unique `(gallery_id, style='studio') WHERE status IN(queued,rendering)` → a second studio render while one is in-flight is rejected/short-circuited (no duplicate active job). ✅
- **Retry after failure:** failed rows don't block; re-fire renders a fresh row. ✅
- **Completion:** status→ready + output_path; synchronous endpoint also returns outputUrl. ✅
- **Cleanup gaps (defects to fix before prod):** (1) a render that hits the 300s function timeout leaves an orphaned `rendering` row that **blocks future renders** via the in-flight index — needs a stale-render sweeper (e.g., pg_cron flip `rendering`→`failed` after N min). (2) No true **cancel** (endpoint renders synchronously) — UI "cancel" only stops client polling. (3) No **poster** image generated. These are known limitations, not blockers to the render itself.

## Production feasibility (measured, not guessed)
Measured: 16 scenes = **137–195s** at 3009MB/300s. Roughly linear in frames.
- **15 scenes:** ~130–185s — safe margin.
- **30 scenes:** ~260–370s — **exceeds the 300s function ceiling** (high timeout risk).
- **45 scenes:** ~390–560s — **not feasible** in one synchronous invocation.
- **Recommended first-release cap:** ~**16–18 scenes / ≤40s** synchronous; hard-cap `extended` length.
- **Cost:** ~137–195s × 3009MB ≈ 0.11–0.16 GB-hr per render (Vercel Fluid/function compute) — minor per render, but every render is paid compute.
- **Concurrency:** each render pins ~2 vCPU for ~3 min; N concurrent renders = N×3GB functions — real cost + concurrency limits. In-flight unique caps to 1 per (gallery,style).
- **Recommendation:** keep synchronous only for short stories with a strict scene cap; **move to a queue/worker (or Remotion Lambda) before allowing longer stories or higher concurrency.** Do not raise the per-request limits to force long renders.

## ✅ RENDER BLOCKER CLOSED (2026-08-09) — real MP4 on the deployed isolated QA
The deployed server now produces a real, playable, visually-verified MP4.
**Fixes (commits 06c0eb7, f4e93f8):**
1. `@sparticuz/chromium` 131.0.1 → **149.0.1** (131 lacked Vercel detection → never extracted AL2023 libs → exit 127; 149 has `if(VERCEL && node>=20)` and Chromium 149 matches Remotion 4.0.469's tested Chrome). Requires Node ≥22.17/24 → project `nodeVersion` set to **24.x**.
2. `selectComposition` + `renderMedia` both use the bundled `@sparticuz/chromium` (StoryStudio uses `calculateMetadata`, so selectComposition launches a browser — previously downloaded a lib-less shell).
3. Serve the Remotion bundle from the **local included directory** (not the deployment origin) so server-side Chromium isn't blocked by Deployment Protection on the preview.
4. `vercel.json`: **memory 3009** (1024 was CPU-starved → 300s timeout) + `includeFiles` for compositor, chromium, and `public/stories-bundle`.
5. qa2 was missing the `gallery-stories` bucket → created (public).

**Validated output** (render `a39e5472`, wedding gallery, Cinematic template, auto plan):
- status=`ready`, `gallery-stories/dddddddd-…/a39e5472….mp4`, **195s** render at 3009MB.
- Downloaded (8.0 MB). In-browser `HTMLVideoElement`: **1080×1920**, **34.62s** (scene plan = 34.5s → within tolerance), `readyState=4`, plays; valid H.264 (Chrome plays it).
- Frame @13.5s: real full-bleed 9:16 scene image + **cinematic vignette**, no black frame.

**Remaining for the strict "3 outputs" gate (§4–7):** validated 1 of 3 template outputs (Cinematic). Editorial + Fast run through the same now-proven pipeline; producing + frame-checking those 2, plus the lifecycle matrix (retry/cancel/duplicate/refresh/cleanup) and an orphaned-`rendering`-row sweeper, remain before the Draft-PR gate is fully met.
**Perf note:** 16 scenes = 195s at 3009MB (near the 300s ceiling). Longer/`extended` stories need shorter length caps, higher concurrency, or a queue — do not raise per-request limits blindly.

## (history) Remaining blocker (environment-only; not Story-Studio logic)
Render reaches chromium launch on the deployed function; the browser can't start. Debugged to root cause across iterations:
1. **Compositor binary missing** (`@remotion/compositor-linux-x64-gnu`) → fixed via `vercel.json includeFiles`.
2. **`selectComposition` downloaded Remotion's own headless shell** (StoryStudio uses `calculateMetadata` → needs a browser) which lacked `libnspr4.so` → **fixed** by passing `@sparticuz/chromium` `browserExecutable` + `chromiumOptions` to `selectComposition` (commit 06c0eb7). *(This was a genuine logic fix — the only one — and would break the StoryStudio render path on any host.)*
3. **`@sparticuz/chromium`'s own binary** then failed: `/tmp/chromium: libnss3.so: cannot open shared object file` on Vercel's **Amazon Linux 2023** runtime. Tried: Node-version pin to 20.x, `includeFiles` for `@sparticuz/chromium/**`, `LD_LIBRARY_PATH=/tmp` — none resolved it.

**Diagnosis:** `@sparticuz/chromium` (version in the lockfile) doesn't ship AL2023-resolvable NSS libs. **Fix (dependency/runtime, ~1 change):** upgrade `@sparticuz/chromium` to a current AL2023-compatible release (and align Remotion's expected Chromium), or confirm/replicate the exact chromium setup the existing prod render uses. **Open question for the owner:** verify whether the *existing* prod web-render (Clean) actually launches chromium in prod today — if not, this is a pre-existing platform gap, not a Story Studio regression.

**The render engine itself is proven** — 3 real 1080×1920 H.264 MP4s rendered from the identical `StoryStudioVideo` composition (local, system Chrome), and the deployed endpoint executes all auth/ownership/validation/composition-selection logic up to the chromium launch.

## Not yet re-verified in the deployed UI (data path proven, UI click-through pending)
- Refresh→restore in the UI (draft GET returns the saved plan; launcher wires `initialPlan`), download, reopen-and-edit-again, full mobile/RTL-LTR/keyboard/reduced-motion matrix, 3-gallery visual set. Gated behind the render blocker for the final steps.

## Cleanup owed (synthetic QA artifacts)
- **Revoke the Deployment-Protection bypass token** in Vercel when done.
- Temporary qa2 storage-write policies (`qa_seed_gallery_images_*`) + synthetic login can be dropped/reset (disposable QA).

## GO / NO-GO
- **Draft PR:** ◑ **CONDITIONAL GO** — the integration + endpoints are proven on a real deployment against a real DB, with defects fixed; open as **Draft** noting the render-runtime tuning as the one open item. Needs your approval to push (not pushed).
- **Production:** ⛔ **HARD NO-GO** until the render runtime is resolved + you approve.
