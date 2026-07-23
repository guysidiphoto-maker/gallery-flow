# Overnight Sprint 2026-07-24 — Shared Contracts & Task Board

Branch: `feat/client-portal-v2-overnight` (from `feat/client-portal-v2` @ `008bdc27c4a2e07906fc7bbdf28a8a2681e0e219`).
Safety: NOTHING is pushed, merged, PR'd, or deployed to Production/Staging. Migrations apply ONLY to the isolated QA Supabase project `pixflow-cpv2-qa2` (`icxitoczqtcgdkwiaxxc`). Preview deploys ONLY to Vercel project `pixflow-client-portal-v2-qa-web`.

## Verified starting state
- CPV2 migrations 088–095 exist and are applied to the QA project.
- Tenant model: one business per user (`businesses.user_id = auth.uid()`). Clients: `clients.business_id`. Assignment: `galleries.client_id` (nullable). Portal sees only `status='live'` galleries of active memberships via `client_portal_bootstrap()`.
- Owner writes go through `POST /api/client-admin` (service-role, `requireOwnerBusiness`), owner reads through self-scoped `cpv2_owner_*` RPCs.
- Event metadata already exists on `galleries`: `event_date DATE`, `event_type TEXT(60)`, `event_location TEXT(120)` (migration 064). Image AI scores exist (`image_ai_scores`, migration 052). TenderBuilder component exists (client-facing tab).
- i18n: portal uses `src/lib/portalLocale.ts` (flat keys, `usePortalLocale()`, he=RTL default, en). Viewer uses `src/i18n.ts`.
- Router: custom pathname matcher in `src/main.tsx` (`Router()` fn) — NOT React Router.
- Tests: offline tsx tests in `gallery-web/tests/*.test.ts` (run `npx tsx tests/<f>.test.ts`); Playwright e2e in `tests/e2e/`.

## Shared contracts (all agents MUST follow)

### C1. Feature availability (Social lockdown)
- New module `gallery-web/src/lib/features.ts` (client) and `gallery-web/server/features.ts` (server).
- `SOCIAL_STUDIO_ENABLED`: resolved from `VITE_FEATURE_SOCIAL_STUDIO === 'true'` (client) / `process.env.FEATURE_SOCIAL_STUDIO === 'true'` (server). DEFAULT: disabled. No env var is set anywhere, so it is OFF for every business and every client regardless of entitlement.
- Rule: `socialAllowed = SOCIAL_STUDIO_ENABLED && production_suite`. Both must be true; today the flag is false → closed for everyone. Entitlement architecture untouched.
- Backend: every Social endpoint (`generate-feed`, `generate-campaign`, `plan-event`, `score-images`, `generate-captions`, `append-event-posts`) returns `403 { ok:false, error:'feature_disabled' }` when flag off, BEFORE entitlement resolution. `generate-captions` additionally gets the missing entitlement gate.
- Frontend: Social nav item stays visible as a LOCKED card ("בקרוב / Coming soon"), never routable; direct tab/URL falls back to `galleries`.

### C2. Onboarding state
- Table `onboarding_progress` (migration 096): `id uuid pk`, `user_id uuid NOT NULL references auth.users on delete cascade`, `surface text NOT NULL` (e.g. `'owner_tour'`, `'owner_checklist'`, `'portal_welcome'`), `version int NOT NULL default 1`, `status text NOT NULL default 'pending' check in ('pending','in_progress','completed','dismissed')`, `step int NOT NULL default 0`, `updated_at`, `created_at`. UNIQUE(user_id, surface, version).
- RLS: self-only SELECT/INSERT/UPDATE (`user_id = auth.uid()`), authenticated role. No delete. Anon blocked.
- Client fallback when table missing (Preview without migration): localStorage key `pixflow-onboarding:<surface>:v<version>` — module `src/lib/onboarding.ts` wraps both (DB first, localStorage fallback, never throws).
- Tour versioning: bump `version` const to re-show after major changes.

### C3. Gallery assignment
- REUSE existing model only: `galleries.client_id` + RPCs `cpv2_assign_gallery`/`cpv2_unassign_gallery` + `/api/client-admin` actions `assign_gallery`/`unassign_gallery`/`reassign_gallery`. NO new relationship table.
- New `/api/client-admin` action: `bulk_assign_galleries { clientId, galleryIds: string[] }` → loops server-side over cpv2_assign_gallery, per-item result array, idempotent, audited per gallery (`gallery_assigned`/`gallery_reassigned`).
- Assignment UI states: Assigned / Unassigned / Published (`status='live'`) / Draft. "No client can see this" indicator = `client_id IS NULL OR status <> 'live'` OR client has 0 active members.
- Inline client creation reuses `create_client` action (no invite) and returns `client_id` for immediate selection.

### C4. Event metadata (migration 097, additive columns on `galleries`)
- `event_size_bucket text NULL check in ('intimate','small','medium','large','massive')` (≈ <50, 50–150, 150–500, 500–2000, 2000+)
- `industry text NULL` (≤60), `venue_type text NULL check in ('indoor','outdoor','mixed')`, `time_of_day text NULL check in ('day','night','mixed')`, `event_keywords text[] NOT NULL default '{}'`.
- NULL = Unclassified. NEVER fabricate values for existing galleries. Enrichment UI writes via new `/api/client-admin` action `update_gallery_metadata { galleryId, ...fields }` (owner-scoped, validates enum values, audited as existing pattern — no new audit actions needed; reuse metadata jsonb `{fields:[...]}` under a new allowed action `gallery_metadata_updated` ONLY if 090's CHECK is extended in 097; otherwise skip audit for metadata edits — DECISION: extend the CHECK in 097 to add `'gallery_metadata_updated'` and `'import_*'` actions, additively via constraint replace).

### C5. Search (migration 098)
- RPC `search_owner_content(p_query text, p_filters jsonb default '{}') returns jsonb` — SECURITY DEFINER, authenticated, resolves business from `auth.uid()` internally (same pattern as `cpv2_owner_clients_overview`). Fails closed (empty result if no business).
- Returns `{ clients: [...], galleries: [...], images: [...] }` with per-row `match_reason text[]` (e.g. `['name','event_location']`). Galleries include assignment + status; images limited to 60 rows, thumbnails only.
- Filters keys: `client_id, status ('live'|'draft'), assigned (bool), event_type, event_size_bucket, industry, venue_type, time_of_day, year_from, year_to, keywords text[], imported_source`.
- Indexes: `pg_trgm` GIN on `galleries.name`, `clients.name`; btree on new metadata columns. ILIKE-based matching (works for Hebrew + English). NO semantic/embedding claims.
- Frontend: `src/components/search/` — debounced (300ms), AbortController-cancelled, empty/loading states, shows match reasons.

### C6. Tender search
- Owner-side, metadata-first. New `src/components/tender/` (do NOT edit the client-facing `TenderBuilder.tsx`). Uses `search_owner_content` with filters + brief form.
- Tender collections (migration 100): `tender_collections` (`id, business_id, name, brief jsonb, created_at, updated_at`) + `tender_collection_items` (`id, collection_id fk cascade, gallery_id, image_id NULL, added_at`, UNIQUE(collection_id, gallery_id, image_id)). RLS: owner-only ALL via business ownership subquery. Writes may go direct via RLS (owner-scoped INSERT/UPDATE/DELETE policies allowed here — simple owner-owned data).
- Match reasons = which filter/field matched. NO invented scores. `image_ai_scores` MAY be used for ordering images within a gallery (real data), labeled "AI score (existing)".

### C7. Import Center (migration 099)
- Tables (all `business_id uuid NOT NULL` + owner-scoped RLS SELECT; writes via service-role API only):
  - `import_sources`: `id, business_id, provider text check in ('pixieset','generic_csv','local_folder'), label text, created_at`.
  - `import_jobs`: `id, business_id, source_id fk, kind text check in ('metadata_csv','photos_zip'), status text check in ('draft','dry_run','ready','running','paused','completed','failed','cancelled') default 'draft', totals jsonb default '{}', error text, checkpoint jsonb default '{}', created_at, updated_at, started_at, finished_at`.
  - `import_collections`: `id, job_id fk cascade, business_id, source_name text, source_url text, matched_client_id uuid NULL, client_match_status text check in ('matched','ambiguous','unmatched','create_new','skip') default 'unmatched', target_gallery_id uuid NULL, status text check in ('pending','importing','imported','skipped','failed') default 'pending', stats jsonb default '{}', created_at`.
  - `import_files`: `id, collection_id fk cascade, business_id, filename text, size_bytes bigint, content_hash text NULL, status text check in ('pending','uploaded','skipped_duplicate','failed') default 'pending', error text, created_at`.
- API: `POST /api/import-center` (single multi-action endpoint, `requireOwnerBusiness`, actions: `create_job`, `parse_csv` (dry-run, server-side parse of pasted/uploaded CSV text ≤2MB), `set_collection_mapping`, `start_job`, `pause_job`, `resume_job`, `cancel_job`, `retry_failed`, `job_status`). Photos go through the EXISTING browser upload pipeline (`uploadPipeline.ts`) — client-side ZIP reading with streaming (fflate already in deps? verify; if not, parse ZIP client-side via File System Access/DecompressionStream or add `fflate` — decision: use `fflate` if already present, else implement with browser-native streams; NO new server storage pipeline).
- Safety: filename sanitization, path-traversal rejection (`..`, absolute paths, backslashes), uncompressed-size cap (10GB/job), per-file 40MB (existing cap), MIME+extension allowlist (jpeg/png/webp), depth ≤3, ZIP-bomb ratio check (>100x → reject file), never store passwords from CSV (drop the column, note in report).
- Client matching: normalized email exact match → `matched`; name-only match → `ambiguous` (never auto-merge); else `unmatched`. Owner chooses create/map/skip per collection.
- Audit: 097 extends `client_access_audit` action CHECK with `'import_job_created','import_job_started','import_job_completed','import_job_cancelled','import_collection_imported'`.
- Provenance: imported galleries get `delivery_settings.importSource = { provider:'pixieset', url, jobId }` and `import_collections.target_gallery_id` set.

### C8. i18n
- New owner-side strings: new module `src/lib/ownerLocale.ts` cloned from the `portalLocale.ts` pattern (flat keys, `useOwnerLocale()`, localStorage key `pixflow-owner-locale`, default `he`). ALL new owner UI (overview, tour, assignment, search, tender, import) uses it. Portal additions go into `portalLocale.ts`.
- Copy rules: no internal jargon (membership/entitlement/RLS/tenant/bootstrap), no em-dashes, Hebrew punctuation correct in RTL, no mixed-direction strings; every key exists in BOTH he and en.

### C9. Audit actions
- Existing CHECK list in 090 is extended ONCE, in migration 097 (single owner: Agent-DB). New actions: `gallery_metadata_updated`, `import_job_created`, `import_job_started`, `import_job_completed`, `import_job_cancelled`, `import_collection_imported`, `tour_completed` (optional; tour may skip audit).

### C10. Migration numbering (QA-only, each with `_rollback.sql`)
- 096 onboarding_progress — owner: Tour agent
- 097 gallery event metadata + audit CHECK extension — owner: DB/metadata agent
- 098 search RPC + indexes — owner: Search agent
- 099 import center tables — owner: Import agent
- 100 tender collections — owner: Tender agent
- Style: follow 088–095 conventions (idempotent `IF NOT EXISTS`/`CREATE OR REPLACE`, additive, REVOKE-then-GRANT least privilege, comments).

## File ownership (conflict prevention)
| Area | Owner | Files |
|---|---|---|
| Social lockdown | Agent-SOCIAL | `src/lib/features.ts`, `server/features.ts`, `src/pages/ClientDashboard.tsx`, `api/generate-feed.ts`, `api/generate-campaign.ts`, `api/plan-event.ts`, `api/score-images.ts`, `api/generate-captions.ts`, `api/append-event-posts.ts`, `tests/social-lockdown.test.ts` |
| Tour | Agent-TOUR | `src/components/tour/**`, `src/lib/onboarding.ts`, `src/lib/ownerLocale.ts` (CREATES it), `supabase/migrations/096*`, `tests/tour.test.ts` |
| Assignment | Agent-ASSIGN | `src/components/assignment/**`, `src/components/clients/**`, `src/pages/ClientsManager.tsx`, `api/client-admin.ts`, `server/clientAdmin.ts`, `tests/assignment.test.ts` |
| Search | Agent-SEARCH | `src/components/search/**`, `supabase/migrations/098*`, `tests/search.test.ts` |
| Tender | Agent-TENDER | `src/components/tender/**`, `supabase/migrations/097*`, `supabase/migrations/100*`, `tests/tender.test.ts` |
| Import | Agent-IMPORT | `src/components/importer/**`, `api/import-center.ts`, `server/importer.ts`, `supabase/migrations/099*`, `tests/import-center.test.ts`, `tests/fixtures/pixieset/**`, `docs/PIXIESET-MIGRATION-FEASIBILITY.md` |
| Portal UX | Agent-PORTAL (wave 2) | `src/components/portal/**`, `src/lib/portalLocale.ts`, `src/pages/ClientLogin.tsx`, `src/pages/ClientInviteAccept.tsx` |
| Owner Overview + integration | Agent-OVERVIEW (wave 2) | `src/components/overview/**`, `src/pages/Dashboard.tsx`, `src/main.tsx` |
- NOBODY else touches `Dashboard.tsx` or `main.tsx` in wave 1. Wave-1 agents expose a single default-exported mount component + a short `INTEGRATION.md` in their dir describing exact wiring (nav label keys, mount point, props).
- `ownerLocale.ts`: created by Agent-TOUR in wave 1 with the shared hook + tour keys. Other agents DO NOT edit it in wave 1; they ship their strings in `src/components/<area>/strings.ts` using the same `{he:{},en:{}}` shape, and Agent-OVERVIEW merges them in wave 2 (or components keep local strings modules permanently — acceptable, they follow the same locale hook for direction/locale).
  - CLARIFICATION: components read locale via `useOwnerLocale()` for `locale/dir` and pull text from their local `strings.ts` — no hard-coded single-language strings.

## QA / deploy targets
- QA Supabase: ref `icxitoczqtcgdkwiaxxc` (apply 096–100 there when ready; NEVER to prod `vlyiqfawkrjvqcmkpfvs` or staging `bkccdomovxtuqdxrahnc`).
- Vercel preview project: `pixflow-client-portal-v2-qa-web` (`prj_syCYAfHfeJ56gX4d8w527MUMqDvd`).
- QA users: photographerA@qa.test / photographerC@qa.test / memberA1@qa.test / memberC1@qa.test (password in QA docs).

## Definition of done per agent
- `npx tsc --noEmit -p .` clean for src; offline tests green (`npx tsx tests/<file>`); no edits outside owned files; INTEGRATION.md written; decisions documented inline in the INTEGRATION.md.
