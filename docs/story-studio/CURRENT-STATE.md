# Story Studio — Current State (supersedes stale SPRINT-REPORT sections)
_2026-08-09 · branch `feat/story-studio-revival` · local only, not pushed_

This is the authoritative status. Where it disagrees with SPRINT-REPORT.md, this wins.

## ✅ Working & verified (locally)
- **Deterministic planner** + canonical **ScenePlan** contract — 18 unit tests.
- **Server security boundary** (`serverPlan.ts`) — tenant isolation, gallery pinning, client-`src` discard + server re-resolve, server-authoritative dims, injection reject — 7 unit tests. **25 tests total pass.**
- **Real MP4 rendering** from a ScenePlan (Remotion + system Chrome): 3 samples re-rendered at 1.1–1.7× realtime.
- **Three genuinely distinct templates** (not just pacing): Editorial (centered serif, whitespace), Cinematic (bold uppercase, letterbox+vignette), Fast (heavy kinetic, block accent, tick-bar). Verified by opening-card posters + full renders.
- **Editor** (`StoryStudioEditor`) — RTL, storyboard reorder (drag + buttons), per-scene duration/motion/transition/fit/focal/caption, global template/length/pace, undo/redo, autosave, reset. Restores a saved `initialPlan`.
- **Live `<Player>` preview** renders real scene images (zoom-scale fix) — **preview = export** (same composition drives both).
- **Mobile** responsive (container-based) single-column layout.
- **Render endpoint** (`/api/stories/render`) now **accepts an edited `scenePlan`**, validates it via `serverPlan`, and selects the `StoryStudio` composition. Legacy `style`/`photoIds` path unchanged. Typechecked; the old path is untouched.
- **Bundling**: `stories-bundle` now contains **both `Clean` and `StoryStudio`** compositions (verified via `getCompositions`).
- **Real gallery integration**: a **"Story Studio" button in the actual Dashboard** (`Dashboard.tsx`, Stories section) opens `StoryStudioLauncher` with the gallery's **real images, resolved Brand Kit and event info**; autosaves via the draft API; renders via the render endpoint with progress/success(download)/failure(retry). **Full project typecheck (0 errors) + production build pass** with this wired in.

## 🟡 Wired but not end-to-end-verified this session
- **In-Dashboard end-to-end flow** — the integration compiles + builds, and every component is proven via the standalone demo using the **same data shapes**, but a full click-through inside the real authenticated Dashboard was **not** run (needs a logged-in test account on a served app). Not a code gap; a verification gap.
- **Render over HTTP** — the render *engine* is proven (3 MP4s from ScenePlans via the identical composition). Executing it through the deployed `/api/stories/render` needs a deploy or `vercel dev` with service-role env.

## ⛔ Blocked by database migration (by design, per your rules)
- **Draft persistence round-trip** ("leave & return restores the draft"). `api/stories/draft.ts` is written + typechecked and the launcher calls it, but it needs the additive `story_renders` columns (`scene_plan`, `title`, `draft_updated_at`, `'draft'` status, one-draft-per-gallery index). That migration is **provisional and applied nowhere** — I cannot touch shared Staging/prod and cannot create a paid QA project. Autosave failures are swallowed so the editor still works without it.
- **Persisting/reopening a finished Studio story** on the gallery depends on the same migration + the `stories` surface wiring.

## ❌ Not done
- Real integrated **QA URL** (needs deploy — your approval).
- Full **browser QA matrix** (iPhone/Android/landscape/keyboard/reduced-motion/slow-net) on the *integrated* Dashboard flow — blocked by the login/deploy gap above; the editor itself was QA'd standalone (desktop + mobile frame).
- Independent security/regression **review agents** (planned; the security *logic* is unit-tested).
- Formal per-gallery **rubric scoring** doc with before/after (samples + storyboards exist; scoring rubric not formalized).

## What remains before a photographer can use it
1. **You approve** either (a) a disposable QA Supabase project or (b) applying the provisional migration to an approved QA DB — unblocks draft round-trip.
2. **You approve** a preview **deploy** (Vercel) — unblocks the live render endpoint + a real QA URL.
3. Then: one authenticated end-to-end pass (create → edit → leave/return → preview → render → download → reopen) + the browser QA matrix + independent reviews.

## Honesty corrections to older docs
- Earlier "three templates ✅" meant three *profiles*; they are **now** three distinct art-directed visual identities (this session). ✔️
- "preview=export ◑/blocked" is **now** empirically true in-browser. ✔️
- The feature is **integrated into the real Dashboard** (no longer demo-only) at the code/build level; the standalone demo (`sstudio.html`) remains for isolated QA and is **not** the product surface.
