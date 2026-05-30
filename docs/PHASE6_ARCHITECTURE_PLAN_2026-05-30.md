# Phase 6 — Architecture Plan

> **Status**: DESIGN ONLY. No application code changes, no migrations applied.
> Draft DDL lives under `supabase/migrations/_phase6_drafts/` and is intentionally
> not numbered into the runnable sequence. Read this doc end-to-end before
> commenting on the SQL.
>
> **Author**: Architecture Agent (worktree `agent-ac3e371052fdb9b59`)
> **Date**: 2026-05-30
> **Scope**: `gallery-web/` SPA + `supabase/` schema. Desktop (`src/main/`,
> `src/renderer/`) is retired and not in scope.

---

## TL;DR

Five strategic concerns from the prior audit are addressed by **one coordinated
schema change**:

1. JSONB `delivery_settings` god-blob → typed columns for the load-bearing
   fields + Zod-validated patch RPC for the long tail.
2. Publish is metadata-only → introduce `gallery_revisions` (or
   `published_settings` snapshot) so live clients read frozen state.
3. No write boundary → all settings writes funnel through
   `update_gallery_settings(p_gallery_id, p_patch jsonb)` which validates against
   the Zod schema (compiled to SQL CHECK + a deny-by-default key allowlist).
4. `images.section_id` nullable → backfill into a per-gallery default section
   then `NOT NULL`, removing the lazy self-heal.
5. `status` is a free-form `TEXT` with two effectively-live values → real
   `gallery_status` enum, single canonical `'live'`, RLS rewritten to match.

Rollout is **strictly additive first, destructive last**: every migration leaves
the old shape in place behind a feature flag until the SPA cuts over. Total
effort estimate: **~22 dev-days** across two engineers, two-week sprint.

---

## Concern (a) — `delivery_settings` JSONB has ~40 fields, no schema enforcement

### What's broken now

`galleries.delivery_settings JSONB DEFAULT '{}'` is the catch-all for everything
the photographer can configure: access mode, password, watermark text, theme
color, cover image, client name, event date, feed layout, face index policy, the
welcome style, and roughly 30 more keys. There is no DB-side check on the shape,
no required keys, no type discipline. Drift is already visible in the codebase:
`allowDownloads` (legacy desktop name) and `downloadsEnabled` (web name) both
exist on the TypeScript `DeliverySettings` interface, and the toggle row at
`gallery-web/src/pages/Dashboard.tsx:3204` writes only `downloadsEnabled` while
public viewer code paths still read both. Every new toggle adds a new key
without a migration, so historical rows are missing fields and the renderer is
peppered with `?? defaultValue` fallbacks.

The Dashboard's `updateGallerySetting(key, value)` helper
(`Dashboard.tsx:729`) does `update({ delivery_settings: settings })` against an
anon-readable row with no validation, no key allowlist, and no audit trail. A
typo in a key name silently persists. Two photographers editing the same gallery
last-write-wins on the entire JSON blob.

### Target shape

Two-tier model. **Tier 1 — promoted columns** for fields with operational
consequences (RLS, server-side rendering, billing, search): `access_type`,
`client_code_hash`, `event_date`, `event_location`, `event_type`,
`face_index_enabled`, `face_privacy_mode`, `downloads_enabled`,
`download_quality`, `cover_image_id`. These get real Postgres types, CHECK
constraints, indexes where queried, and become the source of truth.

**Tier 2 — `presentation_settings JSONB`** holds the rest (typography, color,
spacing, welcome style, watermark text). Still flexible, but writes are funneled
through `update_gallery_settings(p_gallery_id uuid, p_patch jsonb)` (concern c)
which validates the patch against a Zod schema and rejects unknown keys.

`delivery_settings JSONB` stays in place during the transition as a write-only
mirror so older sessions don't break.

### Rollout

1. **Migration 002 (draft)** — add the promoted columns (NULLable initially),
   plus `presentation_settings JSONB DEFAULT '{}'`.
2. **Backfill** — single `UPDATE` statement copies values out of the JSONB blob
   using `COALESCE(delivery_settings->>'downloadsEnabled', delivery_settings->>'allowDownloads')`
   etc. Drift normalization happens here, in one auditable place.
3. **Dual-write window (≈1 week)** — `update_gallery_settings` writes BOTH the
   promoted columns and the legacy JSONB blob, so a partial rollback or a
   long-lived browser tab does not corrupt data.
4. **SPA cutover** — render code reads promoted columns; `Dashboard.tsx`
   toggles call the RPC instead of `supabase.from('galleries').update(...)`.
5. **Cleanup migration (not in this batch)** — drop `delivery_settings`
   column, drop the dual-write branch in the RPC.

**Effort: 5 dev-days** (1 backfill, 2 SPA cutover, 1 dual-write window
monitoring, 1 cleanup).

---

## Concern (b) — Publish is metadata-only

### What's broken now

`Dashboard.tsx:839` "publish" is literally `update({ status: 'live',
published_at: now })`. Every subsequent edit to `delivery_settings`,
`gallery_sections`, image `sort_order`, or `is_top_pick` is immediately visible
to the anon SELECT path because RLS only gates on `status = 'live'`. Photographer
mid-curation = client watching the gallery rearrange in real time. There is no
"published version" vs "working copy" distinction.

This also blocks two product asks already on the roadmap: (i) "revert to last
published version" and (ii) "schedule publish for tomorrow 09:00".

### Target shape

Add `gallery_revisions(id, gallery_id, snapshot jsonb, image_manifest jsonb,
created_at, created_by)`. A publish action serializes the current gallery
state — promoted columns + `presentation_settings` + ordered image list + section
tree — into a single immutable row, then sets `galleries.published_revision_id`
to point at it.

The anon read path goes through a new SQL function
`gallery_public_view(p_slug)` that joins on `published_revision_id` and returns
the SNAPSHOT, not the live row. The owner edit path continues to read/write the
live row. RLS on `galleries` for anon stays gated by status, but anon clients
never see live edits — they see the snapshot the photographer last published.

For low-cost MVP an equivalent shape is two columns on `galleries`:
`published_settings JSONB` and `published_revision_id UUID`. The revisions
table is preferable because it gives free version history.

### Rollout

1. **Migration 004 (draft)** — create `gallery_revisions` table and
   `published_revision_id` FK on `galleries`.
2. **Backfill** — for every gallery with `status = 'live'`, write one revision
   row from the current live state and point `published_revision_id` at it.
   This is idempotent and can be retried.
3. **Public view RPC** — add `gallery_public_view(p_slug)` returning the
   snapshot. SPA's public Viewer switches to this RPC.
4. **Owner publish action** — `Dashboard.tsx` "Publish" button calls
   `gallery_publish(p_gallery_id)` which writes a new revision and updates the
   pointer atomically. Republish = new revision, old revisions retained.
5. **Cleanup** — after 2 weeks of dual-read stability, remove anon SELECT
   policies on `galleries`/`images`/`gallery_sections` and require all anon
   reads to go through the snapshot RPC.

**Effort: 7 dev-days** (this is the heavy one — snapshot serialization,
two-side write paths, RLS rewrite, viewer regression testing).

---

## Concern (c) — No write-side validation boundary

### What's broken now

Every gallery setting today is a direct `supabase.from('galleries').update(...)`
from the SPA. Anon key + RLS is the only line of defense against malformed
writes. There is no Zod validation, no key allowlist, no domain assertion (e.g.
`themeColor` must be a valid hex). A malicious or buggy client can write
`{ themeColor: { evil: true } }` and the renderer crashes on the next read.

### Target shape

Single write path through a SECURITY DEFINER RPC:

```sql
update_gallery_settings(p_gallery_id uuid, p_patch jsonb) RETURNS galleries
```

The RPC enforces:

1. Caller owns the gallery (`business_id = current_business_id()`).
2. Patch keys are in the allowlist; unknown keys → `RAISE EXCEPTION`.
3. Per-key type checks (mirrors the Zod schema below). E.g. `accessType` must
   be `'public'|'password'`, `eventDate` must be ISO date, `themeColor` must
   match `^#[0-9a-f]{6}$`.
4. Promoted columns get written to their typed columns; remaining keys merge
   into `presentation_settings`.
5. Audit row written to `gallery_settings_audit` (`who/when/what/from/to`).

The Zod schema is the **source of truth at the application boundary** (the SPA
imports it before calling the RPC, so users get inline form errors), and a
generator emits the SQL CHECK constraints + the key allowlist for the RPC. Two
representations, one definition.

```ts
// gallery-web/src/lib/deliverySettingsSchema.ts (proposed)
import { z } from 'zod'

export const DeliverySettingsSchema = z.object({
  accessType: z.enum(['public', 'password']),
  downloadsEnabled: z.boolean(),
  bulkDownloadEnabled: z.boolean(),
  downloadQuality: z.enum(['web', 'high', 'original']),
  galleryTitle: z.string().min(1).max(120),
  clientName: z.string().max(120),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  eventLocation: z.string().max(200),
  eventType: z.string().max(80),
  themeColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  layoutMode: z.enum(['1-col', '2-col', '3-col']),
  imageSpacing: z.enum(['none', 'small', 'medium']),
  cornerStyle: z.enum(['sharp', 'rounded']),
  watermarkEnabled: z.boolean(),
  watermarkText: z.string().max(80),
  watermarkPosition: z.enum(['tl','tr','bl','br','center']),
  faceIndexEnabled: z.boolean(),
  facePrivacyMode: z.enum(['open','private']),
  feedLayout: z.enum(['grid','masonry','carousel']),
  welcomeStyle: z.enum(['mosaic','cinematic','minimal']),
  // ... etc; allowDownloads is gone — drift killed.
}).strict() // rejects unknown keys at the boundary

export type DeliverySettings = z.infer<typeof DeliverySettingsSchema>
export const DeliverySettingsPatchSchema = DeliverySettingsSchema.partial().strict()
```

### Rollout

1. Ship `deliverySettingsSchema.ts`; existing call sites import the inferred
   type (no behavior change).
2. Ship the RPC (Migration 005, draft) with the SQL-side allowlist.
3. Flip `updateGallerySetting` in `Dashboard.tsx` to: validate locally with
   `DeliverySettingsPatchSchema.parse(patch)` → call RPC → optimistic update on
   success.
4. Lock down RLS: remove anon/authenticated UPDATE policy on
   `galleries.delivery_settings`, leaving only the RPC path.

**Effort: 3 dev-days.**

---

## Concern (d) — `images.section_id` allows NULL → lazy self-heal

### What's broken now

`gallery_sections` was added in migration 010 with `images.section_id UUID NULL
REFERENCES gallery_sections ON DELETE SET NULL`. Every image uploaded before
that migration, every image uploaded today without picking a section, and every
image whose section was deleted, ends up with `section_id = NULL`. The SPA
treats NULL as a pseudo "All photos" bucket
(`Dashboard.tsx:1922`), but the public Viewer expects each image to belong to a
section for the stacked-section layout. This forces a lazy self-heal somewhere
in the open path that auto-assigns NULL images to a default section if one
exists.

The pseudo-bucket also breaks the obvious invariant "rename a section → all its
images update", because there is no row to rename for the NULL bucket.

### Target shape

Each gallery owns exactly one **default section** (`is_default = true`,
deterministic slug `default`), created in the same transaction as the gallery
itself. `images.section_id` becomes `NOT NULL`. The "All photos" view in the
sidebar is computed in the SPA by ignoring the section filter — it stops being a
NULL bucket.

Add `UNIQUE(gallery_id, slug)` on `gallery_sections` so the default section is
addressable and the SPA stops hand-rolling slugs.

Add a deferred constraint trigger on `galleries` INSERT to auto-create the
default section, so no SPA code path can produce a gallery without one.

### Rollout

1. **Migration 003 (draft)** — for every gallery missing a section row, create
   one (`name = 'Default'`, `slug = 'default'`, `is_default = true`). Then
   `UPDATE images SET section_id = (SELECT default section)` WHERE
   `section_id IS NULL`. Then add `NOT NULL` + `UNIQUE(gallery_id, slug)`.
2. **SPA change** — remove the self-heal branch in `openGalleryEditor` and the
   "All photos" NULL filter; "All" becomes "no section filter applied".
3. **Trigger** — add `AFTER INSERT ON galleries` trigger to create the default
   section automatically.

**Effort: 4 dev-days** (the backfill is small but every image surface — public
Viewer, owner Dashboard, face search, top picks — needs regression).

---

## Concern (e) — `status` enum is informal

### What's broken now

`galleries.status` is `TEXT` with a CHECK constraint listing `'draft',
'publishing', 'live', 'failed'`, but the application code treats `'live'` and
`'published'` as synonyms (`Dashboard.tsx:1130, 1600, 1752`) because legacy
desktop rows ended up with `'published'`. The CHECK constraint would reject
`'published'` today on a fresh insert, but old rows slipped through earlier
deploys. RLS policies are split — `gallery_sections` checks only `'live'`
(`010_gallery_sections.sql:64`), so a gallery row stuck on `'published'` from
the legacy desktop returns sections to the public path inconsistently.

### Target shape

Real Postgres enum `gallery_status AS ENUM ('draft', 'publishing', 'live',
'archived')`. Single canonical value for "publicly visible": `'live'`.
`'published'` is normalized to `'live'` in the backfill. `'failed'` is folded
into `'draft'` (with a separate `last_publish_error TEXT` column for the
diagnostic). All RLS policies are rewritten to check the enum, not strings.

Archiving is a new state, replacing the soft-delete trick the team has been
talking about.

### Rollout

1. **Migration 001 (draft)** — `CREATE TYPE gallery_status`, then
   `ALTER TABLE galleries ALTER COLUMN status TYPE gallery_status USING (CASE
   WHEN status = 'published' THEN 'live'::gallery_status ELSE
   status::gallery_status END)`.
2. **RLS rewrite** — same migration, replace string comparisons with enum
   comparisons in every policy that touches `status`.
3. **SPA cleanup** — remove the `g.status === 'live' || g.status ===
   'published'` defensive checks at `Dashboard.tsx:1130, 1600, 1752` and the
   `.in('status', ['live', 'published', 'draft'])` queries.

**Effort: 3 dev-days.**

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Dual-write window drift between `delivery_settings` JSONB and promoted columns | M | H | RPC writes both inside a single statement; nightly drift check job; alert if columns disagree. |
| Revision snapshot serialization OOM on galleries with 5000+ images | L | M | Image manifest stores `id[]` only, not full image rows. Viewer joins back to live `images` filtered by manifest. |
| RLS rewrite breaks public viewer during the cutover | L | H | New RLS shipped as ADDITIONAL policies first; old policies retained for 48h; flip happens by dropping old policies in a separate deploy. |
| `section_id NOT NULL` backfill misses a row inserted between SELECT and ALTER | L | H | Wrap backfill + `ALTER COLUMN ... SET NOT NULL` in a single transaction with `LOCK TABLE images IN SHARE MODE`. Galleries are small (currently 71 live), lock window is sub-second. |
| `status` enum cast fails on an unknown value | L | H | Backfill cast is `CASE` exhaustive; pre-flight `SELECT DISTINCT status FROM galleries` confirmed to be a subset of the new enum before running. |
| RPC rejects a valid legacy patch shape and breaks a long-lived browser tab | M | M | Two-week opt-in window: SPA flag `useSettingsRpc` defaults false; ramp 10% → 100%; rollback = flip flag. |
| Migration ordering vs Phase 5 token economy work in flight | M | M | Phase 6 migrations are numbered into `_phase6_drafts/`, not the main sequence. Final numbers assigned during the release PR after Phase 5 lands. |
| Anon SELECT path becomes RPC-only → loss of Supabase realtime on the public viewer | L | L | Public viewer never used realtime (we cache-bust on publish). Confirm during cutover. |

---

## Effort summary

| Concern | Dev-days |
|---|---|
| (e) Status enum | 3 |
| (c) Validation RPC + Zod | 3 |
| (d) `section_id NOT NULL` + default section | 4 |
| (a) JSONB → promoted columns | 5 |
| (b) Draft/publish revisions | 7 |
| **Total** | **22 dev-days** (~2 engineers × 2 weeks) |

---

## Proposed rollout sequence

1. **Week 1, day 1-2**: Migration 001 (status enum) + RLS rewrite. Lowest blast
   radius; gives us a clean foundation.
2. **Week 1, day 3-5**: Migration 002 (promote columns) + backfill + dual-write
   RPC scaffolding.
3. **Week 1, day 5**: Migration 003 (section_id NOT NULL) + default-section
   trigger. Wrapped in transaction; sub-second lock.
4. **Week 2, day 1-2**: Migration 005 (validation RPC) + SPA Zod schema +
   `useSettingsRpc` flag ramp.
5. **Week 2, day 3-5**: Migration 004 (gallery_revisions) + snapshot RPC +
   public viewer cutover.
6. **Week 3 (out of scope for this plan)**: Cleanup migration to drop
   `delivery_settings` JSONB column and the dual-read anon policies.

Each migration is independently reversible up until the cleanup pass in week 3.

---

## Open questions for review

1. **Revisions vs single snapshot column** — `gallery_revisions` table is the
   right shape for version history but doubles storage of every setting on every
   publish. For 71 galleries × ~2 publishes/month × 8 KB ≈ negligible. Confirm
   we want the history.
2. **Default-section semantics** — should `is_default = true` sections be
   undeletable, or just auto-recreated on next gallery edit if missing?
3. **`access_type` column vs derived from `password IS NOT NULL`** — promoting
   `access_type` adds explicitness, but the `password IS NULL` check is a
   single source of truth. Lean explicit.
4. **`client_code_hash` instead of plaintext `clientCode`** — Phase 4 already
   moved password hashing; client code should follow.

---

## Files in this batch

- `docs/PHASE6_ARCHITECTURE_PLAN_2026-05-30.md` — this doc
- `supabase/migrations/_phase6_drafts/001_gallery_status_enum.sql`
- `supabase/migrations/_phase6_drafts/002_promote_jsonb_to_columns.sql`
- `supabase/migrations/_phase6_drafts/003_section_id_not_null.sql`
- `supabase/migrations/_phase6_drafts/004_gallery_revisions.sql`
- `supabase/migrations/_phase6_drafts/005_update_gallery_settings_rpc.sql`

None of these are wired into the migration sequence. They are proposals to be
reviewed, refined, and re-numbered when the team commits to the sprint.
