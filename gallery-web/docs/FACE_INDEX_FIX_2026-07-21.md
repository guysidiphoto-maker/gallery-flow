# Face-index stall fix (2026-07-21)

## Symptom
Private face-search on "applied materials" returned "we couldn't identify you" for a guest who IS in the gallery.

## Root cause (not a matching bug)
The gallery's face index was only **113 / 1,165** images built and **stuck** in `indexing`. The selfie only searches indexed faces, so guests in the other ~1,052 photos never match.

Why it stalled: the old indexer ran `EdgeRuntime.waitUntil(processGallery)` which tried to index ALL unindexed images in a single edge invocation. For a 1,000+ image gallery of heavy 2 MB photos that exceeds the Edge Function wall-clock limit and gets killed part-way, with **no automatic continuation** (only a new upload/publish re-triggered it) and a 10-min lock blocking quick retries. It also had the same PostgREST 1000-row select cap. Small galleries finished in one run (why "נסיון" worked); large ones stalled.

## Fix (deployed to prod)
Rekognition edge function → **v20**:
- `runBatch` loops through pages of unindexed images within one invocation (concurrency 6→12, `INDEX_BATCH_MAX=300` also fixes the 1000-row cap) until done or a 240s budget, refreshing a heartbeat each page.
- Best-effort self-invoke (`index_batch`) to chain — but edge self-continuation proved unreliable (a dropped hand-off silently stalled it again at 176), so it is only a bonus, not the mechanism.
- New **`index_kick`** action: anon-authed, idempotent, resumes ONLY a gallery genuinely stuck in `indexing` with a >75s-stale heartbeat (no ownership check needed — returns nothing sensitive, does nothing to a healthy run).

Migration **087** → the durable reliability net:
- Enable `pg_net` + `pg_cron`.
- `sweep_stalled_face_indexing()` + a **1-minute cron** that posts `index_kick` for every stalled `indexing` gallery. Any dropped edge run self-heals within 60s; large galleries grind to completion; finished/healthy galleries are skipped (no piling).

## Verification
- v20 deployed (ACTIVE). Cron `sweep-face-indexing` active; a run matched the stalled gallery and re-kicked it.
- "applied materials" resumed: 113 → 176 (before cron) → 216 → … climbing toward 1,165. Heavy images index at ~0.4/s, so full completion is unattended over ~30–40 min; the cron keeps it alive the whole way.

## Files / prod changes
- Deployed: `supabase/functions/rekognition/index.ts` (v20). Repo commits `8d7d9c2`, `4328434`.
- Applied migration `087_face_index_cron_sweeper.sql` (+ rollback). Commit for the migration on branch.
- No frontend change. Independent of PR #209.

## Rollback
- `087_face_index_cron_sweeper_rollback.sql` (unschedule + drop function; leaves extensions).
- Edge function: redeploy the prior version if ever needed (the batched logic is strictly safer than the original single-run version).

## Note
The 113→1,165 gap here is just indexing lag, not lost photos. Any gallery uploaded before this fix that shows `face_index_status='indexing'` will now be swept to completion automatically.
