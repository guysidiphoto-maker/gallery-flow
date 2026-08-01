# Pixieset → piXflow migration: feasibility

Status: **SYNTHETIC PROTOTYPE** (overnight sprint 2026-07-24, QA-only, nothing
shipped). Scope: what is actually possible to migrate FROM Pixieset INTO
piXflow, honestly.

> ⚠️ **READ THIS FIRST — the current flow is a PROTOTYPE, not a product.**
> The importer described below runs **entirely in the browser tab** (jszip reads
> the whole ZIP into memory; uploads are driven by the open page). It is a
> **proof of concept for correctness and security**, validated in QA against a
> handful of small collections. It is **NOT production-ready for real
> migrations** — a studio with many galleries or multi-GB archives will hit hard
> walls (see §6 "Prototype limitations"). Do not market this as "migrate your
> whole Pixieset account." The real design that lifts these limits is a separate
> document: **PIXIESET-IMPORT-PRODUCTION-ARCHITECTURE.md** (read it before
> promising anyone a large migration).

The one-sentence truth: **there is no one-click Pixieset import.** Pixieset has
no public API and forbids unofficial endpoints, so the only clean path is a
**guided manual export** by the studio owner from their own account, which the
Import Center then turns into piXflow draft galleries. The current
implementation of that path is a **browser-only synthetic prototype**.

---

## 1. Supported today (with sources)

Everything here relies ONLY on files the owner exports from their OWN Pixieset
account through the official UI. No API, no scraping, no credentials handled by
piXflow.

- **Per-collection photo download as ZIP.** The gallery `Download` button
  produces a ZIP; on paid plans the owner can enable **Original** resolution in
  the collection's download settings. Large collections are split into several
  ZIPs automatically.
  Sources: help.pixieset.com article 115003594212 (download experience),
  115003793252 (download resolutions).
- **Studio Manager Contacts CSV export.** Columns: First Name, Last Name,
  Company, Email, Type, Address Line 1/2, City, State/Province, Zip, Country,
  Notes. Used as a reference to help the owner create/match clients.
  Source: help.pixieset.com article 35343762224141 (contacts export).
- **Per-collection auxiliary CSVs** the owner may also export: email-registration
  CSV, orders CSV, download-activity CSV. Not required by the importer, but
  available if the owner wants to reconcile.

What the Import Center does with these today:
- Parses the CSV **server-side** in a dry run (`parse_csv`), detects columns via
  case-insensitive aliasing, and **drops any password/PIN column** before
  anything is stored.
- Matches each collection's client by **normalized email (exact) → matched**;
  **name-only → ambiguous (never auto-merged)**; else **unmatched**. The owner
  resolves each row (map / create new / skip).
- Reads each ZIP **in the browser** (jszip), validates entries, auto-matches the
  ZIP filename to a collection, and uploads accepted photos through the existing
  piXflow upload pipeline into a new **draft** gallery per collection.

---

## 2. Requires the user's manual export

These cannot be automated and must be done by the owner in Pixieset first:

- Enabling **Original** download and downloading each collection ZIP (one button
  press per collection; large ones yield multiple ZIPs).
- Exporting the **Contacts CSV** from Studio Manager.
- Preparing a **collections list CSV** (Collection Name, Client Name, Client
  Email, Collection URL, Date). Pixieset has **no ready-made export of the
  collection list**, so the owner assembles it manually (e.g. copy from the
  collections screen into a sheet). The importer accepts it if a
  collection-name column is present.
- Handling **videos separately** — see limitations.

---

## 3. Requires future Pixieset cooperation or an API (NOT available)

None of this exists today; listed so nobody assumes it might:

- A **Pixieset public/read API**. There is none. The Terms of Service explicitly
  prohibit use of "undocumented, unofficial, or reverse-engineered endpoints,"
  and the CDN blocks scraping. piXflow does not attempt any of this.
  Source: pixieset.com/terms.
- An **account-wide export** or a **documented collection-list CSV**. Neither
  exists; the collection list is manual (section 2).
- **Bulk video export.** Videos download **one at a time**, are plan-capped, and
  may be **transcoded** rather than original. No batch path.
  Source: help.pixieset.com article 115003793252.
- The **Lightroom plugin** as a photo source. It syncs gallery **structure/
  names** only; it cannot pull the photos themselves.
  Source: help.pixieset.com article 115003009832.
- Guaranteed **retention** of collections for later export. Pixieset applies
  retention/expiry rules; owners should export before anything lapses.
  Source: help.pixieset.com article 115002975012.

---

## 4. What the SYNTHETIC PROTOTYPE importer supports now

Everything below is **browser-driven** and has only been exercised in QA on
small archives. Treat it as a demonstration of the mapping/validation/state
machine, not as a migration tool ready for a real studio's back catalogue.

- Five-step wizard: explain → CSV dry-run + mapping → ZIP mapping → run →
  report. RTL/LTR, he+en, empty/loading/error states per step.
- Server-side CSV dry run with password-column dropping and header aliasing.
- Client matching (email-exact / name-ambiguous / unmatched) with owner
  resolution and inline client creation (reuses `create_client`).
- Client-side ZIP reading (jszip) with the full validator set, filename →
  collection auto-match, and manual re-mapping.
- Per-collection run through the existing upload pipeline into **draft**
  galleries, each stamped with provenance
  `delivery_settings.importSource = { provider:'pixieset', url, jobId }`.
- Content-hash duplicate **skip** within a run; pause / resume / cancel;
  checkpointing so a refresh resumes where it stopped; retry-failed.
- Report with per-collection imported/skipped/failed counts and failure detail.

---

## 5. Security considerations

The owner's own export is still treated as **untrusted input**. Enforced in one
place (`server/importer.ts`, mirrored for the browser in `zipRules.ts`; parity
proven by `tests/import-center.test.ts`):

- **Path traversal:** entries with `..`, absolute paths, drive letters, or
  backslashes are rejected; only the basename is ever kept.
- **ZIP bomb:** uncompressed/compressed ratio > 100x → the file is rejected on
  metadata BEFORE its bytes are inflated. Per-file 40MB cap; 10GB per-job cap.
- **MIME/extension allowlist:** JPG/PNG/WebP only; anything else rejected. A
  real-size re-check runs after extraction (metadata could lie).
- **Depth cap:** at most 3 folder levels inside a ZIP (handles flat AND
  one-level "set" subfolders, the undocumented Pixieset layouts); deeper nesting
  rejected.
- **`__MACOSX` / dotfiles / `Thumbs.db` / `desktop.ini`** are skipped.
- **Password dropping:** any password/passcode/PIN column is dropped server-side
  and flagged in the report; its VALUE is never read, stored, or echoed.
- **No signed-URL exposure:** photos flow through the existing upload pipeline;
  the importer never mints or returns storage URLs to untrusted callers.
- **Service-role server-only:** the import tables have no client write policies;
  all writes go through `/api/import-center` behind `requireOwnerBusiness`
  (JWT + business resolved from `auth.uid()`, never the request body), audited.
- **Idempotent transitions:** re-issuing an action for the current state is a
  no-op success, so retries can't corrupt job state. `cancel` never deletes
  already-uploaded images or galleries.

---

## 6. Prototype limitations (why this is NOT production-ready)

These are **structural** limits of the browser-only design, not bugs. They
cannot be tuned away; removing them requires the server/worker architecture in
`PIXIESET-IMPORT-PRODUCTION-ARCHITECTURE.md`.

- **The browser tab must stay open for the ENTIRE run.** The whole engine
  (`importApi.runCollection`) executes in the page: extract → hash → dedupe →
  upload → checkpoint. Close the tab, sleep the laptop, or lose Wi-Fi and the
  run stops. A migration of hundreds of galleries could mean the photographer
  babysitting a tab for hours. This is the single biggest reason it is a
  prototype.
- **Whole-ZIP-in-memory (jszip is NOT streaming).** `JSZip.loadAsync(file)`
  materializes the entire archive in RAM before any entry is read. Practical
  cap is **~2GB** (`ZIP_FILE_MAX_BYTES`), enforced with an honest error. A
  full-resolution wedding collection can exceed that; the owner must pre-split
  in Pixieset. There is no chunked/streaming inflate of the archive itself
  (only the post-extract upload is chunked, 8 files at a time).
- **No cross-device continuation.** The run is owned by the tab, not the server.
  You cannot start on a laptop and finish on a desktop, or hand the job to a
  colleague. Job STATE lives in `import_jobs`, but the WORK (unzip + upload)
  does not — nothing server-side can pick it up.
- **Progress survives a refresh only at checkpoint granularity.** Per-collection
  and per-chunk checkpoints (`import_files` + `import_jobs.checkpoint`) let a
  reload resume at the last completed chunk — but the in-flight chunk and the
  in-memory unzipped archive are lost, and the owner must re-select the same
  ZIP file (the browser can't re-read a `File` after reload).
- **Single-threaded, single-tab.** One page, bounded concurrency (~4–8 uploads
  in flight); no parallelism across galleries, no worker pool, no CPU offload.
  Canvas/hash work competes with the UI thread.
- **No server-side processing.** piXflow never touches the archive: there is no
  server unzip, no worker, no queue that owns the migration. `/api/import-center`
  only records bookkeeping and drives the job state machine; every heavy byte
  moves through the open browser.

## 6b. Other known limitations (content/format, independent of the above)

- **Videos** are out of scope (Pixieset one-at-a-time, capped, possibly
  transcoded); handle manually.
- **40MB per-file cap + JPG/PNG/WebP only.** `MAX_UPLOAD_BYTES` /
  `ZIP_ENTRY_MAX_BYTES` reject anything over 40MB, and the pipeline rejects
  HEIC and all RAW/TIFF. Pixieset "Original" downloads can legitimately be
  larger than 40MB and can be RAW/TIFF — those photos will be **silently
  rejected** by this importer. See the "File size + format reality check"
  section of `PIXIESET-IMPORT-PRODUCTION-ARCHITECTURE.md` for the exact
  constants, the recommended new limit, and the RAW/TIFF gap. This is a
  **truthfulness issue**: "migrate your originals" is only true for
  ≤40MB JPEG/PNG/WebP originals today.
- **Multi-part ZIPs** ("Name-1.zip", "Name-2.zip") are auto-matched to the same
  collection by normalized stem, but the owner uploads each part; there is no
  cross-part manifest from Pixieset to verify completeness.
- **Undocumented internal ZIP folder layout** — handled defensively (flat and
  one-level subfolders both accepted), but not formally specified by Pixieset.
- **EXIF survival in resized downloads is unknown.** Originals preserve
  everything; resized downloads may strip metadata. Prefer Original resolution.
- **Quota/token balance** is enforced during the actual uploads (inside the
  existing pipeline via `record_image_upload`, which raises `insufficient_tokens`
  and has no byte-size cap of its own), not pre-flighted on this surface; the
  estimate shown is the client-computed ZIP total.

---

## 7. Recommended next iteration

- **Streaming unzip via `fflate`** to lift the ~2GB in-memory ceiling and reduce
  peak memory (chunked inflate instead of whole-archive load).
- **Background / queue jobs** so a large migration survives tab close (today the
  run is browser-driven with checkpointing; a server/worker queue would make it
  fully resumable without the tab).
- **TUS resumable uploads** for large originals over flaky connections.
- **Dedupe by content-hash across galleries** (not only within a run), using the
  `import_files.content_hash` ledger as a cross-run duplicate index.
- **Implement `replace` / `create_copy`** duplicate policies (currently disabled
  with honest labels).
