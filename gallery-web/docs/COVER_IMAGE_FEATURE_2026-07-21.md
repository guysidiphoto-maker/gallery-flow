# Gallery Cover Image — Public + Private (2026-07-21)

Branch: `feat/gallery-cover-image` (off `feat/admin-user-management`). **Nothing applied to prod. Not deployed.**

## What was built

Every gallery owner can now decide whether a gallery has a cover, independent of
public/private:

- **Disable** the cover entirely (toggle).
- **Choose an existing gallery photo** as the cover (existing 48-grid picker, kept).
- **Upload a separate cover** that is used ONLY as the cover and does **not**
  appear as a gallery photo (no `images` row, no token consumed).
- **Replace / remove** the cover (replacing/removing a custom upload deletes the
  old storage object; a gallery photo used as a cover is never deleted).
- **Preview** desktop-public / mobile-public / private-entry side by side.
- Cover is controlled **independently of the privacy setting**.

**Private entry (password gate + private face-search welcome):** when a cover is
enabled it renders as a cinematic background — strong elegant blur, dark scrim,
soft vignette, slow zoom (disabled under `prefers-reduced-motion`), reduced
brightness. The card stays dominant and text keeps strong contrast. The gate
loads a small low-res render (900px, q45) so it's fast on mobile **and** faces
can't be recognised before unlock. Broken-image → graceful flat-dark fallback.

**Public hero:** unchanged treatment (lighter overlay), now gated by the enable
toggle and supporting a custom-uploaded path. Disabled → current no-cover
behavior (no empty placeholder).

## Data model (JSONB, no new columns)

All cover config stays in `galleries.delivery_settings` (matches existing
`coverImageId/coverImageUrl/coverImagePath/coverCrop`). New keys:

| key | type | meaning |
|-----|------|---------|
| `coverEnabled` | boolean | explicit show/hide, independent of privacy |
| `coverSource` | `none` \| `gallery_asset` \| `custom_upload` | where the cover comes from |

Reused existing: `coverImagePath` (storage path), `coverImageUrl` (stable public
URL), `coverImageId` (gallery asset), `coverCrop` (focal point/zoom).

**Backward compatible:** legacy galleries have neither new key. `readCoverConfig`
treats `coverEnabled === undefined` as ON iff a cover was already chosen, so
existing galleries look exactly the same. Verified by `tests/cover-image.test.ts`.

## Storage & security

- Custom covers upload to `gallery-images` at `{slug}/{galleryId}/covers/{hash}_{name}.jpg`.
  The gallery id is the **2nd** path segment, so the existing storage RLS applies
  unchanged: `gallery_storage_owner_write` (owner-only write/delete) and
  `gallery_storage_public_read` (anon read only when `status='live'`).
- **No new bucket, no new storage policy, no new API endpoint.** Upload/delete go
  through the browser Supabase client under existing RLS.
- Client-side validation reused from the photo pipeline: JPEG/PNG/WebP only,
  ≤40MB, HEIC rejected; the cover is downscaled to ≤2560px before upload.
- Delete is **guarded to `covers/` paths** so a gallery photo can never be removed
  via the cover flow.
- Originals, private-gallery protection, RLS, passwords, face search: **untouched.**
  Adding a cover does not expose originals (they remain behind the signed-URL
  enforcement flag) and does not change any privacy behavior.

## Migration

`supabase/migrations/086_cover_settings_allowlist.sql` — a single
`CREATE OR REPLACE` of `_validate_delivery_settings_patch` that reproduces the
**currently-deployed** function verbatim (read live from prod) and adds only
`coverEnabled` (bool) + `coverSource` (enum) to the allowlist. Idempotent.
Rollback: `086_cover_settings_allowlist_rollback.sql`.

Confirmed against prod (read-only) that both keys currently reject as
`unknown_key`, so **the migration must be applied before the frontend deploy**
or cover saves fail validation.

## Files

New:
- `supabase/migrations/086_cover_settings_allowlist.sql` (+ `_rollback.sql`)
- `gallery-web/src/lib/coverImage.ts` — resolver (`readCoverConfig`, `coverIsEnabled`, `gateCoverBackgroundUrl`)
- `gallery-web/src/lib/coverUpload.ts` — `uploadCoverImage`, `deleteCoverObject`
- `gallery-web/tests/cover-image.test.ts`
- `gallery-web/docs/COVER_IMAGE_FEATURE_2026-07-21.md` (this file)

Modified:
- `src/types.ts` — cover fields on `DeliverySettings`
- `src/lib/deliverySettingsSchema.ts` — client allowlist for the 2 keys
- `src/PasswordGate.tsx` — cover background layers + cached-image fade fix
- `src/styles.css` — `.pw-gate__cover*`, card glass, reduced-motion
- `src/App.tsx` — enable-gating + gate cover wiring
- `src/pages/Dashboard.tsx` — consolidated Cover section (toggle/source/upload/previews)
- `src/supabase.ts` — `import.meta.env?.` optional-chain (node-test importable; no runtime change under Vite)

## Testing done

- `tsc --noEmit` clean; `npm run build` passes.
- `tests/cover-image.test.ts` — 16/16 (backward-compat, disable override, source
  inference, gate URL small/low-q/disabled-aware/fallback).
- Browser visual: real `PasswordGate` with a cover — verified cover ON (cinematic
  blur/vignette/frosted card/high-contrast text; zoom-confirmed the photo is
  clearly present but obscured) and cover OFF (original flat gate, no regression).
- Caught + fixed a real bug: a cached cover finished loading before React attached
  `onLoad`, leaving it at `opacity:0` (invisible). Fixed with a ref `complete` check.

## Preview-branch DB test (done 2026-07-21)

Spun up a throwaway Supabase branch, applied migration 086 (clean on Postgres
17), and verified on real Postgres — then deleted the branch:

- Validator: `coverEnabled`+`coverSource` → valid; bad `coverSource` →
  `not_in_allowed_values`; non-bool `coverEnabled` → `expected_boolean`; a typo
  key still → `unknown_key` (drift protection intact); existing keys
  (`themeColor`, `feedLayout:'feed'`, `coverImagePath`) still valid (no regression).
- Full validate→merge round-trip across all states: **custom_upload** → persists
  `enabled:true / source:custom_upload / covers-path`; **switch to gallery_asset**
  → persists `source:gallery_asset / img_id`; **disable/remove** → `enabled:false /
  source:none / nulls`; **bad patch** → rejected, row unchanged; unrelated fields
  (`galleryTitle`) preserved throughout.

Note: the branch's from-scratch replay of the repo's `NN_` migrations failed
(the repo files aren't a clean zero-state sequence — prod was built with
timestamp migrations), so this was a targeted test of 086 + the RPC's
validate/merge semantics, which is exactly what 086 changes.

## Still needs the owner's session (frontend, not DB)

- Dashboard cover UI end-to-end in a logged-in session (Google auth): toggle,
  choose-from-gallery, drag-drop upload progress, previews, remove.
- Live custom upload → confirming it renders as hero/gate but is absent from the grid.

These are UI/session checks, not migration risks; best done by you (or via a
logged-in browser session) after deploy to staging/preview.

## Deploy

1. **Apply migration 086 to prod first** (via your normal migration path / MCP
   `apply_migration`), before the frontend goes live. Verify:
   ```sql
   select public._validate_delivery_settings_patch(
     jsonb_build_object('coverEnabled', true, 'coverSource', 'custom_upload')
   ); -- expect NULL
   ```
2. Merge `feat/gallery-cover-image` via PR (main is protected). Vercel auto-deploys
   main. No env vars, no new bucket, no storage policy changes.

## Rollback

- **Frontend:** revert the PR / redeploy previous. Old build ignores the new JSONB
  keys; galleries with a saved cover simply fall back (viewer tolerates them).
- **DB:** run `086_cover_settings_allowlist_rollback.sql`. New keys reject again;
  already-saved values stay in JSONB harmlessly.
- Order doesn't matter, but rolling back the frontend first avoids owners setting
  covers that then can't be re-saved.

## Remaining risks / edge cases

- Image-transform cost: the gate uses one `render/image` transform per gallery
  cover (cached 1yr). Bounded to private galleries with a cover; negligible.
- Private face-search welcome shows the cover through the **existing** WelcomeScreen
  blur path (not the new small-render gate URL); functionally covered, slightly
  less bandwidth-optimal for a gallery-asset cover. Can be unified later.
- Full-frame screenshots render darker than the real paint (JPEG); the zoomed
  capture is the accurate reference.
