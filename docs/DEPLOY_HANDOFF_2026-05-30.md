# Deploy Handoff — Phase 6 + Stories Sprint (2026-05-30)

> שלום גיא, זה מסמך אחד שמסכם את כל מה שצריך לקרות כדי להעלות את הסשן של השבוע
> לפרודקשן בבטחה. אין צורך להריץ פקודות במסוף אם לא בא לך — כל המעבר ל־main
> נעשה דרך GitHub PRs (כפתור "Merge"), ו־Vercel ידחוף את האתר אוטומטית בכל פעם
> שמשהו נוחת ב־main. הפעולות היחידות שדורשות מסוף נמצאות בפרק
> [Operator Tasks](#4-operator-tasks-still-pending) — הן אופציונליות לשבוע הזה
> (Remotion Lambda וכו'), והאתר ימשיך לעבוד גם בלעדיהן. ההמלצה: לעבור פרק־פרק
> מלמעלה למטה, לאשר merge ב־PR אחד בכל פעם, ולעצור בכל "STOP" כדי לעשות smoke
> test לפני שממשיכים.

---

## Table of contents

1. [Merge order to `main`](#1-merge-order-to-main)
2. [Database migrations already on production](#2-database-migrations-already-on-production)
3. [Vercel environment variables](#3-vercel-environment-variables)
4. [Operator tasks still pending](#4-operator-tasks-still-pending)
5. [Rollback & feature flags](#5-rollback--feature-flags)
6. [Smoke-test checklist](#6-smoke-test-checklist)
7. [Known gaps for next sprint](#7-known-gaps-for-next-sprint)

PR list lives at: <https://github.com/guysidiphoto-maker/gallery-flow/pulls>
(the `gh` CLI is not installed on this Mac — use the web UI to click "Merge").

---

## 1. Merge order to `main`

There are ~30 open feature/fix branches relevant to this sprint. The order
below groups them by dependency so you can merge each wave, watch Vercel
go green, run a quick smoke, then move on. **Do not skip ahead** —
`feat/web-phase6-jsonb-to-columns` MUST land before
`feat/web-phase6-gallery-revisions`, and the dirty-flag fixes MUST land
before the Update-button feedback PR or the button will appear "stuck on".

Branches explicitly excluded from this sprint: `main`, `demo`,
`perf/desktop-parallel-upload`, anything under `spike/*` (spikes are
research only, not for prod). The `production-rollup-2026-05-05` branch is
last week's release — already on main, ignore.

### Wave A — Foundational fixes (no schema, no flags) — merge first

These are pure UI / accessibility fixes that everything else builds on.

| # | Branch                                              | Why first                                                        |
|---|-----------------------------------------------------|------------------------------------------------------------------|
| 1 | `fix/web-focus-trap-stable-callback`                | Stabilises focus-trap hook used by every modal opened below.     |
| 2 | `fix/wcag-focus-trap-keyboard-reorder`              | Builds on (1); a11y for the reorder modal.                       |
| 3 | `fix/web-dirty-flag-immediate`                      | Marks the editor "dirty" on the first keystroke (not on blur).   |
| 4 | `fix/web-mark-dirty-on-all-mutations`               | Extends (3) to every field — needed before Update-button PR.     |
| 5 | `fix/web-dirty-button-stronger-affordance`          | The visible orange/blue pill state. Depends on (3)+(4).          |
| 6 | `fix/web-update-button-feedback-states`             | "✓ עודכן" inline confirm + success toast. Depends on (5).        |
| 7 | `feat/web-confirm-modal-component`                  | Shared `<ConfirmModal>` used by delete + publish flows below.    |

**STOP — smoke test:** open the editor, type in the title field, confirm
the Update button activates immediately and shows "✓ עודכן" after save.

### Wave B — Validation, settings, polish (no schema)

| # | Branch                                              | Notes                                                                |
|---|-----------------------------------------------------|----------------------------------------------------------------------|
| 8 | `feat/web-delivery-settings-zod`                    | Zod schema for delivery settings; needed by (9).                     |
| 9 | `fix/web-validate-settings-before-save-v2`          | Blocks bad saves with inline errors. Depends on (8).                 |
| 10| `fix/web-polish-remaining-alerts`                   | Replaces ugly `alert()` calls with toasts.                           |
| 11| `fix/web-remove-dead-help-nav`                      | Removes broken /help link from sidebar.                              |
| 12| `fix/web-remove-redundant-sections-tab`             | Sections live inside the editor now, the tab is dead.                |
| 13| `fix/web-section-description-inline-edit`           | Uses migration **062** (`gallery_sections.description`) — already on prod. |
| 14| `fix/web-audit-cleanups-batch`                      | Misc lint / dead-code removals; safe last in wave.                   |

**STOP — smoke test:** save delivery settings with a bad URL → inline error
appears, save is blocked.

### Wave C — Phase 6 schema-backed PRs (migrations 063–067 already live)

These each pair with a migration that is **already on production**. Merging
them simply switches the front-end to read/write the new columns. Order
matters because of foreign-key direction.

| # | Branch                                              | Pairs with migration                                         |
|---|-----------------------------------------------------|--------------------------------------------------------------|
| 15| `feat/web-phase6-status-enum`                       | **063** `gallery_status` enum.                               |
| 16| `feat/web-phase6-jsonb-to-columns`                  | **064** JSONB → first-class columns.                         |
| 17| `feat/web-phase6-section-not-null`                  | **065** `images.section_id NOT NULL` + trigger.              |
| 18| `feat/web-stories-phase1-dashboard-wiring`          | **066** `story_renders` table.                               |
| 19| `feat/web-phase6-gallery-revisions`                 | **067** `gallery_revisions` + `gallery_publish` RPC.         |

After (16) lands, the `update_gallery_settings` RPC starts using the new
columns — see [§7](#7-known-gaps-for-next-sprint).

**STOP — smoke test:** open a gallery, change title, click Update, then
click Publish. A new row should appear in `gallery_revisions` (check via
Supabase dashboard).

### Wave D — Storage hygiene & deletion safety

| # | Branch                                                  | Notes                                            |
|---|---------------------------------------------------------|--------------------------------------------------|
| 20| `stability/delete-gallery-transactional`                | Wraps gallery delete in a single transaction.    |
| 21| `stability/storage-cleanup-on-image-delete`             | Purges storage on per-image delete.              |
| 22| `fix/web-storage-cleanup-on-delete`                     | Front-end side of (21).                          |
| 23| `fix/web-storage-cleanup-extension`                     | Strips `.jpg`/`.jpeg` correctly when purging.    |

**STOP — smoke test:** delete a test gallery → ConfirmModal appears →
confirm → check Supabase Storage and verify the gallery folder is gone
within ~30s.

### Wave E — Stories Phase 2 (experimental, behind missing env)

| # | Branch                                              | Notes                                                                 |
|---|-----------------------------------------------------|-----------------------------------------------------------------------|
| 24| `fix/web-stories-modal-richer`                      | 5-style modal, time estimate, depends on (18).                        |
| 25| `fix/web-stories-curate-before-generate`            | Auto-picks favorites or first 30 photos.                              |
| 26| `feat/web-stories-phase2-lambda-wiring`             | **Last** — calls Remotion Lambda. Fails closed if env not set.        |

Merging (26) is safe even without the Lambda deployed — the endpoint
returns `{ error: "lambda_not_configured" }` until you set the AWS env
vars (see [§3](#3-vercel-environment-variables)).

### Branches explicitly NOT in this sprint

- `spike/web-stories-remotion-phase0` — research scaffold, **do not merge**.
- `perf/desktop-parallel-upload` — desktop track, not web.
- `feat/face-search-rate-limit`, `feat/custom-domain-routing`,
  `feat/short-urls`, `feat/sentry-integration`,
  `feat/originals-only-web`, `feat/reconcile-originals-script`,
  `feat/warm-transform-cache`, `feat/photo-actions`,
  `feat/live-flip-retry`, `feat/web-per-section-galleries`,
  `feat/web-phase1-trust-quick-wins`, `feat/web-phase2-5-section-reorder`,
  `feat/web-phase2-sections-completeness`,
  `feat/web-phase3-5-extra-fixes`, `feat/web-phase3-rtl-accessibility`,
  `feat/web-phase4-perf-quick-wins`, `feat/web-phase5-live-preview-pane`,
  `ops/storage-reaper-schedule`, `security/*`, `web/*` — all separate
  tracks; review & schedule on their own.

---

## 2. Database migrations already on production

Project: `vlyiqfawkrjvqcmkpfvs` (production).
All migrations in this table are **already applied** — no `apply_migration`
needs to be run. Verified via `mcp__plugin_supabase_supabase__list_migrations`
on 2026-05-30.

| Version (CLI ts)            | Short name                       | What it does                                                                            | Backfill                                                                          | Reversible?                                                                                      | RLS / grants                                                                       |
|-----------------------------|----------------------------------|-----------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| `20260530162922` (**062**)  | `gallery_sections_description`   | Adds `gallery_sections.description text NULL` for the inline section editor.            | None — column added as NULL, no data backfill needed.                             | **Yes** — `ALTER TABLE … DROP COLUMN description` is safe; only the section-description PR uses it. | None — inherits existing `gallery_sections` RLS (owner-only write, public-read).   |
| `20260530181147` (**063**)  | `063_gallery_status_enum`        | Creates `gallery_status` enum (`draft`, `published`, `archived`) and converts `galleries.status` text → enum. | All rows backfilled: `null` / `'draft'` → `draft`, `'published'` → `published`. Other values rejected (none existed). | **Partially** — column type change is reversible (`ALTER TYPE … USING status::text`), but enum values cannot be removed once referenced elsewhere. See `063_gallery_status_enum` comments for the documented rollback path. | No new policies; existing RLS still applies on `galleries`.                        |
| `20260530192525` (**064**)  | `064_jsonb_to_columns`           | Promotes the old `galleries.settings` JSONB blob to first-class columns (`cover_image_id`, `cover_image_position`, `download_enabled`, `watermark_enabled`, `password_required`, etc.). | Each key copied out of JSONB into its typed column for every existing row. JSONB column kept (deprecated) for backward compat. | **No (data side)** — backfill is a forward-only flatten. The new columns can be dropped, but front-end branches in Wave C depend on them. Treat as one-way once Wave C ships. | `update_gallery_settings` RPC re-granted to `authenticated`; old `settings_json` RPC marked deprecated. |
| `20260530192729` (**065**)  | `065_section_id_not_null`        | Makes `images.section_id NOT NULL` and adds a `BEFORE INSERT` trigger that assigns the default section if missing. | Backfilled orphan images by creating a "Default" section per gallery and linking them. | **No** — `NOT NULL` constraint can be dropped, but the trigger and default sections won't auto-clean. Treat as permanent.            | No RLS change; trigger runs as `SECURITY DEFINER` with `search_path=public`.       |
| `20260530192637` (**066**)  | `066_story_renders`              | New `story_renders` table (id, gallery_id, status, lambda_request_id, output_url, cost_cents, error, timestamps) for Phase 2 Lambda. | None (new table).                                                                 | **Yes** — `DROP TABLE story_renders` is safe; only the Stories Phase 2 PR reads from it.         | RLS: owner can `select`/`insert` their own; `service_role` full access for the Lambda webhook. |
| `20260530194127` (**067**)  | `067_gallery_revisions`          | New `gallery_revisions` table (immutable snapshots) + `gallery_publish(gallery_id uuid)` RPC that snapshots the current settings into a revision row and bumps `galleries.published_revision_id`. | None (new table + RPC).                                                            | **Yes** — `DROP TABLE gallery_revisions CASCADE; DROP FUNCTION gallery_publish`. Safe rollback as long as no viewer code yet reads `published_revision_id` (it doesn't — viewer cutover is gated by the env flag in [§3](#3-vercel-environment-variables)). | RPC granted to `authenticated`; table RLS: owner-read, no client writes (only the RPC writes via `SECURITY DEFINER`). |
| `20260530195128`            | `gallery_get_published_snapshot` | RPC that returns the latest published `gallery_revisions` row for the viewer. Companion to 067. | None.                                                                              | **Yes** — `DROP FUNCTION gallery_get_published_snapshot`. Currently unused by the viewer unless `VITE_USE_PUBLISHED_SNAPSHOT=true`. | Granted to `anon` + `authenticated` so the public viewer can read snapshots.        |

> If you ever need to confirm the live list, run
> `mcp__plugin_supabase_supabase__list_migrations` against project
> `vlyiqfawkrjvqcmkpfvs` and look for versions `20260530…`. Nothing else
> from this sprint needs schema changes.

### Migrations **NOT** yet on production from this sprint

None. Every migration written this sprint has already been applied. All
remaining PRs are code-only.

---

## 3. Vercel environment variables

Set these in the Vercel dashboard at
**Project → Settings → Environment Variables**. Vercel env vars are baked
in at build time, so **after editing any of them you must redeploy**
(either push a new commit or click "Redeploy" on the latest deployment).

### Required for Stories Phase 2 (Lambda)

Without these, the `/api/render-story` endpoint will respond with
`{ error: "lambda_not_configured" }` and the Dashboard button will show a
friendly "Stories rendering not yet enabled" message. The site will NOT
break.

```bash
REMOTION_LAMBDA_FUNCTION_NAME   # e.g. remotion-render-4-0-200-mem2048mb-disk2048mb-300sec
REMOTION_LAMBDA_SERVE_URL       # e.g. https://remotionlambda-xxxx.s3.us-east-1.amazonaws.com/sites/clean/index.html
AWS_REGION                      # us-east-1 (recommended — cheapest egress to Supabase)
AWS_ACCESS_KEY_ID               # IAM user with the policy from `npx remotion lambda policies user`
AWS_SECRET_ACCESS_KEY           # paired secret
```

Scope: **Production only** for now. Leave Preview/Development unset so
preview deploys fail closed (cheaper).

### Required for the Phase 6 viewer cutover (leave unset for now)

```bash
VITE_USE_PUBLISHED_SNAPSHOT     # 'true' to switch the public viewer to gallery_get_published_snapshot RPC
```

- **Default behaviour (unset / `false`)**: viewer reads live gallery rows
  (current behaviour). Safe.
- **`true`**: viewer reads the latest immutable snapshot from
  `gallery_revisions`. Only flip after manually verifying snapshots for a
  few production galleries (see [§7](#7-known-gaps-for-next-sprint)).

Because it starts with `VITE_`, it is exposed to the client bundle — that
is intended for this flag (it's a public toggle, not a secret).

### Already-set server-side Supabase keys (verify, do not rotate)

```bash
SUPABASE_URL                    # https://vlyiqfawkrjvqcmkpfvs.supabase.co
SUPABASE_SERVICE_ROLE_KEY       # MARK AS "SENSITIVE" in Vercel; used by /api/* routes
```

Confirm both exist in Production scope; the new `/api/render-story`
endpoint and the storage cleanup helpers depend on them.

---

## 4. Operator tasks still pending

These are NOT covered by any PR in the merge list. They are pure
operator steps you (or whoever runs the AWS account) must do **outside**
GitHub.

### a) Deploy Remotion Lambda — required only for Stories Phase 2 to actually render

Full instructions live in `gallery-web/stories-remotion/README.md`
(currently only on branch `spike/web-stories-remotion-phase0`). TL;DR:

```bash
cd gallery-web/stories-remotion
npm install                          # pulls Remotion + @remotion/lambda + @remotion/cli
npx remotion lambda policies user    # paste output into IAM user policy
npx remotion lambda policies role    # paste output into Lambda exec role
export AWS_ACCESS_KEY_ID=…
export AWS_SECRET_ACCESS_KEY=…
export REMOTION_AWS_REGION=us-east-1
npm run lambda:deploy                # builds and uploads bundle, prints a serveUrl
npm run lambda:deploy-function       # creates the Lambda, prints a functionName
```

Copy the printed `serveUrl` → set as `REMOTION_LAMBDA_SERVE_URL` in
Vercel. Copy the printed `functionName` → set as
`REMOTION_LAMBDA_FUNCTION_NAME`. Redeploy gallery-web on Vercel.
Expected per-render cost: **$0.05 – $0.20** (us-east-1, 30s 1080×1920,
default 50-way concurrency, 2048 MB).

### b) `npm install react-window` in `gallery-web/`

Only needed if `feat/web-phase4-perf-quick-wins` (the virtualization PR)
ends up on the merge list. It is currently **not** in this sprint's wave
list, so skip unless that PR is promoted. If/when you do merge it, run:

```bash
cd gallery-web
npm install react-window
git add package.json package-lock.json && git commit -m "chore: add react-window"
```

### c) Click "Merge" on the PRs

The `gh` CLI is not installed on this Mac. Use:
<https://github.com/guysidiphoto-maker/gallery-flow/pulls> — review and
merge in the order listed in [§1](#1-merge-order-to-main). Vercel will
auto-deploy each merge into `main` to production.

---

## 5. Rollback & feature flags

Each risky surface has a one-line "off switch" so you don't need to revert
code in an emergency.

| Risky surface                          | How to disable instantly                                                                                                                                  | Side effects                                                                            |
|----------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| Phase 6 viewer cutover (snapshots)     | Set `VITE_USE_PUBLISHED_SNAPSHOT=false` (or unset) in Vercel → Redeploy. Viewer reverts to reading live gallery rows.                                       | None for live galleries. Any "published only" content reverts to showing edits live.    |
| Stories Phase 2 Lambda                 | Unset `REMOTION_LAMBDA_FUNCTION_NAME` in Vercel → Redeploy. `/api/render-story` returns `{ error: "lambda_not_configured" }`.                              | Dashboard button shows "rendering not enabled" message. No crash, no charge.            |
| Status enum (063)                      | Documented rollback in migration `063_gallery_status_enum` comments — convert column back to text with `USING status::text`. **Not recommended** unless a value is rejected (none expected). | Loses enum validation, but data is intact.                                              |
| JSONB → columns (064)                  | No instant rollback (data flattening is one-way). If a column-write breaks something, revert the Wave C PRs (#15–#19) and the front-end falls back to writing JSONB until the next deploy. | Front-end starts ignoring the new columns; old `settings` JSONB blob is still authoritative until the front-end is reverted. |
| `gallery_publish` RPC (067)            | `REVOKE EXECUTE ON FUNCTION gallery_publish FROM authenticated;` — clients get a permission error on click, no data harm.                                  | Publish button breaks until restored. Existing rows in `gallery_revisions` untouched.   |
| Storage cleanup on delete (#21–#23)    | Revert PRs (#21–#23). Deleted gallery rows remain in DB, storage objects remain orphaned (same as current behaviour pre-sprint).                            | Storage costs creep again until you fix forward.                                        |

---

## 6. Smoke-test checklist

Run these **after every wave** in [§1](#1-merge-order-to-main). All should
pass in under 3 minutes against production.

- [ ] **Sign in** at the dashboard URL. Loads without console errors.
- [ ] **Open any gallery** → editor renders, all tabs present (Photos,
      Sections, Settings, Stories).
- [ ] **Edit title** → Update button activates *immediately* on the first
      keystroke, with the orange "dirty" pill visible.
- [ ] **Click Update** → success toast appears, button shows inline
      "✓ עודכן" confirmation, dirty pill clears.
- [ ] **Open Stories tab** → "צור סטורי אוטומטית" CTA visible (gallery
      needs 12+ photos for the button to enable).
- [ ] **Open the Stories modal** → 5 style cards visible, time estimate
      updates as you switch styles, curator shows favorites if any,
      otherwise the first 30 photos.
- [ ] **(Only if §4a done)** Click "Generate" → status polls, eventually
      mp4 URL appears. Otherwise: friendly "rendering not enabled" msg.
- [ ] **Delete a test gallery** → ConfirmModal appears → confirm →
      Supabase Storage folder is empty within ~30s (check via Supabase
      dashboard → Storage → `galleries` bucket).
- [ ] **Incognito tab → open public gallery URL** → renders correctly,
      cover image, all sections, password gate still works if enabled.
- [ ] **Publish gallery** → new row appears in
      `gallery_revisions` (Supabase → Table editor).

If any step fails, see the matching row in
[§5](#5-rollback--feature-flags) to disable that surface, then file an
issue.

---

## 7. Known gaps for next sprint

- **Remotion Lambda is operator-deployed**, not CI. There is no PR that
  deploys it — it's a one-time manual step ([§4a](#a-deploy-remotion-lambda--required-only-for-stories-phase-2-to-actually-render)). Until it's done, the
  Stories Phase 2 endpoint fails closed and the dashboard button hides
  itself.
- **`VITE_USE_PUBLISHED_SNAPSHOT` is intentionally OFF.** Before flipping
  it, manually verify snapshots for ~5 production galleries by calling
  `gallery_get_published_snapshot(<gallery_id>)` in the Supabase SQL
  editor and visually comparing the JSON to the live row. Flip the flag
  in a follow-up PR with its own smoke test.
- **`update_gallery_settings` RPC merge.** This RPC was rewritten in
  migration 064 to write the new columns. The front-end branch
  `feat/web-phase6-jsonb-to-columns` (PR #16 in Wave C) is what actually
  switches the editor to call the new shape. The migration is already on
  prod, so even without the PR merged the RPC works — it just writes
  through both the columns AND the legacy JSONB until the PR lands.
- **react-window virtualization** is parked. Only revisit if the Photos
  grid starts feeling janky on 500+ photo galleries.
- **`feat/web-phase4-perf-quick-wins`, `feat/web-phase5-live-preview-pane`,
  `web/*`, `ops/storage-reaper-schedule`** — separate tracks not covered
  here. Schedule individually.

---

_Last updated: 2026-05-30. Author: deploy handoff agent. Maintain this
file as the single source of truth for the merge — if you make decisions
that contradict it, update the doc before merging._
