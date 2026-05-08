# Phase 4 — Upload Pipeline Dual-Write Plan

**Status**: PLAN ONLY (no code changes in this doc).
**Owner**: Upload Pipeline Compatibility Agent.
**Scope**: Make `gallery-web/src/lib/uploadPipeline.ts` compatible with the upcoming public thumbs bucket (`gallery-images-thumbs-public`) without breaking the current single-bucket flow.
**Date**: 2026-05-06.

---

## 1. Current upload pipeline trace

Source: `/Users/guysidi/gallery-flow/gallery-web/src/lib/uploadPipeline.ts`.

`uploadOneImage(file, opts)` (lines 134–178) executes strictly sequentially per file:

1. **Path computation** (lines 136–141): `safeName` → `sanitizeFilename`; `filename` → `ensureJpgExt`; `hash` → FNV-1a 32-bit of `${galleryId}/${file.name}/${file.size}/${file.lastModified}` (deterministic, so retries overwrite the same key — explains why orphan accrual is bounded *per filename* but not bounded across renamed re-uploads). Three paths built via `buildPath` (line 64):
   - `thumbPath  = <slug>/<galleryId>/thumbs/<hash>_<filename>`
   - `webPath    = <slug>/<galleryId>/web/<hash>_<filename>`
   - `origPath   = <slug>/<galleryId>/originals/<hash>_<file.name>`
2. **Compression** (lines 143–147): thumb (360px / Q75) and web (1600px / Q82) generated **in parallel** via `Promise.all` over `resizeToBlob`. Original is the raw `File`.
3. **Storage uploads — strictly serial** (lines 149–156):
   - line 150: `uploadOne(BUCKET, thumbPath, …)`
   - line 153: `uploadOne(BUCKET, webPath, …)`
   - line 156: `uploadOne(BUCKET, origPath, …)`
   Each `uploadOne` (lines 114–121) uses `upsert: true`, so retries replace.
4. **DB commit** (lines 158–169): `record_image_upload` RPC. This RPC (migration `043_token_economy.sql:131`) is the *only* path to insert into `images` from web — it validates ownership, decrements `business_tokens.balance` atomically, inserts the `images` row, writes a `token_ledger` entry, and bumps `galleries.image_count`. All in one transaction.
5. **Return** (lines 172–177): emits `done`, returns `{imageId, filename, webPath, thumbPath, originalPath, originalSize}`.

**Partial-failure semantics today**:
- Thumb succeeds, web fails → orphan thumb in storage; `images` row never created; token NOT consumed (RPC never ran). On retry with same file (same `hash`), thumb is overwritten in place, web/original re-attempt. **Bounded orphans per (file, gallery) pair.**
- Web succeeds, original fails → orphan thumb + orphan web; same retry-overwrites-by-hash story.
- All 3 storage uploads succeed, RPC fails (e.g. `insufficient_tokens`) → 3 orphan blobs; no DB row, no token burned. The audit's 4,655 orphan files / 2.5GB are the cumulative tail of this case (mostly across abandoned uploads where the photographer changed the filename and never retried).

`uploadMany` (lines 190–225) runs `concurrency=3` workers; per-file errors are caught and reported via `onBatch` rather than aborting the batch.

Dashboard usage: `gallery-web/src/pages/Dashboard.tsx:4` imports `uploadMany`; line 533 calls it. No other code paths in `gallery-web` upload images.

---

## 2. Dual-write requirement (post-Phase-4.2)

Once `gallery-images-thumbs-public` exists and `gallery-images` is flipped private:

| Variant | `gallery-images` (will become PRIVATE) | `gallery-images-thumbs-public` (NEW, public) |
|---|---|---|
| thumb | YES — kept (back-compat for in-app authenticated reads) | YES — written for crawlers, OG tags, public previews |
| web preview | YES — only here | NO |
| original | YES — only here | NO |

During the transition window (Phase 4.2 → 4.7) BOTH buckets must hold thumbs so `og.tsx` can pick whichever it can fetch unauthenticated, and the photographer dashboard can keep using the private bucket via JWT-RLS.

---

## 3. Backfill strategy for existing data

Estimate: ~71 galleries × ~250 photos = **~17,750 thumbs** to copy. Average thumb ~30–60 KB → ~700 MB–1 GB total.

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| (a) Supabase Edge Function batch copier | Deno function with service-role key; iterates `images`, `storage.objects.copy(src, dst)` via Supabase client | Runs server-side, no client bandwidth, easy to gate by `business_id` | Edge function CPU/wall-time limits (≤ 60s per invocation) require a paginated cron loop |
| (b) Vercel API endpoint batch copier | Node serverless, paginated calls from a one-off script | Familiar runtime, easier observability | Bandwidth flows out and back through Vercel; more setup |
| (c) One-shot SQL `storage.copy` migration | `supabase-storage` exposes a copy RPC at the API layer, but **Postgres has no native `storage.copy`** — only `storage.objects` rows. A pure-SQL copy is *not* a true storage copy; it just clones the row, which silently breaks because the underlying S3 object is not duplicated. | None usable | Does not actually copy bytes; rejected. |

**Recommendation**: **(a)** Supabase Edge Function `backfill-public-thumbs`, invoked by a cron on a 5-minute interval, processing batches of ~200 images per run, marking `images.public_thumb_present = true` after each successful copy. Total runtime: ~17,750 / 200 = ~89 batches × 5 min = ~7.5 h. Can be parallelised across two cron schedules to halve wall time.

Cost estimate: storage adds ~1 GB at $0.021/GB-month = **~$0.02/month**; egress for the copy is internal Supabase (free). Compute: edge function invocations are well within free tier.

---

## 4. Code changes required (specify only)

### 4.1 `gallery-web/src/lib/uploadPipeline.ts`

- **Line 20**: alongside `const BUCKET = 'gallery-images'` add `const THUMB_PUBLIC_BUCKET = 'gallery-images-thumbs-public'`.
- **New helper** near line 68: `buildPublicThumbPath(slug, galleryId, hash, filename) => ${slug}/${galleryId}/${hash}_${filename}` (no `thumbs/` segment — see §6).
- **At line 150** (the `uploadOne(BUCKET, thumbPath, …)` site), replace the single call with a parallel pair, **best-effort on the public side**:
  ```ts
  const publicThumbPath = buildPublicThumbPath(businessSlug, galleryId, hash, filename)
  const [/* primary */, publicOk] = await Promise.all([
    uploadOne(BUCKET, thumbPath, thumb.blob, 'image/jpeg'),     // mandatory
    uploadOne(THUMB_PUBLIC_BUCKET, publicThumbPath, thumb.blob, 'image/jpeg')
      .then(() => true).catch(() => false),                      // best-effort
  ])
  ```
  The primary upload still throws on failure (preserving today's semantics); the public upload's failure is captured as a boolean only.
- **At line 158** (the `record` phase) pass the new flag: add `p_public_thumb_present: publicOk` to the RPC payload.
- **`UploadResult`** (lines 27–34) gains `publicThumbPath: string | null`.

### 4.2 `record_image_upload` RPC (migration `044_dual_write_thumb.sql`, NEW)

- Add column `images.public_thumb_present BOOLEAN NOT NULL DEFAULT false`.
- Drop and recreate the function with new param `p_public_thumb_present BOOLEAN DEFAULT false`; insert it into the new column. Update the `GRANT EXECUTE` signature accordingly.
- Backfill function will set `public_thumb_present = true` after a successful copy.

### 4.3 Failure / retry behaviour after change

- Public bucket fails, private succeeds → row is committed with `public_thumb_present=false`. A nightly reconciler (separate Phase-4 sweep) re-tries those rows.
- Both buckets fail → behaves exactly like today (mandatory upload throws before RPC; no token burned).
- Private succeeds, public is **slow** but eventually succeeds → captured normally because we `await Promise.all`. No double-charge, no race.

---

## 5. Failure modes

| Mode | Effect | Mitigation |
|---|---|---|
| Public thumb upload fails | DB row exists with `public_thumb_present=false`; OG crawler may need to fall back to the private signed URL or the reconciler must re-upload | Reconciler edge function on a 15-min cron; falls into the same code path as the backfill copier |
| Slow uploader, parallelised dual-write doubles wall time | Acceptable: thumb is the smallest variant (~50 KB); both buckets share the same Supabase region. Empirically negligible vs. the 5–8 MB original. | Already parallelised via `Promise.all`. |
| Storage quota inflation | +~5–7% (thumbs only). Negligible at current scale. | Monitor monthly Storage report; Phase-4.7 cleanup removes private-bucket thumbs only after 4.7 sign-off. |
| Crawler caching of a 404 during the transition window | OG card stays broken even after backfill | Set `Cache-Control: public, max-age=60` on the public bucket during transition; bump to `max-age=86400` after 4.7. |
| Idempotency of public upload | `upsert: true` → safe to re-run | Already covered by `uploadOne`. |

---

## 6. Path-scheme compatibility

The private bucket uses `<slug>/<galleryId>/<thumbs|web|originals>/<file>` because all three variants live in the same bucket and need disambiguation.

The public thumbs bucket holds **only thumbs**. Two options:

- **(A) Drop the `thumbs/` segment** → `<slug>/<galleryId>/<file>`. Cleaner, smaller paths, makes intent obvious from the bucket name. Downside: any code that just swaps the bucket name has to also strip the segment.
- **(B) Mirror exactly** → `<slug>/<galleryId>/thumbs/<file>`. Trivial swap (`bucket = THUMB_PUBLIC_BUCKET`). Downside: redundant segment in a single-purpose bucket, slightly larger storage keys.

**Recommendation: (A)**. The OG endpoint and the photographer dashboard each have a single point where the path is constructed; both can use the new helper. The "trivial swap" benefit of (B) only matters if you're doing string-replace migrations elsewhere — we are not.

`og.tsx` therefore needs a small helper `publicThumbUrl(slug, galleryId, hash, filename)` that points at the new bucket and the new path scheme.

---

## 7. Photographer dashboard impact

Today: photographer's gallery view authenticates with the user JWT and reads thumbs from `gallery-images` via RLS-allowed signed URLs.

Post-Phase-4 options:

- **Stay on private bucket** for photographer views. JWT covers RLS, no UX change. **Simpler, recommended.**
- Move photographer reads to public bucket. Faster (no signed-URL roundtrip) but exposes thumbs to anyone with a URL — acceptable for marketing pages, not strictly necessary for the photographer's own admin view.

**Decision**: photographer dashboard reads stay on `gallery-images` (private). Public bucket exists for unauthenticated consumers (OG crawlers, share links, marketing previews) only.

---

## 8. Edge-function boundary

The `rekognition` edge function (separate agent's scope) reads originals from `gallery-images/<…>/originals/<…>` via the service-role key. It is **not** a client-uploaded path and does not touch the public thumbs bucket. Its dual-write story is independent and out of scope here.

The dual-write described in this document applies **only** to client-side uploads (`uploadPipeline.ts`). Any future server-side image ingestion (e.g. an admin re-import tool) must call the same RPC with the same `p_public_thumb_present` flag.

---

## 9. Migration sequence within Phase 4

| Step | Action | Owner | Reversible? |
|---|---|---|---|
| 4.2.1 | Create empty bucket `gallery-images-thumbs-public` (public read) | Storage agent | Yes (drop bucket) |
| 4.2.2 | Apply migration `044_dual_write_thumb.sql` (column + RPC) | DB agent | Yes (drop column, restore RPC) |
| 4.2.3 | Deploy `uploadPipeline.ts` change to **staging**; smoke-test 5 uploads | This agent | Yes (revert deploy) |
| 4.2.4 | Promote to production | This agent | Yes (revert deploy) |
| 4.2.5 | Run `backfill-public-thumbs` edge function until all rows have `public_thumb_present=true` | Backfill agent | Yes (idempotent re-run) |
| 4.2.6 | Verify: `SELECT count(*) FROM images WHERE public_thumb_present=false` returns 0 | This agent | n/a |
| 4.5 | Bucket flip (private `gallery-images`) becomes safe; OG endpoint switches to public bucket | Phase-4.5 owner | Yes |

---

## 10. Rollback

| Failure | Rollback |
|---|---|
| Dual-write breaks production uploads | Revert the `uploadPipeline.ts` deploy; the RPC tolerates `p_public_thumb_present=false` since it has a default. The new bucket retains orphaned thumbs but harms nothing. |
| Backfill breaks midway | Idempotent: re-run. `upsert: true` and the `public_thumb_present` flag together make it safe. |
| New bucket misconfigured (wrong public-read policy, wrong region) | Drop and recreate it. No data loss because the private bucket still holds the canonical copy. |
| Migration `044` itself fails | `DROP COLUMN public_thumb_present` and re-apply migration `043`'s RPC. |

---

## 11. Production-safety verdict

| Sub-task | Safe to start now? | Notes |
|---|---|---|
| Create empty public bucket | YES | Empty bucket is inert; nothing reads from it yet. |
| Migration `044` (column + RPC) | YES, with caveat | `public_thumb_present` defaulting to `false` means existing inserts continue to work even before the client deploy. |
| `uploadPipeline.ts` dual-write deploy | **STAGING FIRST** | Verify both buckets receive the thumb on a real upload, then promote. The RPC signature change must roll out in lockstep with the client. |
| Backfill | After dual-write is stable in prod | Otherwise the flag-flip race is awkward. |
| Bucket flip (4.5) | NOT YET | Only after 4.2.6 verification passes. |

**Net**: this document's plan is safe to begin in parallel with other Phase-4 prep. The single hard ordering constraint is: the RPC migration ships **before or with** the client deploy, never after.

---

## Files referenced

- `/Users/guysidi/gallery-flow/gallery-web/src/lib/uploadPipeline.ts` (lines 20, 64–68, 114–121, 134–178)
- `/Users/guysidi/gallery-flow/gallery-web/src/pages/Dashboard.tsx` (lines 4, 533)
- `/Users/guysidi/gallery-flow/supabase/migrations/043_token_economy.sql` (lines 127–199)
- New (planned): `supabase/migrations/044_dual_write_thumb.sql`
- New (planned): `supabase/functions/backfill-public-thumbs/index.ts`
