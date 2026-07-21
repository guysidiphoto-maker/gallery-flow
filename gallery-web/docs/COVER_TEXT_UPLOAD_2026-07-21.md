# Private opening text + private cover + >1000 upload fix (2026-07-21)

Branch `feat/gallery-cover-image`. **Not merged, not deployed. No production data modified** (audit was read-only).

## TASK 2 — the "1,000" count: root cause + fix

### Audit of the latest gallery (read-only)
Latest gallery = **"applied materials"** — id `4ff1cf86-2ac6-4e3c-874d-6b58e2eb17a9`, created 2026-07-21.

| source | count |
|---|---|
| expected (selected) | 1,165 |
| storage objects — originals | **1,000** |
| DB image rows | **1,000** |
| `image_count` column | **1,000** |
| processed (`original_ready` / uploaded) | 1,000 |
| failed / pending recorded | 0 |
| API-returned | ≤1,000 (capped) |
| dashboard-displayed | 1,000 |
| guest-visible | 1,000 |

**Not all 1,165 were uploaded.** Only 1,000 reached storage AND the database. The 165 were never uploaded (not failures — dropped before the pipeline).

### Root cause
`Dashboard.tsx handleFileUpload` → `partitionUploadFiles()` (`uploadPipeline.ts`) sliced the selection to the first `MAX_UPLOAD_BATCH = 1000` and set `truncated=true`; the handler only toasted and uploaded those 1,000. The remaining 165 were discarded.

Secondary (display) cap: three Dashboard reads used unbounded `.from('images').select()`, which PostgREST silently caps at **1,000 rows** — so even a correctly-uploaded >1000 gallery would show/operate on only 1,000, and gallery-delete would orphan storage for images 1001+.

### Fix
- `uploadPipeline.ts`: `MAX_UPLOAD_BATCH` 1000 → **5000** (a real wedding selection now uploads in one go; `uploadMany` already streams with bounded concurrency). Anything beyond 5000 still surfaces a **visible** warning — never silent.
- New `lib/fetchAllImages.ts` (`paginateAll` + `fetchAllGalleryImages`): pages past the 1000-row cap with a unique-id tiebreaker (no boundary skips/dupes). Applied to all three Dashboard reads: editor load, post-upload refresh, and `purgeStorageForGallery` (fixes orphaned storage on delete).
- Trustworthy **upload summary** toast after each batch: total selected · uploaded · failed · over-limit-dropped. Never reports plain success while anything was dropped/failed.

### Duplicate-safe re-upload (new safeguard)
`record_image_upload` inserts a row per call (no dedupe), so a naive re-upload of all 1,165 would create duplicate rows for the existing 1,000. Added a client-side pre-upload classifier (`lib/dedupeUpload.ts`) that reuses the pipeline's existing content key — `pathHash(galleryId/name/size/lastModified)`, already embedded in each stored path — to classify each selected file:
- **duplicate** — content key matches an image already in the gallery → skipped (no duplicate row).
- **review** — filename matches an existing image but the content key differs (different size/mtime) → surfaced, never auto-skipped (guards against skipping a genuinely different photo that shares a filename).
- **new** — uploaded.

A pre-upload summary modal shows new / already-exists / review / over-limit counts and lets the owner choose "upload new only" or "include review". So re-selecting all 1,165 uploads exactly the missing 165 and skips the 1,000, with zero duplicate rows. Existing images are never changed or deleted.

### Restore the missing 165 images (after deploy)
1. Deploy this branch (merge PR → Vercel).
2. Open the **"applied materials"** gallery in the dashboard editor.
3. Re-select the **same** source folder — all 1,165 files. (Selecting only the 165 also works, but you don't need to figure out which.)
4. The summary modal appears: ~1,000 "already exists (skipped)", ~165 "new". If any files show under **review** (same name, different file), inspect them — those are genuinely different from what's stored; include them only if intended.
5. Click **"upload new only"**. Exactly the missing images upload; no duplicates are created; the existing 1,000 are untouched.
6. Verify the count reaches 1,165 (the paginated read now shows the full count).

## TASK 1 — opening text on the private results screen (Moment B)
Extracted the WelcomeScreen's inline welcome-message animation into a shared `components/OpeningText.tsx` (no duplicate look) and rendered it in the personalized face-search hero. Same typography, per-word stagger, timing, RTL detection, and animation variants. Added explicit `prefers-reduced-motion` handling (reveal instantly). It mounts once when matches load, so it does not replay on view toggles/rerenders; on refresh the guest re-enters via face search and it replays — matching the public gallery's per-load behavior. Handles: no text (renders nothing), one/many/no matches, cover/no cover.

## TASK 3 — cover on the private entry screen (Moment A)
Extracted the PasswordGate cover treatment into a shared `components/CoverBackdrop.tsx` (blur + dark scrim + vignette + slow zoom, reduced-motion aware, cached-image fade fix, graceful fallback → null on load error). PasswordGate now uses it; the private face-search locked WelcomeScreen (cinematic) renders it via `gateCoverBackgroundUrl()` — an optimized 900px render (never the original; faces obscured). Falls back to the existing plain cinematic bg when no cover is set/enabled or it fails. Public cover design unchanged.

## Files
New: `src/components/OpeningText.tsx`, `src/components/CoverBackdrop.tsx`, `src/lib/fetchAllImages.ts`, `src/lib/dedupeUpload.ts`, `tests/upload-count.test.ts`, `tests/dedupe-upload.test.ts`, this doc.
Modified: `src/App.tsx` (OpeningText in welcome + Moment B; CoverBackdrop via gateCoverUrl in private welcome), `src/PasswordGate.tsx` (use CoverBackdrop), `src/lib/uploadPipeline.ts` (cap), `src/pages/Dashboard.tsx` (paginated reads + upload summary + duplicate-safe re-upload modal), `src/styles.css` (`pw-gate__cover*` → reusable `cover-backdrop*`).

## Migration
**None.** No schema/DB change. The "DB-dependent" behavior (PostgREST 1000-row cap) is covered by the boundary unit tests; there is nothing to apply to a preview branch for this work.

## Tests / results
- `tsc --noEmit` clean; `npm run build` passes.
- `tests/upload-count.test.ts` — 15/15: partition keeps all files at 999/1000/1001/1165/3000 (truncates+flags only >5000); `paginateAll` returns every row across pages at 0/14/999/1000/1001/1165/2500, correct at the exact-1000 boundary (2 page calls), and surfaces errors (no silent truncation).
- `tests/dedupe-upload.test.ts` — 9/9: re-upload 1,165 → 1,000 skipped + 165 new; upload-only-165; different photo same filename → review (not skipped); same name different folder not collapsed; interrupted+retry only re-uploads the un-stored.
- `tests/cover-image.test.ts` — 16/16 (unchanged, regression clean).
- Browser QA (real components mounted): Moment A cover backdrop (zoom-confirmed blurred/vignetted cover, faces obscured), PasswordGate regression after refactor, Moment B opening text (RTL Hebrew, correct typography/animation).

## Remaining / not covered here
- End-to-end real >1000 upload and the logged-in Dashboard count need your session — best confirmed on the Vercel preview after review (don't need thousands of uploads; ~1,050 fixtures suffice).
- Live private face-search end-to-end (camera selfie) wasn't driven in-browser; the two new components were verified in isolation and the wiring is a straight prop pass.
- Mobile: components use the same responsive CSS (clamp fonts, max-width cards) as the public welcome/gate.

## Deploy / rollback
- Deploy: merge the PR; Vercel auto-deploys `main`. **No migration, no env, no storage/policy change.**
- Rollback: revert the PR / redeploy previous. Purely client-side; nothing persisted.

## Branch / commit
Branch `feat/gallery-cover-image` — commit `fbc8bf1`.
