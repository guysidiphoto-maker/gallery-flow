# Pixieset import: production architecture

Status: **design document** (2026-07-24). Nothing here is built.
Companion to `PIXIESET-MIGRATION-FEASIBILITY.md`, which describes the current
**browser-only synthetic prototype** and its structural limits.

## Why this document exists

The shipped prototype (see feasibility §6 "Prototype limitations") runs the
entire migration inside one open browser tab: `JSZip.loadAsync()` loads the
whole archive into RAM (~2GB cap), and `importApi.runCollection` extracts →
hashes → uploads → checkpoints from the page. That is fine for a demo of a
handful of small collections. It is **not** what you need to migrate a real
studio: many galleries, some multi-GB, over hours, without the photographer
babysitting a tab.

This document specifies the real architecture and maps every piece onto the
**existing Pixflow stack** (Supabase Storage + Postgres, Vercel functions, the
`import_*` tables from migration `099_import_center.sql`, the existing
`uploadPipeline`, and the pure validators in `server/importer.ts`). It ends with
a **File size + format reality check** (Task 3): the 40MB-per-file limit is
verified against real photography and found to silently reject legitimate
high-resolution originals, with an exact `file:line` fix.

The design goal in one line: **the browser hands the server a job and can then
close.** Everything heavy is server/worker owned and resumable from any device.

---

## 0. What already exists and is reusable (do NOT rebuild)

| Piece | Where | Reuse as-is? |
|---|---|---|
| `import_sources / import_jobs / import_collections / import_files` tables, RLS (owner SELECT only, service-role writes) | `supabase/migrations/099_import_center.sql` | **Yes** — schema already supports jobs, per-collection mapping, per-file bookkeeping, checkpoints, content-hash dedupe index. |
| Job state machine (`draft→dry_run→ready→running⇄paused→completed/failed/cancelled`), idempotent transitions | `server/importer.ts` `transitionJob` | **Yes** — same machine, just driven by a worker instead of the tab. |
| CSV parse / header aliasing / client matching / password-column dropping | `server/importer.ts` (`parseCsv`, `mapCollectionsCsv`, `matchClient`, `isPasswordHeader`) | **Yes** — pure, offline-testable, no change. |
| ZIP entry validation (traversal, bomb ratio, depth, allowlist, size cap) | `server/importer.ts` `validateZipEntry` / `summarizeZipEntries` | **Yes** — runs identically in a worker; it is pure metadata logic. |
| Content hashing (SHA-256) for dedupe | `server/importer.ts` `sha256HexBytes` | **Yes** — server-side already exists. |
| Owner-auth + audit + rate-limit + multi-action endpoint | `api/import-center.ts` (`requireOwnerBusiness`, `appendAudit`, `withinRateLimit`) | **Yes** — extend with new actions; keep the security contract. |
| Data layer / API client | `src/components/importer/importApi.ts` (`createJob`, `startJob`, `jobStatus`, `reportCollectionProgress`, …) | **Partly** — keep the job/status calls; retire the in-browser `runCollection`/`listZipEntries` run engine. |
| Upload record + token consumption (atomic) | `record_image_upload()` RPC (migration `043_token_economy.sql`, updated in `075`) | **Yes** — the worker calls the SAME RPC per file, preserving token accounting. |

The net rebuild is: **who moves the bytes** (worker, not tab) and **how bytes
arrive** (resumable upload to storage + server-side streaming unzip). The
orchestration schema, validators, matching, dedupe, and token accounting are
already correct.

---

## 1. Target architecture (end state)

```
Photographer (browser)                Vercel functions              Worker (server-side)         Supabase
─────────────────────                 ────────────────              ────────────────────         ────────
 1. create job ───────────────────▶  /api/import-center            
    (existing create_job)             create_job → import_jobs
 2. CSV dry-run ──────────────────▶  parse_csv (existing)          
                                      → import_collections
 3. resumable upload of each ZIP ─▶  TUS endpoint / Supabase        
    (tus-js-client, survives           Storage resumable upload ──────────────────────────────▶ import-archives bucket
    refresh + network drops)                                                                     (private, temp)
 4. enqueue ──────────────────────▶  start_job → job 'running'      
                                      + queue message  ───────────▶ dequeue job
    ── browser may now CLOSE ──                                     stream-unzip archive  ◀────── read from storage
                                                                    validateZipEntry (pure)
                                                                    per file:
                                                                      hash → dedupe (import_files)
                                                                      quota check
                                                                      upload derived/original ──▶ gallery-images bucket
                                                                      record_image_upload() RPC ─▶ tokens + images row
                                                                    checkpoint per collection ──▶ import_jobs.checkpoint
 5. poll job_status ──────────────▶  job_status (existing)          
    (any device, any time)            ← reads import_jobs/_files                                  cleanup temp archive
```

The browser's only heavy job is a **resumable upload of the archive to storage**.
Once that is done and the job is enqueued, the tab is disposable.

---

## 2. Component-by-component design

### 2.1 Multipart / resumable uploads (TUS → Supabase Storage)

**Problem it solves:** the prototype makes the browser hold the ZIP in memory
and drip photos out one by one; a dropped connection or closed tab loses
everything. **We instead upload the raw archive to storage, resumably.**

- Supabase Storage natively supports the **TUS resumable upload protocol**
  (`/storage/v1/upload/resumable`). Use `tus-js-client` in the browser.
  Chunk size 6MB+ (Supabase requires ≥6MB except the final chunk).
- Target a **private, temporary bucket** `import-archives` (new;
  service-role + owner-scoped, NOT public). Object key:
  `{business_id}/{job_id}/{sourceZipName}`.
- TUS gives us: pause/resume, retry of only the failed chunk, and — critically —
  **survival across a browser refresh** (tus-js-client persists the upload URL +
  offset in `localStorage`; re-opening the page resumes the same upload). This
  is the first limitation from feasibility §6 that disappears.
- For very large single archives, TUS is the ceiling-lifter that replaces the
  ~2GB jszip in-memory cap: the browser never inflates the archive, it just
  streams bytes to storage.
- **Fallback for owners who can't produce a single ZIP:** allow uploading loose
  originals (still resumable, still to `import-archives/{job}/loose/…`); the
  worker treats a "loose" job as a pre-extracted archive.

### 2.2 Server-side / worker-based archive processing (NOT the browser)

**Problem it solves:** feasibility §6 "the browser tab must stay open" and
"single-threaded, no server-side processing."

- A **worker** (not a Vercel request handler — see 2.4 for why) reads the
  archive from `import-archives`, validates and extracts it, and performs the
  per-file pipeline. The browser is out of the loop.
- The worker reuses the EXISTING pure logic verbatim: `validateZipEntry` /
  `summarizeZipEntries` for the metadata gate, `sha256HexBytes` for dedupe,
  `sanitizeImportFilename` for names. Same rules, same tests
  (`tests/import-center.test.ts`), no security regression.
- Per accepted file the worker: (a) checks the dedupe ledger, (b) checks quota,
  (c) uploads the original (and/or lets the on-the-fly transform serve derived
  sizes, exactly like `uploadPipeline.uploadOneImage`), (d) calls
  `record_image_upload()` so **token accounting is identical to a normal
  upload**, (e) writes `import_files` + updates `import_collections.stats` +
  `import_jobs.checkpoint`.

**Where the worker can run on this stack (pick one):**
- **Supabase Edge Function** invoked by the queue / pg_cron. Good: same project,
  service-role, close to storage. Watch the per-invocation wall-clock limit —
  design the worker to process a **bounded slice** (N files or one collection)
  per invocation and re-enqueue itself; the job state machine already supports
  `running` re-entry idempotently.
- **A dedicated long-running worker** (a small container / VM / Railway / Fly
  process) polling the queue. Best for multi-GB archives and true streaming; no
  serverless wall-clock ceiling. Recommended if migrations are a real product.
- **NOT a plain Vercel function** for the extraction itself: `maxDuration = 30`
  today in `api/import-center.ts`; even Fluid/long functions are the wrong tool
  for an hours-long streaming unzip. Vercel functions stay the **control plane**
  (create/enqueue/status), never the data plane.

### 2.3 Streaming extraction (never whole-archive in memory)

**Problem it solves:** feasibility §6 "whole-ZIP-in-memory (jszip is NOT
streaming)" and the ~2GB cap.

- Replace `JSZip.loadAsync(wholeFile)` with a **streaming unzip** in the worker:
  `fflate`'s `Unzip`/`AsyncUnzip` (streaming inflate) or `unzip-stream`, fed by
  a Node/Deno readable stream from Supabase Storage (range/stream download).
  Entries are yielded one at a time; only the current entry's bytes are ever in
  memory. There is no whole-archive load, so the ~2GB ceiling is gone — an
  archive is bounded by storage, not RAM.
- Keep the **metadata-first gate**: read the ZIP central directory (sizes +
  paths) and run `summarizeZipEntries` BEFORE inflating any bytes, so ZIP bombs
  are still rejected on metadata (identical to the prototype's defense).
- Per-entry, stream to a bounded temp file / buffer, re-check the **real**
  inflated size against the per-file cap (defense in depth — metadata can lie,
  exactly as `runCollection` does today), hash, then upload.

### 2.4 Persistent job queue (pg-based or Supabase Queue)

**Problem it solves:** feasibility §6 "no server-side processing / no queue that
owns the migration."

- Add a durable queue so a job survives restarts and is owned by the server:
  - **Supabase Queues (pgmq)** — a Postgres-native message queue in the same
    project. Enqueue `{ job_id, business_id }` on `start_job`; the worker
    reads/acks messages. Visibility timeout gives at-least-once + retry.
  - **or a plain pg-based queue**: a `import_job_queue` table with
    `SELECT … FOR UPDATE SKIP LOCKED` claim semantics + `pg_cron` to poke the
    worker. Zero new infra, uses the DB we already have.
- **Idempotency is already handled** by `transitionJob` (re-issuing `start`
  while `running` is a no-op success) and by `import_files` bookkeeping (a file
  recorded `uploaded` is skipped on re-run). So at-least-once delivery is safe:
  a re-delivered message just resumes from the checkpoint.
- The queue is what makes the job **server-owned**: the tab enqueues once and is
  no longer required.

### 2.5 Storage quota checks BEFORE writes

**Problem it solves:** feasibility §6b "quota/token balance is enforced during
uploads, not pre-flighted"; today a huge migration can burn through tokens
mid-run before failing.

- Two checks, both server-side in the worker:
  1. **Pre-flight (advisory):** before starting a collection, sum the accepted
     `import_files.size_bytes` (already computed from the ZIP listing) and
     compare against the business's remaining token/storage budget. Surface a
     clear "this migration needs ~N tokens, you have M" BEFORE any write, in the
     dry-run/report. (No cheap balance read exists on the current surface; add a
     read of the token balance table used by `record_image_upload`.)
  2. **Hard gate (authoritative):** keep `record_image_upload()` as the atomic
     enforcement point — it already raises `insufficient_tokens` and consumes
     the token in the same transaction as the images row. The worker treats that
     exception as a graceful stop: mark remaining files `pending`, pause the job
     (state machine supports `running→paused`), and report "out of tokens,
     resume after top-up." No partial corruption.

### 2.6 Per-gallery checkpoints (already in the schema)

**Problem it solves:** feasibility §6 "progress survives a refresh only at
checkpoint granularity" — in production, checkpoints become the resume backbone,
not a browser convenience.

- `import_collections.status` (`pending→importing→imported/skipped/failed`) is
  the per-gallery checkpoint. The worker advances it as it finishes each
  collection.
- `import_jobs.checkpoint` (jsonb, already present) holds
  `{ [collectionId]: { status, uploaded, skipped_duplicate, failed, updated_at } }`
  — exactly what `update_collection_progress` writes today. The worker writes
  the same shape after each chunk/collection.
- **Resume rule:** on (re)dequeue, the worker skips collections whose status is
  terminal, and within an in-progress collection skips files already recorded
  `uploaded` in `import_files`. This is the same resume logic
  `runCollection` uses (`alreadyUploadedNames`), moved server-side.

### 2.7 Retry failed files only (already in the schema)

**Problem it solves:** re-running a whole migration to recover a few network
blips.

- `import_files.status` distinguishes `uploaded / skipped_duplicate / failed /
  pending`. The existing `retry_failed` action already flips failed files back
  to `pending` and the collection to `importing`. In production the worker
  simply re-processes `pending`/`failed` files, never the `uploaded` ones. No
  new schema.

### 2.8 Duplicate detection (content hash — already stubbed)

- `import_files.content_hash` (SHA-256 hex) plus the partial index
  `ix_import_files_content_hash (business_id, content_hash)` from migration 099
  is a ready-made **cross-run duplicate ledger**. The prototype only dedupes
  within a single run's in-memory `knownHashes` set; the worker should query the
  index so a photo already imported in an EARLIER job is skipped too. Digest is
  computed identically on both sides (`sha256HexBytes` server /
  `crypto.subtle` browser), so hashes are comparable.

### 2.9 Safe temp cleanup

- After a job reaches a terminal state (`completed`/`cancelled`), delete
  `import-archives/{business_id}/{job_id}/…`. Belt-and-suspenders: a scheduled
  `pg_cron` sweep removes archive objects for jobs terminal > 24h, so a crashed
  worker never leaks originals. Cleanup NEVER touches `gallery-images` (the real
  imported photos) — same safety invariant as `cancel_job` today ("never deletes
  uploaded images").

### 2.10 Progress that survives a browser refresh

- Job state is 100% in the DB (`import_jobs` + `import_collections` +
  `import_files`), owner-readable via existing RLS. The browser is a **poller**:
  it calls the existing `job_status` action (already implemented, returns job +
  collections + optional files) on an interval. Refresh, reopen, new tab — the
  UI reconstructs from `job_status`. Nothing about progress lives in the tab.

### 2.11 Import continuation from another device

- Because the job is **server-owned** (queue + worker) and its state is in the
  DB, ANY authenticated owner device resumes simply by opening the Import Center
  and polling `job_status`. Start the archive upload on a laptop, watch it finish
  from a phone. The worker does not care which device is watching. This directly
  removes feasibility §6 "no cross-device continuation."

### 2.12 Explicit archive size + file-count limits

Production still needs honest caps (abuse + cost control), but far higher than
the prototype's memory-bound ones:

- **Per archive:** bounded by the temp bucket policy, e.g. 50–100GB (storage,
  not RAM — the ~2GB jszip cap is retired). Enforce via a bucket
  `file_size_limit` on `import-archives` and reject oversize before enqueue.
- **Per job:** keep a total-bytes ceiling (the prototype's
  `JOB_UNCOMPRESSED_MAX_BYTES = 10GB` is a reasonable starting `overJobCap`,
  raise per plan).
- **Per file:** raise the 40MB cap — see the reality check below.
- **File count:** cap accepted files per job (e.g. 100k) so `import_files`
  doesn't balloon unbounded; reflect it in the dry-run report.

### 2.13 No dependence on keeping the browser tab open

The sum of 2.1 (resumable archive upload) + 2.4 (queue) + 2.2 (worker) +
2.10/2.11 (DB-backed polling from any device) means: **once the archive is
uploaded and the job enqueued, the browser can close.** This is the defining
difference from the prototype and the reason this is "production."

---

## 3. Phased migration path (prototype → production)

**Phase 0 — truth + limits (docs only, ~now).** Label the prototype as
synthetic (done in feasibility §6). Fix the 40MB cap (§4 below) so the prototype
stops silently dropping valid originals. No architecture change.

**Phase 1 — resumable archive upload.** Add `import-archives` private bucket +
`tus-js-client` upload of the raw ZIP to storage. Browser still runs the extract
(unchanged `runCollection`) but now against a downloaded copy, OR keep the
prototype path and just gain refresh-safe archive upload. Deliverable: archive
survives refresh/network drop. Reuses: all validators, all `import_*` tables.

**Phase 2 — server worker + streaming unzip.** Stand up the worker (Edge
Function slice-per-invocation to start, or a long-running worker). Move
extract → hash → upload → checkpoint server-side using `fflate` streaming +
existing pure validators + `record_image_upload`. Retire in-browser
`runCollection` / `listZipEntries`. Browser becomes upload-archive + poll only.
Deliverable: **tab can close.** Reuses: `transitionJob`, `validateZipEntry`,
`sha256HexBytes`, `import_files`/`checkpoint`, `record_image_upload`.

**Phase 3 — durable queue + quota pre-flight + cross-run dedupe.** Add pgmq /
pg-based queue owning jobs; add pre-flight quota estimate; query the
`content_hash` index for cross-job dedupe; add temp-archive cleanup sweep.
Deliverable: many-gallery, multi-GB, multi-device, resumable, cost-safe
migrations.

**Phase 4 — format breadth (optional, product call).** Add RAW/TIFF/HEIC ingest
(see §4 gap) so "migrate your originals" is fully true, not just for
≤40MB JPEG/PNG/WebP.

Each phase is shippable and leaves the security contract intact (owner auth,
service-role writes, password-column dropping, safe cancel, idempotent state).

---

## 4. File size + format reality check (Task 3)

This section verifies the **40MB per-file limit** and the **format allowlist**
against real professional photography, with exact constants and `file:line`.

### 4.1 The exact constants found

| Constant | Value | File:line |
|---|---|---|
| `MAX_UPLOAD_BYTES` | `40 * 1024 * 1024` (40MB) | `gallery-web/src/lib/uploadPipeline.ts:70` |
| `MAX_UPLOAD_BATCH` | `5000` | `gallery-web/src/lib/uploadPipeline.ts:71` |
| `ALLOWED_UPLOAD_MIME` | `image/jpeg, image/png, image/webp` (HEIC/HEIF explicitly rejected) | `gallery-web/src/lib/uploadPipeline.ts:73` and rejection at `:82` |
| `ZIP_ENTRY_MAX_BYTES` | `40 * 1024 * 1024` ("mirrors MAX_UPLOAD_BYTES") | `gallery-web/server/importer.ts:19` |
| `ALLOWED_IMAGE_EXTS` | `jpg, jpeg, png, webp` | `gallery-web/server/importer.ts:26` |
| `JOB_UNCOMPRESSED_MAX_BYTES` | `10 * 1024 * 1024 * 1024` (10GB/job) | `gallery-web/server/importer.ts:20` |
| `ZIP_FILE_MAX_BYTES` | `2 * 1024 * 1024 * 1024` (2GB/ZIP, in-memory jszip) | `gallery-web/server/importer.ts:23` |

The 40MB cap is enforced in **three** places, all deriving from these two
constants: up-front partition (`validateUploadFile`, `uploadPipeline.ts:85`),
the defensive gate inside `uploadMany` (`uploadPipeline.ts:290`), the ZIP
metadata gate (`validateZipEntry`, `importer.ts:395`), and the post-extraction
real-size re-check (`importApi.ts:339`). There is **no** additional cap in
`record_image_upload()` — it takes `p_original_size` (migration
`043_token_economy.sql:137`) purely for accounting and raises only
`insufficient_tokens` (`043_token_economy.sql:170`); it does not bound bytes. No
Supabase bucket `file_size_limit` on `gallery-images` was found in the
migrations either. **So 40MB is the single effective per-photo ceiling, and it
is a client/importer constant.**

### 4.2 What real Pixflow originals look like

Legitimate professional deliverables that a Pixieset "Original" export can
contain:

- **High-MP JPEGs.** A 45–61MP body (Sony a7R V 61MP, Canon R5 45MP, Nikon Z8/Z9
  45MP, Fujifilm GFX 100 102MP) at maximum-quality JPEG routinely produces
  **25–60MB** files; GFX 100-series and heavily-detailed frames exceed 60MB.
  Album-export or minimally-compressed "full quality" JPEGs push higher still.
- **TIFF** (16-bit, retouched masters, some print deliverables): **100–400MB+**
  each — far above 40MB.
- **RAW** (`.CR3` Canon, `.NEF` Nikon, `.ARW` Sony, `.RAF` Fuji, `.DNG`): a
  single high-MP RAW is **30–120MB**; Pixieset collections can be configured to
  hold originals up to ~100MB per file.
- **HEIC/HEIF**: modern camera/phone capture, often 10–30MB.

### 4.3 Does 40MB silently reject valid high-res JPEGs?

**Yes.** A maximum-quality JPEG from a 45–61MP (and especially 100MP) sensor can
exceed 40MB. `validateUploadFile` returns `'too_large'`
(`uploadPipeline.ts:85`) and the file is dropped into the rejected bucket; in
the importer, `validateZipEntry` returns `reject: 'too_large'`
(`importer.ts:395`). These are **legitimate photographer originals**, not abuse.
The current limit therefore makes the truthful claim "we import your originals"
false for high-end bodies. The cap's own comment says it "covers any real
high-res JPEG" (`uploadPipeline.ts:61`) — that assumption is wrong for
45MP-plus cameras.

### 4.4 Recommended limit + where to change it

Raise the per-file ceiling to comfortably clear a 100MP maximum-quality JPEG and
match Pixieset's ~100MB original allowance, with headroom:

- **Recommended: `MAX_UPLOAD_BYTES = 200 * 1024 * 1024` (200MB).**
  - Change at **`gallery-web/src/lib/uploadPipeline.ts:70`**
    (from `40 * 1024 * 1024`).
  - Mirror at **`gallery-web/server/importer.ts:19`** (`ZIP_ENTRY_MAX_BYTES`) so
    the importer and the direct pipeline stay in lockstep (the comment there
    already says it "mirrors MAX_UPLOAD_BYTES" — keep that invariant).
  - A conservative alternative is **100MB** (matches Pixieset's stated original
    cap) but 200MB avoids re-rejecting the largest legitimate JPEGs/16-bit
    exports; TIFF masters still won't fit either way (that's the format gap
    below, not a size tweak).
- **Guard rails to keep when raising it:** the ZIP-bomb ratio
  (`ZIP_BOMB_RATIO = 100`, `importer.ts:21`) and per-job total
  (`JOB_UNCOMPRESSED_MAX_BYTES`, `importer.ts:20`) still bound abuse, so a higher
  per-file cap doesn't open a DoS. In the browser prototype, note that larger
  per-file sizes push against the ~2GB jszip in-memory cap sooner — another
  reason the production streaming worker (§2.3) is needed before advertising
  large-original migrations.

> This is a **prototype-safe** change (a constant edit; not made here per this
> task's no-code rule). It should land in **Phase 0** so the importer stops
> silently dropping valid originals before anyone runs a real migration.

### 4.5 The RAW / TIFF / HEIC gap (and what it means for a truthful migration)

Even with a 200MB cap, the pipeline **cannot ingest RAW or TIFF or HEIC at all**:

- The allowlists are **JPEG/PNG/WebP only** (`ALLOWED_UPLOAD_MIME`,
  `uploadPipeline.ts:73`; `ALLOWED_IMAGE_EXTS`, `importer.ts:26`). HEIC/HEIF is
  **explicitly rejected** with its own reason (`uploadPipeline.ts:82`), because
  the on-the-fly transform pipeline "can't decode it yet" (comment at `:57`).
- RAW (`.CR3/.NEF/.ARW/.RAF/.DNG`) and `.TIFF` fall through to
  `'unsupported'` / `reject: 'unsupported_type'`.
- Root cause: piXflow serves every display size as a **Supabase on-the-fly
  transform of the single stored original** (`uploadPipeline.ts` header +
  `uploadOneImage`). That transform decodes JPEG/PNG/WebP; it does not decode
  RAW/TIFF/HEIC. Storing a `.CR3` would produce a gallery of broken images.

**What this means for a truthful migration claim:**

- If a photographer's Pixieset "Original" download is **RAW or TIFF or HEIC**,
  piXflow's web pipeline **cannot import those originals today** — they are
  silently rejected. "Migrate your originals from Pixieset" is only honest for
  **JPEG/PNG/WebP** originals.
- **Do not overstate.** The accurate promise today is: *"We import your
  full-resolution JPEG/PNG/WebP originals (raise the per-file cap to 200MB
  first); RAW, TIFF and HEIC originals are not yet supported."* Most Pixieset
  **client-delivery** galleries are JPEG, so this covers the common case — but a
  photographer who delivered RAW/TIFF, or who kept HEIC, will lose those files
  unless we add decode support.
- **To close the gap** (Phase 4, product decision): add server-side transcode in
  the worker — RAW via `libraw`/`dcraw`, TIFF/HEIC via `libvips`/`sharp` (sharp
  supports HEIC with libheif and TIFF natively) — normalizing to a stored master
  (e.g. high-quality JPEG or preserved TIFF) that the on-the-fly transform can
  serve. This is exactly the kind of work that belongs in the server worker
  (§2.2), not the browser, and is another reason the prototype's browser-only
  model can't be the production path.

---

## 5. Summary of key decisions

1. **Control plane vs data plane split.** Vercel functions
   (`/api/import-center`) stay the control plane (create/enqueue/status/mapping);
   a **worker** owns the data plane (unzip/hash/upload). Never run the extraction
   in a Vercel request handler.
2. **Resumable archive upload (TUS → private `import-archives` bucket)** replaces
   whole-ZIP-in-browser-memory and makes the tab disposable.
3. **Streaming unzip (`fflate`) in the worker** retires the ~2GB jszip cap.
4. **Durable queue (pgmq or pg + `SKIP LOCKED`)** makes jobs server-owned,
   retryable, and resumable from any device.
5. **Reuse 099 schema, validators, matching, dedupe index, and
   `record_image_upload`** as-is — the rebuild is only "who moves the bytes."
6. **Raise `MAX_UPLOAD_BYTES` / `ZIP_ENTRY_MAX_BYTES` from 40MB → 200MB**
   (`uploadPipeline.ts:70`, `importer.ts:19`) in Phase 0 to stop silently
   dropping valid high-res JPEG originals; add RAW/TIFF/HEIC transcode in the
   worker later for a fully truthful "migrate your originals."
