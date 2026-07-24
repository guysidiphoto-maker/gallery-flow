# Migration Runbook — CPV2 + overnight (088–103)

Command-by-command runbook for applying migrations 088–103 to an environment. **Do not run this against Production or Staging without explicit sign-off.** It was authored from the isolated QA rollout. Read `STAGING-PREFLIGHT-PLAN.md` first — on Staging you must close the base-schema gap (Phase A) before Phase B here.

> **Rollback reality:** database migrations that touch real data **cannot always be rolled back with a single command.** Rollback files drop the objects they created; any data written after apply is lost, and forward-fix is often safer than rollback. Storage buckets/objects and auth config are **not** covered by SQL rollback. Every step below states its rollback-or-forward-fix stance.

## 0. Preflight checks (STOP if any fails)
- [ ] Confirm target project ref is the intended one (echo it; never run against `vlyiqfawkrjvqcmkpfvs`/prod unless that is the explicit, signed-off target).
- [ ] `select current_database(), inet_server_addr();` — confirm you are on the right DB.
- [ ] Base schema at parity (Staging: Phase A complete). Verify prereqs exist: `galleries.event_type/event_location/event_date`, `businesses.brand_kit`, `clients.slug`, `gallery_sections`, `current_business_id()`. **STOP** if any missing.
- [ ] Extensions: `select extname from pg_extension where extname in ('pgcrypto','citext','pg_trgm');` (pg_trgm will be added by 098; pgcrypto/citext must pre-exist).
- [ ] No name clashes: `select proname from pg_proc where proname in ('client_portal_bootstrap','search_owner_content','resolve_client_portal');` → expect 0 rows.
- [ ] App is on a compatible build (this PR's HEAD) or a feature freeze is in effect (see §Feature freeze).

## 1. Backup verification
- [ ] `pg_dump` logical backup taken **and test-restored** to a scratch project within the last hour. Record the dump path + checksum.
- [ ] Confirm PITR/automatic backups enabled on the target; note the current LSN/timestamp as the restore point.
- [ ] Storage baseline: `select bucket_id, count(*) from storage.objects group by 1;` — record counts.
- [ ] **STOP** if no verified restore point exists.

## 2. Maintenance / feature-freeze requirements
- CPV2 migrations are additive, so a hard maintenance window is not strictly required, but: freeze deploys of the web app during the DB apply so the running app never sees a half-applied schema. Prefer a low-traffic window. The audit-CHECK swap (097) and policy rewrites (103) are the only brief moments where a concurrent write could error; keep them to seconds.

## 3. Migration order (apply one at a time, validate after each)
Apply strictly in this order. After EACH, run its validation block (§4) and the stop-conditions check (§5).

`088 → 089 → 090 → 091 → 092 → 093 → 094 → 095 → 096 → 097 → 098 → 099 → 100 → 101 → 102 → 103`

Per-migration apply (Supabase CLI example; or MCP `apply_migration`):
```
supabase db push --db-url "$TARGET_DB_URL"   # if using CLI-managed history
# or apply the exact file contents transactionally:
psql "$TARGET_DB_URL" -1 -f supabase/migrations/088_client_memberships.sql
```
Hard constraints: **097 before 098** (098 references 097 columns); **088 before 102**; **096/099/100 before 101/103**.

## 4. Validation after every migration
Generic (run after each):
```
-- object created?
select to_regclass('public.<table_created_by_this_migration>');
select proname from pg_proc where proname = '<function_created>';
-- RLS present + enabled on new tables?
select relname, relrowsecurity from pg_class where relname = '<new_table>';
select policyname, cmd, roles::text from pg_policies where tablename = '<new_table>';
-- grants: anon must NOT have EXECUTE on owner/member RPCs
select has_function_privilege('anon', '<fn>(<args>)', 'EXECUTE');  -- expect false
```
Migration-specific must-pass checks:
- **088**: `client_memberships` + `client_invitations` exist; self-only RLS; `cpv2_set_updated_at` trigger fn present.
- **089**: `business_entitlements` exists; `has_business_entitlement` service_role-only; default deny (no active rows).
- **090**: `client_access_audit` exists; action CHECK has the 14 base actions.
- **091–094**: `client_portal_bootstrap`, `cpv2_assign_gallery`, owner read RPCs, entitlement bootstrap present; anon cannot execute the service-role primitives.
- **095**: member-read policies on galleries/images/sections/stories; a non-member cannot read a live gallery's rows.
- **096**: `onboarding_progress` self-RLS, no DELETE policy.
- **097**: 5 new gallery columns exist; **0 rows backfilled** (`select count(*) from galleries where event_size_bucket is not null` = 0); audit CHECK now includes `gallery_metadata_updated` + all `import_*` actions **and** still the full 090 list.
- **098**: `pg_trgm` installed; `search_owner_content` exists, `SECURITY DEFINER`, anon revoked; a call with no business returns empty (fail closed).
- **099**: import tables exist, owner-scoped SELECT, no client write policy.
- **100**: tender tables exist, owner-scoped RLS.
- **101**: `select grantee,privilege_type from information_schema.role_table_grants where table_name='tender_collections'` → anon absent, authenticated has CRUD.
- **102**: `resolve_client_portal`/`_by_id` exist, authenticated+service_role only; membership-gated (enumeration test in §RLS tests).
- **103**: all listed policies still exist with identical names; `pg_policies.qual` now contains `(select auth.uid())`.

## 5. Stop conditions
STOP the rollout immediately if any of:
- A migration errors (do not continue to the next).
- A validation check fails (object missing, RLS off, anon can execute an owner/member RPC, 097 backfilled rows).
- App error rate rises after a deploy of the compatible build.
- Any cross-tenant read succeeds in the RLS tests (§7).

## 6. Smoke tests (after all 16 applied, with the compatible app build)
- Owner signs in → dashboard loads (Overview, Clients, Import; no Tender, no Social).
- Owner creates a client + a gallery + assigns it.
- Client accepts an invitation, signs in, sees only assigned published galleries.
- Search returns tenant-scoped results with match reasons.

## 7. RLS tests (adversarial; run as impersonated roles)
```
set local role authenticated;
set local request.jwt.claims = '{"sub":"<memberA-uuid>","role":"authenticated"}';
-- member sees only their client's live galleries:
select count(*) from galleries where status='live';           -- only their client's
-- cross-business: tampered query for another client → 0:
select count(*) from galleries where client_id='<other-client>' and status='live';  -- 0
-- portal resolver enumeration-safe:
select count(*) from resolve_client_portal('<other-biz>','<other-client>');  -- 0
reset role;
-- anon cannot execute owner/member RPCs:
set local role anon; select has_function_privilege('anon','search_owner_content(text,jsonb)','EXECUTE'); -- false
```
All must pass. Any non-zero cross-tenant result is a STOP.

## 8. Storage tests
- Owner can upload to `gallery-images` for their own gallery (owner_write policy).
- Anon cannot read a **draft** gallery's objects; can read a **live** gallery's objects (public bucket + `status='live'` policy).
- Another business's owner cannot write to the first's gallery path.
(These require the upload pipeline present — on Staging, Phase A must include `record_image_upload` + storage policies.)

## 9. Auth tests
- Google OAuth owner login on the target domain.
- Client email/password login + invitation acceptance flow; invitation + reset links use the target origin.
- Disabled/revoked membership → immediate loss of access (bootstrap returns empty).

## 10. Client portal tests
- Short route `/:biz/c/:clientSlug` resolves for a member (via `resolve_client_portal`), and returns nothing for a non-member.
- Published gallery appears immediately in the correct client's portal; draft hidden; reassign/unassign update access immediately.
- Social nav item shows "Coming soon" and is not routable; entitled client can use Tender.

## 11. Rollback / forward-fix per migration
- **088–096, 099, 100, 102**: created new tables/functions only → rollback = run the paired `_rollback.sql` (drops them). Safe **only if** no dependent data was written you need to keep (e.g. real invitations/memberships in 088, import jobs in 099, tender collections in 100). If data exists, prefer forward-fix.
- **097**: rollback drops the 5 columns (data in them lost) and **restores the original audit CHECK** — but only safe if no `import_*`/`gallery_metadata_updated` audit rows were written (they'd violate the restored CHECK). If such rows exist, forward-fix (leave the extended CHECK) instead of rolling back.
- **098**: rollback drops the function + indexes, keeps `pg_trgm`. Safe.
- **101**: rollback revokes the authenticated grants (RLS still governs). Safe.
- **103**: rollback restores bare `auth.uid()` policies. Safe (perf-only change).
- **Storage/auth**: no SQL rollback — reverse manually (remove buckets/policies/redirect URLs) if they were added in Phase A.

## 12. Exact criteria for ABORTING the rollout
- Any migration or validation fails and cannot be forward-fixed within the window.
- Any cross-tenant data access observed.
- Backup/restore point cannot be confirmed.
- App cannot be rolled back to a compatible build.
→ On abort: stop applying further migrations; decide rollback-vs-forward-fix per §11 for what was applied; restore from backup only as a last resort (and only if no post-apply data must be preserved).

## 13. Exact criteria for CONTINUING
- The just-applied migration's validation block passed 100%.
- RLS adversarial checks for the objects it touched return the expected zeros.
- No app error-rate regression.
→ Then proceed to the next migration in order.

## 14. Post-deployment monitoring
- Watch Supabase logs + Sentry for `column ... does not exist`, `function ... does not exist`, RLS `permission denied`, and 403 `feature_disabled` (expected only on Social endpoints).
- Watch the `client_access_audit` table for correct action logging.
- Re-run `get_advisors` (security + performance) and confirm no new Critical/High.
- Monitor for 24h before declaring done.

## 15. Cleanup steps
- Remove any temporary scratch restore project.
- Delete local dump files containing data once the window closes (they contain customer data).
- Revoke any temporary elevated access used for the rollout.
- Update the migration history/record so the environment's tracked version reflects 088–103.
