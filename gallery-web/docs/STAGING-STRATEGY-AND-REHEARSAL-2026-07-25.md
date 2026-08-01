# Staging Strategy + Production-Baseline Migration Rehearsal (2026-07-25)

Nothing was applied to Production or the existing Staging DB. All rehearsal was on a local, no-cost, synthetic environment.

## A. Production baseline (read-only inspection) — READY
Production (`vlyiqfawkrjvqcmkpfvs`, migration `20260721140604`, 84 migrations) HAS every prerequisite that 088–103 need:
`galleries.event_type/event_location/event_date` (064) ✓ · `businesses.brand_kit` (072) ✓ · `clients.slug` + `access_code_hash` (057) ✓ · `business_tokens` + `token_ledger` + `record_image_upload` (043/065) ✓ · `gallery_status` enum (063) ✓ · storage buckets ✓. `pg_trgm` is absent but **098 creates it** (`CREATE EXTENSION IF NOT EXISTS`). The CPV2 objects (088–103) are all absent (clean slate). **Prod can accept 088–103.**

## B. No-cost migration rehearsal (pglite, PostgreSQL 18.3 WASM) — PASS
A prod-exact-shaped baseline was reconstructed locally from Production's exact `information_schema` column definitions (6 prerequisite tables) + the real `gallery_status` enum + `citext`/`pg_trgm`/`pgcrypto` + `authenticated`/`anon`/`service_role` roles + an `auth`/`storage` stub. **No customer data, no Production connection, synthetic only.** Then:
- **Migrations 088 → 103 applied cleanly, in order, all 16.** No migration was edited to pass (the only fix was completing the local `auth.users` stub with an `email` column, which real Supabase `auth.users` already has). Final: 17 tables / 132 functions / 21 policies; 6 CPV2 tables; `search_owner_content` present; **0-backfill confirmed** (`event_size_bucket` non-null rows = 0).
- **RLS / grant smoke (on the applied chain):** member sees exactly their 1 assigned live gallery + 1 membership; an outsider sees 0/0; `resolve_client_portal` returns 1 for the member and **0 for the outsider (enumeration-safe)**; `anon` cannot EXECUTE `search_owner_content` (false), `authenticated` can (true).
- **Rollback verification:** all 16 `_rollback.sql` files applied cleanly in reverse (103→088); afterwards CPV2 tables = 0, `search_owner_content` = 0, and the **6 prerequisite base tables remained intact** (rollbacks drop only CPV2 objects, not the base schema).

Conclusion: the migration chain 088–103 and its rollbacks are mechanically sound against the exact Production schema shape. This is a DDL/RLS-level rehearsal; full application behavior (upload, publish, portal, search, tender, social-lock, pixieset, mobile, download, signed-URL isolation, cleanup) was already proven on the isolated QA Supabase Preview earlier.

## C. Existing Staging (read-only) — behind Production
Staging (`bkccdomovxtuqdxrahnc`, migration `20260626095150`, 35 migrations) is **materially behind Production**: missing `galleries.event_type/event_location/event_date` (064) → 098 would fail; missing `businesses.brand_kit` (072) → app runtime error; missing `clients.slug` → 102/092 fail; missing `business_tokens`/`token_ledger`/`record_image_upload` (upload broken); `galleries.status` is `text` not the enum; `pg_trgm` absent. It has data (2 businesses / 5 galleries / 0 clients).

## D. Staging strategy comparison
| Dimension | A. Repair existing Staging | B. Fresh Staging from Prod schema (synthetic data) |
|---|---|---|
| Risk | **HIGH** — apply ~many intervening prod migrations onto a drifted DB, in order, then 088–103 | **LOW/MED** — clean parity baseline, 088–103 rehearsed clean |
| Time | HIGH (reconstruct + apply the missing prod migrations + debug drift) | MED (create project, load prod schema-only, seed synthetic, apply 088–103) |
| Cost | $0 (no new resource) | **$10 / month** (new Supabase project on the Pro org) |
| Migration reliability | LOW (unknown drift, timestamp history, possible manual edits) | HIGH (exact prod baseline; rehearsal green) |
| Data contamination risk | MED (existing Staging data of unknown provenance to audit) | LOW (schema-only + synthetic; **no customer data** if the dump is schema-only) |
| Auth setup | Reuse existing | Fresh (configure Google OAuth + redirect URLs) |
| Storage setup | Reuse existing buckets | Fresh (recreate buckets + policies from prod) |
| Vercel config | Reuse existing wiring | New env pointing at the fresh project |
| Rollback ability | Harder (mixed history) | Clean (known baseline; rollbacks rehearsed) |
| Long-term maintainability | LOW (drift persists; Staging ≠ Prod) | HIGH (reproducible; can rebuild from prod anytime) |
| Hidden schema-drift risk | **HIGH** (this is the root problem today) | LOW |

**Recommendation: Option B — a fresh Staging environment from the current Production schema, synthetic data only.** It matches your stated preference and directly eliminates the confirmed drift that makes the existing Staging unreliable. The single manual dependency: obtaining a **schema-only** snapshot of Production (`pg_dump --schema-only`, which contains **no** customer rows) requires the Production DB connection string/password (which I do not have and did not request) or Supabase's branch/diff tooling. Storage buckets + policies and Google-OAuth redirect URLs must be recreated on the fresh project.

## E. Costs
- Fresh Supabase Staging project: **$10 / month** (org `guysidiphoto-maker's Org`, Pro plan; confirmed via cost API). No other paid resource is required. The local pglite rehearsal and the QA Vercel Preview are $0.

## F. Remaining blockers
1. Approval to create the $10/mo fresh Staging project (or to obtain a prod schema-only dump).
2. A schema-only prod snapshot (needs prod DB credentials or Supabase tooling) — the one input I can't produce.
3. Recreate storage buckets/policies + Google-OAuth redirect URLs on the fresh Staging.
4. Then run the full app QA on Staging (upload/publish/portal/search/tender/social/isolation) before Production.

## G. GO / NO-GO
- **Create a new Staging environment:** **GO (recommended)** — conditional on your explicit approval of the $10/mo cost. I will not create it without it.
- **Merge the Draft PR:** **NO-GO (yet)** — the code review is clean (no must-fix), the migration chain + rollbacks are rehearsed green, and QA is proven; but merge should wait until the fresh Staging validates the full flow end-to-end and you sign off. Base branch = `main`; `main` has 1 commit past the branch point (rebase/merge check before merge).
- **Production:** **NO-GO** — gated on: fresh Staging validation, a verified prod backup, the migration runbook executed with per-step validation, and your explicit approval.
