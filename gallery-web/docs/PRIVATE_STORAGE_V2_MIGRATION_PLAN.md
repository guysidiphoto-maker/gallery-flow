# Private Storage v2 — Migration Plan (future migration 084)

**Status:** PLAN ONLY. Nothing here is implemented or applied. This is the
dedicated follow-up architecture project for closing the public-bucket exposure
(see "P0 exposure" below). It uses a **blue-green** approach — a NEW private
bucket alongside the existing public one — **never an in-place bucket flip**.

> **Explicitly out of scope for the current billing PR (feat/face-index-billing-model):**
> making `gallery-images` private, revoking direct-write RLS, migrating/deleting
> any of the existing objects, changing live reader URLs, or touching the Electron
> desktop uploader. The billing PR only landed the DB-safe fixes (server-
> authoritative size, path binding, orphan cleanup, per-order entitlement
> consumption) and this document.

---

## P0 exposure to record (accurate, non-euphemistic)

- `gallery-images` is a **PUBLIC** bucket and **contains originals** (12,267
  originals + 11,543 web + 11,650 thumbs = 35,573 objects at audit time).
- **Known/guessable direct object URLs bypass application-level access controls**
  — gallery password gate, private face-recognition mode, unpublished/draft
  state, and paid-access expiration are all enforced in the app, not by the
  bucket. Anyone with a path can fetch the bytes over the public CDN URL.
- Content-addressed paths (`slug/gallery/kind/hash_name`) **reduce casual
  discovery but are NOT authorization.**
- **The storage cap is NOT abuse-proof**: the `gallery_storage_owner_write` RLS
  (ALL, authenticated) lets an owner write objects directly to their galleries'
  paths, bypassing `record_image_upload` accounting.
- **Bucket LISTING permission must be confirmed separately** — if anon/authenticated
  can `list()` the bucket, discovery is trivial, not just guessable. (Action:
  audit `storage.objects` SELECT policies + bucket `public` semantics before v2.)
- Do **not** describe the current storage architecture as private or abuse-proof
  anywhere (marketing, docs, or support).

---

## Writer inventory (every legitimate writer — must be migrated before deny)

| Writer | Location | Bucket(s) | Notes |
|---|---|---|---|
| **Web uploader** | `gallery-web/src/lib/uploadPipeline.ts` | gallery-images (originals; dual-writes thumbs where applicable) | primary web path; already calls `record_image_upload` |
| **Electron desktop uploader** | `src/renderer/src/lib/uploadQueue.ts`, `cloudUpload.ts` | gallery-images (originals, covers, videos) | **separate release cadence — a released build is a hard dependency before any write-deny** |
| **Desktop questionnaire images** | `src/renderer/src/components/QuestionnaireBuilder.tsx` | gallery-images (+ constructs public URL) | must also move to signed reads |
| **Thumb backfill** | `supabase/functions/backfill-public-thumbs/index.ts` | gallery-images-thumbs-public | service_role edge fn |
| **Story videos** | `gallery-web/src/pages/Dashboard.tsx`, `src/renderer/.../cloudUpload.ts` | gallery-stories | not gallery-images originals |
| **Brand kit** | `gallery-web/src/pages/BrandKit.tsx` | business-brand | unrelated bucket |
| **Deleters** | uploadPipeline (orphan `remove`), Dashboard (image/story delete), desktop cloudUpload | gallery-images / gallery-stories | keep working under owner/server flow |

## Reader inventory (every reader — must support signed/private before privatize)

| Reader | Location | How it reads today | v2 change |
|---|---|---|---|
| **Live viewer images** | `gallery-web/src/supabase.ts` `renderUrl` → `/render/image/public/...` | public render transform | signed render URL (`/render/image/sign/...`) or server proxy |
| **Signed image component** | `SignedImg.tsx`, `useSignedSrc.ts` | render/image/public | dual-mode (legacy public + private signed) |
| **Rekognition indexing** | `supabase/functions/rekognition/index.ts:251` | builds `object/public/gallery-images/...` and `fetch()` | download via **service client** or short-lived signed URL (no public URL) |
| **Share gallery** | `supabase/functions/share-gallery/index.ts:152` | public URL | signed URL |
| **Export/backup** | `gallery-web/src/lib/galleryExport.ts` | `.download()` (works private w/ auth) | verify auth path; OK on private |
| **Landing demo** | `gallery-web/src/pages/LandingPage.tsx:11` | hardcoded public object URL | move demo asset to an intentionally-public bucket |
| **Desktop questionnaire** | `QuestionnaireBuilder.tsx` | public URL | signed |

`gallery-images-thumbs-public` stays public **only** because it holds derived
thumbnails intentionally public and contains **no originals/private content**
(confirm before v2). If any private content is found there, it moves too.

---

## Compatibility matrix (must be PROVEN green before each production change)

| Flow | Public gallery | Private (face-rec) | Password-gated | Draft/unpublished | Expired paid | Owner preview |
|---|---|---|---|---|---|---|
| Viewer image load | ✓ | signed-only | signed after unlock | owner-only | denied | ✓ |
| HD download | ✓ per settings | per settings | after unlock | owner-only | denied | ✓ |
| Rekognition index | server download | server download | server download | n/a | n/a | n/a |
| Share link | ✓ | per rules | after unlock | denied | denied | n/a |
| Export/backup | owner | owner | owner | owner | owner | owner |
| Direct object URL (adversary) | (public bucket only) | **DENIED** | **DENIED** | **DENIED** | **DENIED** | **DENIED** |

Each cell must be exercised on a live/staging environment with real Storage
before the corresponding production cutover step. DB-rollback tests are not
sufficient for the Storage/reader changes.

---

## Phased design (migration 084)

**Phase A — new private bucket (additive, zero risk).**
- Create `gallery-images-private-v2` (private). Do **not** modify the public bucket.
- Add an explicit backend/version marker so a row knows where its bytes live:
  `images.storage_backend TEXT DEFAULT 'legacy-public'` (values `legacy-public` |
  `private-v2`) and/or a per-object version field.
- Make ALL readers dual-compatible: given a row, resolve legacy-public URL or a
  private signed URL based on `storage_backend`.
- Rollback: drop the empty bucket + column; nothing else touched.

**Phase B — server-authoritative upload reservations.**
- `upload_reservations` table: `reservation_id`, `user_id`, `business_id`,
  `gallery_id`, server-generated canonical `object_path` (embeds a RANDOM
  reservation id), `declared_size`, `reserved_bytes`, `mime_type`, target pool
  (`business`|`gallery`), `status` (`pending`|`finalized`|`cancelled`|`expired`),
  `created_at`, `expires_at`, `image_id`, `reason`.
- `reserve_upload(gallery, filename, mime, size)` edge fn + RPC: authenticate,
  verify gallery ownership, validate mime + max size, generate the path
  server-side, atomically reserve bytes (`used_bytes + reserved_bytes + N <=
  limit` on `business_storage` gaining a `reserved_bytes` column), return a
  **signed upload URL** for exactly that path. Client cannot choose a path.
- `finalize_upload(reservation_id)`: verify ownership + object exists at the
  reserved path + read actual server size + verify mime; create the `images` row
  exactly once (unique on reservation_id); convert reserved→used bytes; release
  unused; return the SAME `image_id` on repeated calls. If actual > reserved,
  atomically reserve the diff or reject+delete+release. Guarded state machine:
  `pending→finalized|cancelled|expired`; finalized is terminal; cancelled/expired
  cannot finalize.
- `cancel_upload_reservation` + expiry sweep + retry-safe object deletion +
  reconciliation (reservations ↔ images ↔ storage.objects ↔ counters).

**Phase C — migrate every writer to reserve→signed-upload→finalize.** Web
uploader, **Electron desktop uploader**, thumb backfill, admin tools, story gen,
thumbnail gen, imports/recovery. Each keeps working against legacy until its new
build ships.

**Phase D — release compatible clients while legacy still works.** Ship web +
**Electron** builds using the new flow; legacy direct upload still allowed. Prove
the full compatibility matrix (public/private/password/draft/expired/owner) AND
Rekognition/download/export/share on private objects.

**Phase E — route NEW uploads to the private bucket.** New objects land in
`gallery-images-private-v2` (`storage_backend='private-v2'`); readers stay
dual-compatible; monitor failure rates before touching old objects.

**Phase F — migrate existing objects in controlled batches.** Copy legacy→private
in small batches; verify source vs dest size (+ checksum where available) + DB
reference + accessibility; update `images.storage_backend`/path ONLY after
verification; retain the legacy object through a rollback window. **Never
bulk-delete unverified originals.**

**Phase G — retire legacy (only after A–F complete + explicit approval).** Deny
new direct writes to the legacy bucket; remove public reads; monitor; retire the
legacy bucket only after explicit sign-off and a full rollback window.

---

## Rollout gates (all must be green before the next production change)
1. Reservation RPCs + state machine pass all SQL tests (below).
2. New web AND Electron builds released and adopted (telemetry threshold).
3. Compatibility matrix proven live for every gallery state.
4. Rekognition/download/export/share proven on private objects.
5. Batch copy verification tooling proven on a sample with zero mismatches.

## Rollback per phase
- A: drop bucket + `storage_backend` column.
- B: drop `upload_reservations` + RPCs; `business_storage.reserved_bytes` → 0.
- C/D: revert client builds; legacy upload path still present.
- E: route new uploads back to legacy; readers already dual-mode.
- F: DB references still point at legacy for un-verified rows; delete only the
  new copies; legacy retained.
- G: re-enable public read + direct write; readers dual-mode still resolve legacy.

## Migration progress tracking
`SELECT storage_backend, count(*) FROM images GROUP BY 1;` plus a
`storage_migration_batches` table (batch id, range, copied, verified, mismatches,
started/finished). Dashboards: % migrated, mismatch count (must be 0), reader
error rate by backend.

## Cost estimate
- **Cleanup / expiry sweep:** Supabase **`pg_cron`** (bundled, **no new paid
  service**) OR a Supabase Scheduled Edge Function (bundled). **No external infra.**
- **Object copy (Phase F):** Storage API copy within the same project; egress is
  within the existing plan. No new paid service. (If a very large one-shot copy
  risks egress overage, batch it — already required.)
- **If any step is later found to need a NEW paid service or external
  infrastructure: STOP and present the cost before creating it.**

## Desktop release dependency
The Electron app (`src/renderer/`) is a first-class uploader AND reader.
**Denying direct writes or privatizing the bucket before a migrated desktop build
is released and adopted will break the desktop application.** Phase G is gated on
desktop adoption telemetry.

## Orphan cleanup strategy
- Expired `pending` reservations → delete the (possibly-partial) object, release
  reserved bytes exactly once, mark `expired`. Retry-safe: deletion failures are
  re-queued; bytes release is idempotent (guarded by status transition).
- Periodic reconciliation: objects with no `images`/reservation row → review +
  remove (the QA doc's orphan query, extended per-backend).

## Monitoring & incident response
- Monitor: reservation finalize failure rate, orphan count, storage-counter drift
  (reconciliation = 0), reader 4xx/5xx by backend, Rekognition download failures,
  signed-URL error rate.
- Incident: if signed reads fail post-Phase-E, readers fall back to legacy
  (dual-mode) — no viewer outage. If reservation finalize breaks, uploads fail
  closed (no un-metered objects). Roll back the offending phase per the table.

## Proof required before each production change
- Phase A/B: SQL + RLS tests green; no prod objects touched.
- Phase C/D: live matrix proof (every gallery state) + client builds released.
- Phase E: new-upload smoke on private bucket + reader dual-mode proof.
- Phase F: per-batch verification (size/checksum/DB-ref/accessibility) = 0 mismatch.
- Phase G: explicit human approval + full rollback window elapsed.

---

## Required SQL / RLS / integration tests (for 084, when built)
Storage reservations: concurrent-at-limit; over-limit; actual<reserved;
actual>reserved with capacity; actual>reserved without capacity; duplicate
finalize; cancel twice; finalize-after-cancel; finalize-after-expiry; cleanup
retry; abandoned upload; missing object; wrong path; wrong owner/business/gallery;
unsupported MIME; oversized; counter reconciliation; gallery-delete with pending
reservations; one-time vs subscription pool; refund/expiry while pending.
Storage access: anon direct upload denied; authenticated arbitrary direct upload
denied; signed reserved upload succeeds; cross-business overwrite denied; draft/
password/expired original direct URL denied; live-gallery view works; owner
dashboard works; Rekognition downloads; desktop uploader works through new flow.
