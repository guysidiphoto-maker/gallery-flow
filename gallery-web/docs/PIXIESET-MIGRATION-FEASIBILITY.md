# Pixieset → piXflow migration: feasibility

Status: prototype (overnight sprint 2026-07-24, QA-only, nothing shipped).
Scope: what is actually possible to migrate FROM Pixieset INTO piXflow, honestly.

The one-sentence truth: **there is no one-click Pixieset import.** Pixieset has
no public API and forbids unofficial endpoints, so the only clean path is a
**guided manual export** by the studio owner from their own account, which the
Import Center then turns into piXflow draft galleries.

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

## 4. What the prototype importer supports now

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

## 6. Known limitations

- **Videos** are out of scope (Pixieset one-at-a-time, capped, possibly
  transcoded); handle manually.
- **jszip is not a streaming unzipper** — it holds the whole archive in memory,
  so ZIPs are capped at ~2GB with an honest error. Very large collections must
  be split in Pixieset (they usually are already).
- **Multi-part ZIPs** ("Name-1.zip", "Name-2.zip") are auto-matched to the same
  collection by normalized stem, but the owner uploads each part; there is no
  cross-part manifest from Pixieset to verify completeness.
- **Undocumented internal ZIP folder layout** — handled defensively (flat and
  one-level subfolders both accepted), but not formally specified by Pixieset.
- **EXIF survival in resized downloads is unknown.** Originals preserve
  everything; resized downloads may strip metadata. Prefer Original resolution.
- **Quota/token balance** is enforced during the actual uploads (inside the
  existing pipeline), not pre-flighted on this surface; the estimate shown is
  the client-computed ZIP total.

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
