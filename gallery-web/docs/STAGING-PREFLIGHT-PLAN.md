# Staging Preflight Plan — CPV2 + overnight (2026-07-24)

READ-ONLY inspection report. **Nothing has been applied to Staging.** This plan is prerequisite reading before the migration runbook (`MIGRATION-RUNBOOK.md`) is executed. Staging Supabase project: `bkccdomovxtuqdxrahnc` (`pixflow-staging`).

## TL;DR verdict
**NOT READY.** Migrations 088–103 **cannot** be applied to Staging as-is. Staging's schema is **behind Production**: it is missing several prerequisite columns/tables that 088–103 (and the deployed app) reference. Staging must first be brought up to Production's base schema, then 088–103 applied. See "Blockers" below.

## 1. Current Staging migration history
- Uses **timestamp-versioned** migrations (Supabase CLI), not the repo's `NN_` filenames. Latest applied version: `20260626095150`. Total applied: **35**. The repo's `NN_` numbering does not map 1:1 — do not assume "staging is at 087".
- 23 tables in `public`; storage buckets present: `gallery-images`, `gallery-images-thumbs-public`, `business-brand`, `gallery-stories`, `demo-uploads`. Data present: 2 businesses, 5 galleries, 0 clients.

## 2. Missing migrations (of this PR)
**All 16** CPV2/overnight migrations are unapplied on Staging: 088, 089, 090, 091, 092, 093, 094, 095, 096, 097, 098, 099, 100, 101, 102, 103 (+ their rollbacks). None of the CPV2 tables, RPCs, or the `production_suite` entitlement exist on Staging.

## 3. Schema differences vs the expected (prod-parity) base — BLOCKERS
The 088–103 migrations and the app were authored against the **Production** schema. Staging is missing prerequisites:

| Object | Prod | Staging | Impact if 088–103 applied as-is |
|---|---|---|---|
| `galleries.event_type` / `event_location` / `event_date` (mig 064) | present | **MISSING** | **098 `search_owner_content` references these → RPC creation FAILS.** Tender + search unusable. |
| `businesses.brand_kit` (mig 072) | present | **MISSING** | App `getBrandKit` throws at runtime (400 `column businesses.brand_kit does not exist`) — dashboard won't load galleries. |
| `business_tokens` + `token_ledger` + `record_image_upload` (mig 043/065) | present | **MISSING** | Photo **upload** fails (not referenced by 088–103, but the deployed app needs it). |
| `clients.slug` (+ `access_code_hash`) | present | **1 of 3 present** | **102 `resolve_client_portal` and 092 owner-detail reference `clients.slug` → FAIL / short portal route broken.** |
| `galleries.status` type | `gallery_status` enum | **`text`** | String comparisons in 095 policies still work; but any code path expecting the enum differs. Low risk, note only. |
| `pg_trgm` extension | installed | **NOT installed** | 098 handles this (`CREATE EXTENSION IF NOT EXISTS pg_trgm`) — OK, but the `extension_in_public` lint will appear. |

Prerequisites that ARE present on Staging (good): `clients` table, `gallery_sections`, `current_business_id()`, `businesses.business_name/slug/user_id`, `galleries.client_id/status/business_id/delivery_settings/slug/face_index_enabled/download_count`.

## 4. Required migration order from the current Staging state
1. **First close the base-schema gap** (bring Staging to Production parity). Recommended: apply the intervening Production migrations Staging is missing (at minimum the equivalents of **043** token economy, **052/058/065** images+sections+public-thumbs, **064** event columns, **072** brand_kit, and the `clients.slug`/`access_code_hash` additions), OR re-provision Staging's DB from a Production **schema-only** snapshot. Do **not** hand-cherry-pick columns ad hoc — verify against Production `information_schema`.
2. **Then apply 088 → 103 strictly in numeric order.** Hard ordering constraints within the set: **097 before 098** (098 indexes + RPC reference 097 columns); **096/099/100 before 101/103** (101/103 modify their policies/grants); **088 before 102** (102 joins `client_memberships`). Each has a paired rollback file.
3. `pg_trgm` is created by 098; no separate step needed.

## 5. Extensions required
- `pg_trgm` (098) — currently absent on Staging. `pgcrypto`/`citext` are used by 088/096 (`gen_random_uuid`, `citext`); verify they exist on Staging before 088 (they are Supabase defaults, but confirm).

## 6. Conflicting objects to check before apply
- **Policy names**: 095 creates `galleries_member_select`, `images_member_select`, etc. Staging already has 3 policies on `galleries` — confirm none share these names (they shouldn't; CPV2 names are unique).
- **Function names**: `cpv2_set_updated_at`, `client_portal_bootstrap`, `search_owner_content`, `resolve_client_portal`, etc. — none exist on Staging (verified 0), so no clash.
- **Audit CHECK**: 097 drops/re-adds `client_access_audit_action_check` — but `client_access_audit` only exists after 090, so order handles it.
- **Triggers/grants/buckets**: CPV2 migrations don't create storage buckets (Staging already has them) and don't add triggers to pre-existing tables except the `cpv2_set_updated_at` triggers on the new CPV2 tables. No conflict expected.

## 7. Estimated migration risk
- **Base-schema gap closing: HIGH** (touches core tables `galleries`/`businesses`/`clients` on a DB with real data; must be additive + validated).
- **088–103 themselves: MEDIUM** once the base gap is closed — they are additive with rollbacks, but 097's audit-CHECK swap and 103's policy rewrites need validation, and they run on a DB with 2 businesses / 5 galleries / 0 clients.

## 8. Data backup requirements
- Full logical backup (`pg_dump`) of Staging **before any change**, verified restorable to a scratch project. Snapshot the `public` schema + `auth` + `storage` metadata. Confirm PITR/backup retention is enabled on the Staging project.

## 9. Storage backup requirements
- Storage objects are not covered by SQL rollback. Inventory the Staging buckets' object counts before/after. No CPV2 migration writes/deletes storage objects, so risk is low, but record counts for `gallery-images` / `gallery-images-thumbs-public` as a baseline.

## 10. Authentication configuration differences
- Owner auth is Google OAuth. Verify the Google provider is configured on Staging with the correct redirect URLs for the Staging domain. Client-portal auth is email/password (Supabase) + invitation acceptance — verify email templates and that `/client-invite/accept` + `/client-login` redirect URLs match the Staging domain. Leaked-password protection setting differs across projects (advisory only).

## 11. Environment variable checklist (Vercel + server)
- `VITE_SUPABASE_URL` / `SUPABASE_URL` → Staging Supabase.
- `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` → Staging publishable/anon.
- `SUPABASE_SERVICE_ROLE_KEY` → Staging service role (server-only; never `VITE_`).
- `FEATURE_SOCIAL_STUDIO` / `VITE_FEATURE_SOCIAL_STUDIO` → **unset** (Social stays locked).
- `ANTHROPIC_API_KEY`, `SENTRY_DSN`, analytics IDs → Staging values.
- Confirm no Production Supabase ref (`vlyiqfawkrjvqcmkpfvs`) appears in any Staging env var.

## 12. Vercel Staging project verification
- **Open item:** there is no dedicated `pixflow-staging` **Vercel** project in the team (projects seen: `gallery-web` [prod], `gallery-flow`, `pixflow-client-portal-v2-qa-web` [QA]). Confirm how Staging is served: a Staging **environment/branch** on the `gallery-web` project, or a separate project to be created. Verify its env vars per §11 and that it points at the Staging Supabase, not prod.

## 13. Client portal domain & redirect URL requirements
- The short portal route `/:businessSlug/c/:clientSlug` and `/client-login`, `/client-invite/accept` must resolve on the Staging domain. Add the Staging domain to Supabase Auth "Redirect URLs" allow-list. Invitation links + password-reset links are generated with the app origin — verify the Staging origin is used.

## Do not assume
Migrations 088–103 **cannot** be applied blindly to Staging. The base-schema gap (event columns, brand_kit, clients.slug, token economy) must be closed first, or the apply will fail partway. Treat this as a two-phase rollout: (A) bring Staging to prod parity, (B) apply 088–103.
