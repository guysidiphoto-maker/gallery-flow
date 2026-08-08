# Client Portal V2 — QA-ONLY Schema Bootstrap (NOT a production migration)

> This documents infrastructure built **only** on the isolated QA Supabase project
> `pixflow-client-portal-v2-qa` (ref `svbtemxmitufxaaszrkv`). It is **QA-only** and
> is **NOT** a production migration. It has **no production parity** — the repo's
> historical migration chain is not cleanly replayable (see the QA run report),
> so prerequisite schema was reconstructed to match prod column definitions where
> feasible. The real migrations `088`–`094` (in `supabase/migrations/`) were
> applied verbatim on top and were **not modified** for QA.

## Connection (non-secret)
- URL: `https://svbtemxmitufxaaszrkv.supabase.co`
- Publishable/anon key: `sb_publishable_2TllJyH-MJeoRFi_OV0vjQ_2cw-VyEy`
- Service-role secret: **not stored here** (must be configured out-of-band; see the stop report).

## How it was built (order)
1. `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` + restored Supabase default grants (anon/authenticated/service_role) + `pgcrypto`/`citext`. (QA sandbox only — synthetic data.)
2. **Reconstructed prerequisite schema** (faithful to prod column defs), lean subset needed by the CPV2 browser flows:
   - Tables: `businesses`, `clients`, `galleries`, `images`, `stories`, `gallery_sections`, `plans` (+ seeded starter/pro/business), `subscriptions` (+ auto-assign trigger), `monthly_usage`, `business_tokens`, `gallery_favorites`, `gallery_download_log`, `client_page_settings`, `gallery_hidden_images`, `client_session_tokens`, `client_code_attempts`.
   - Columns added to match prod: `clients.slug` + `access_code_hash` + `access_code_set_at`; `galleries.event_date`/`event_type`/`event_location`/`slug`/`status`/`face_*`.
   - RPCs: `current_business_id`, `is_business_slug_taken`, `get_business_by_slug`, `get_my_plan`, `get_my_token_balance`, `set_updated_at`, `assign_default_subscription`, `verify_client_code`, `verify_client_token`, `set_client_access_code` (057 verbatim).
   - RLS: owner-scoped `*_owner_*` policies + anon `*_public_live_*` policies mirroring prod (businesses/clients/galleries/images/stories/sections/plans/subscriptions/monthly_usage/business_tokens/favorites/download_log).
3. **Real CPV2 migrations `088`–`094` applied verbatim** (client_memberships, client_invitations, business_entitlements + resolvers, client_access_audit + append RPC, client_portal_bootstrap + service-role primitives, owner read RPCs, auth-user-by-email, bootstrap production_suite flag).
4. **Breakpoint fixes** applied only to the *reconstruction* (never to 088–094): skipped `003` `RENAME storage_path` (snapshot already has `web_preview_path`); skipped `008` placeholder backfill (`<<<YOUR_USER_UUID>>>`); fixed `015`/`044` GB integer-overflow (`N * 1024^3` → `N::bigint * 1024^3`).

## Synthetic test data (no real identities)
- Loginable Auth users (bcrypt password `QaPassw0rd!`, email-confirmed, `email` identity):
  - `photographerA@qa.test` → owns **Studio A** (no entitlement)
  - `photographerC@qa.test` → owns **Production C** (`production_suite` = true)
  - `memberA1@qa.test` → active `client_admin` of **Client A1** (Studio A)
  - `memberC1@qa.test` → active `client_admin` of **Client C1** (Production C)
- Studio A: clients **A1**, **A2**; galleries **A1 Wedding** (live, 1 section + 2 images), **A1 Draft Shoot** (draft). Token balance 250.
- Production C: client **C1**; gallery **C1 Event** (live).

## Schema coverage vs the 24 browser flows
**Present (flows testable):** owner Dashboard shell load (`get_my_plan`/`get_my_token_balance`), ClientsManager (`cpv2_owner_*`), create client, invite/accept (`cpv2_accept_invitation`, `cpv2_auth_user_id_by_email`), client login (password), portal bootstrap (self-scoped), assign/unassign/reassign, disable/reactivate/revoke, cross-tenant + entitlement gating, legacy-PIN fail-closed.

**MISSING (flows NOT runnable on this QA DB):** public-gallery **viewer** + opening/downloading an assigned gallery + password gate + favorites regression — depend on `gallery_bootstrap`, `gallery_get_images/meta/stories/hidden`, `verify_gallery_password`, `issue/verify_public_gallery_session`, `gallery_token_is_valid`, `public_gallery_sessions` (migrations 041/061/068–073, not reconstructed). Also missing: `gallery_activity_summary`, `update_gallery_settings`, `duplicate_gallery`, `set_business_custom_domain`, `record_image_upload`, and tables `feed_plans`, `image_ai_scores`, `vendors`, `events`, `questionnaires`, `story_renders`, `image_faces`.

**Not testable regardless of schema:** photographer login form is **Google-OAuth-only** on web (owner flows require Supabase **session injection**, as the repo's Playwright e2e does); face recognition needs **AWS Rekognition**; original/publish flows need the **desktop app**.

## Assumptions
- The reconstruction is a QA scaffold, **not** prod parity; column sets are the minimum the CPV2 paths touch, matched to prod types.
- Auth users seeded directly via SQL (encrypted_password + `email` identity) because the Auth admin API needs the service-role key (unavailable here).
- All data is synthetic; nothing copied from production.
