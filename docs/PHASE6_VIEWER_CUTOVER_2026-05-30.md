# Phase 6 — Step 5 Phase 2: Public Viewer Snapshot Cutover

**Date:** 2026-05-30
**Branch:** `feat/web-phase6-viewer-snapshot-cutover`
**Migration:** `068_gallery_get_published_snapshot.sql`
**RPC:** `gallery_get_published_snapshot(p_gallery_id uuid)`

## What this ships

Phase 6 step 5 phase 1 already writes a row into `gallery_revisions` every
time a photographer clicks Publish (via `gallery_publish()`), but the public
viewer continued to render from the live `galleries` / `gallery_sections`
tables, so any post-publish edit leaked immediately to clients.

This step flips the read path. With the cutover flag on, the public viewer
reads `delivery_settings` + `sections` from the snapshot referenced by
`galleries.published_revision_id`. The photographer can keep editing the
live gallery (rename, swap cover, reorder sections, tweak layout) without
those changes leaking — clients keep seeing the last-published state until
the next Publish writes a new revision.

## How to enable

Set the feature flag on the Vercel project for the public viewer
(`gallery-web`):

```
VITE_USE_PUBLISHED_SNAPSHOT=true
```

Then redeploy. The viewer's `loadGallery()` will detect the flag at build
time and, for every gallery with `published_revision_id IS NOT NULL`, call
`gallery_get_published_snapshot` and override the live `delivery_settings` /
`sections` with the snapshotted versions.

Default value is OFF (omitted or any value other than the literal `'true'`),
so the legacy live-read behaviour is preserved until the env var is set.

## Rollback path

Instant: remove `VITE_USE_PUBLISHED_SNAPSHOT` (or set it to `false`) on
Vercel and redeploy. The viewer falls back to reading the live row exactly
as it did before this PR. The RPC itself remains in place; nothing on the
database needs to be reverted.

The viewer also auto-falls-back to the live read whenever:

- `published_revision_id` is `NULL` (gallery never published in the
  Phase 6 era — e.g. legacy galleries before the revision rollout).
- The RPC errors or returns zero rows. Each fallback path logs a
  `console.warn('[snapshot] ...')` line for telemetry.

## Known invariant gap — images are NOT snapshotted

Only `delivery_settings` and `section_data` (the list of sections with id,
name, slug, sort_order) are frozen at publish time.

The image catalog continues to load through `gallery_get_images`, which
reads the live `images` table. Consequences:

- Photos uploaded **after** the most recent Publish are immediately visible
  to clients in the live image grid.
- Photos deleted **after** the most recent Publish disappear from clients
  immediately.
- An image whose `section_id` was reassigned post-publish will show up
  inside whatever section the snapshot still references — i.e. a section
  that may have been renamed or removed on the live side. If the snapshot
  section_id no longer matches any live image, that section reads as
  empty until the next Publish.

This trade-off is intentional for now: the primary leak we wanted to close
is layout / branding / section structure changes (the most disruptive
client-visible churn). Catalog snapshotting is a much larger change
(potentially: snapshotting per-image metadata, top-pick state, sort_order)
and is deferred to a later phase if needed.

## Call sites

- Migration: `supabase/migrations/068_gallery_get_published_snapshot.sql`
- Feature flag declared: `gallery-web/src/App.tsx` (top of file,
  `USE_PUBLISHED_SNAPSHOT` constant).
- Env var type: `gallery-web/src/vite-env.d.ts`
  (`VITE_USE_PUBLISHED_SNAPSHOT`).
- Snapshot read site: `gallery-web/src/App.tsx` inside `loadGallery(id)`,
  immediately after the `Promise.all([firstImgs, secsRes])` block.
