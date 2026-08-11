# Story Studio — Migration Inventory & Collision Proof
_Dated 2026-08-08. Verified directly against git refs (fetched origin, e8336f3). `gh` CLI is NOT installed, so PR state is inferred from merge commits + branch refs, not the GitHub API._

## 1. Current frontier on `main`
`origin/main` @ `e8336f3` — highest numbered migration:

| # | file |
|--:|------|
| 109 | `109_gallery_meta_null_safe.sql` (+ rollback) |
| 110 | `110_editor_rpc_grant_hardening.sql` (+ rollback) |
| 111 | `111_gallery_appearance.sql` (+ rollback) |
| 112 | `112_replace_image_rpc.sql` (+ rollback) |
| 113 | `113_gallery_presets.sql` (+ rollback) |
| **114** | **`114_draft_isolation_hardening.sql`** (+ rollback) |

**main frontier = 114.** All recent migrations ship a paired `_rollback.sql` (reconciliation convention).

## 2. Draft PRs — do they add migrations above 114?
The three protected drafts and their migration posture (I must not modify/merge/close them):

| PR | Branch | Migration files | New *logical* migrations vs main |
|----|--------|-----------------|----------------------------------|
| #214 | CPV2 (`feat/client-portal-v2*`) | 088–114 range | already reconciled into main (PR #221) |
| #216 | `feat/gallery-editor-refinement` | 088–109 (NN_ scheme) | **0** |
| #220 | `feat/gallery-workflow-completion` | 088–112 (NN_ scheme) | **0** |

**Proof (by logical name, stripping the number prefix):**
```
comm -23 <(logical-names #216) <(logical-names main)  →  (empty)
comm -23 <(logical-names #220) <(logical-names main)  →  (empty)
main logical count = 100 ⊇ #216 (95), #220 (98)
```
Interpretation: the drafts carry **stale, pre-reconciliation copies** (numbered 107–112) of migrations that PR #221 already renumbered onto main as **109–114**. When #216/#220 rebase onto reconciled main, those files become duplicates to drop — they contribute **no new migrations**. The apparent "115 collision" from a raw filename listing is an artifact of renaming, not real pending work.

## 3. Does anything else claim 115+?
Scan of **every** `refs/remotes/origin/*` branch for a migration file numbered `115`–`199`:
```
(no matches on any branch)
```
So in the repository's `NN_` scheme, **115 is free across all branches.**

## 4. Why we still keep the Story Studio migration PROVISIONAL
Two residual, honestly-unresolved facts prevent me from *committing* a permanent number in this session:

1. **Prod uses a separate migration ledger.** Production migration history is timestamp-versioned (`YYYYMMDDHHMMSS_`), not the repo's `NN_` filenames (confirmed: the repo contains **zero** timestamp-style migration files; that ledger lives only in the prod DB). The constraints forbid me from querying prod/shared Staging, so I **cannot prove** the true applied frontier there.
2. **`gh` is unavailable**, so I cannot confirm from the GitHub API that #216/#220 won't be re-cut with fresh numbers before Story Studio lands.

## 5. Decision (per sprint rule §4)
- The Story Studio schema change is **additive-only** and **reuses the canonical `story_renders` model** (no duplicate story table): `scene_plan jsonb`, `title text`, `draft_updated_at timestamptz`, a `'draft'` status value, and one partial-unique index (`one draft per gallery`).
- It ships as a **provisional, un-numbered patch OUTSIDE `supabase/migrations/`** (`docs/story-studio/provisional-migration/`) with a **reversible rollback**, so it can never be auto-applied to any environment.
- The **entire core** (scene-plan contract, deterministic planner, 18 passing unit tests, sample generator) needs **no database** — it runs on in-memory fixtures — so the migration dependency **blocks nothing** in this session.

## 6. Number-assignment rule (for when the owner unblocks it)
Assign the real version **only after**: (a) #216 and #220 have landed on main, and (b) the true prod frontier is confirmed. Then:
- If continuing the repo `NN_` scheme and main is at 114 with nothing above: use **`115_story_studio_scene_plan.sql`** (+ rollback), re-verifying no branch has taken 115 in the meantime.
- If aligning to the prod timestamp ledger: generate a fresh `YYYYMMDDHHMMSS_story_studio_scene_plan.sql` greater than the last applied prod version.
- An independent DB reviewer must re-run the §2/§3 checks at that time before apply.

**Status: migration dependency UNRESOLVED-BY-DESIGN, non-blocking. NO migration applied to any environment.**
