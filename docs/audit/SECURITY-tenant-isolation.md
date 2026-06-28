# Security Audit — Tenant Isolation & Platform Security (Pixflow)

**Date:** 2026-06-29
**Auditor role:** Security Engineer (READ-ONLY audit; no prod mutations performed)
**Prod project:** `vlyiqfawkrjvqcmkpfvs` (https://pixflow-ai.com)
**Scope:** Tenant isolation, RLS coverage, SECURITY DEFINER RPC inventory, storage exposure.
**Out of scope (other owners):** AI-cost endpoints; the 4 already-fixed RPCs (`add_tokens`, `reset_subscription_tokens`, `mark_gallery_paid`, `set_client_access_code`) — confirmed locked (see below).

---

## Executive Summary

Core tenant isolation in Pixflow is **mostly sound**: every public table has RLS enabled; the owner-scoped policies and the SECURITY DEFINER mutation RPCs (`update_gallery_settings`, `gallery_publish`, `duplicate_gallery`, `set_gallery_password`, `reorder_images`, `record_image_upload`, `set_business_custom_domain`, `gallery_activity_summary`) **all enforce `auth.uid()`/`current_business_id()` ownership internally**, so the broad `anon`/`authenticated` EXECUTE grants on them fail closed. I found **no SECURITY DEFINER sibling to the 4 fixed token/payment RPCs that is still PUBLIC-executable and mutates cross-tenant billing state** — the privileged mutators (`add_tokens`, `reset_subscription_tokens`, `mark_gallery_paid`, `set_client_access_code`, `images_needing_derivative`) have `proacl` with NO anon/authenticated EXECUTE (confirmed locked). However, I found **three confirmed cross-tenant READ leaks reachable by `anon`** (an over-broad `feed_plans` policy that will leak every business's social/feed plans the moment a 2nd business uses the feature; an `image_ai_scores` "always-true" policy; and a `vendors` "always-true" read policy exposing vendor PII), plus **draft (unpublished) gallery metadata readable by anon** via `gallery_get_meta`. There are also weak anti-abuse controls (gallery-password rate limit degrades to a 10s cooldown; public gallery session issuance does not enforce the Turnstile flag).

### VERDICT: **NOT LAUNCH-SAFE for public self-serve signup as-is — but close.**

Tenant *write* isolation is launch-safe. Tenant *read* isolation is **not**: the `feed_plans`, `vendors`, and `image_ai_scores` anon-read policies are genuine cross-tenant data-leak bugs that violate isolation for any multi-tenant feature, and they get worse as more businesses sign up. These are small, surgical RLS fixes (P0/P1) that must land before broad public signup. After fixing the three anon-read policies and tightening `gallery_get_meta` to live-only, tenant isolation is launch-safe.

---

## 1. RLS Coverage Summary

All 33 public tables have `rls_enabled = true`. None use `FORCE ROW LEVEL SECURITY` (acceptable — table owner is not used at runtime; Supabase roles are `anon`/`authenticated`).

Tables with **RLS enabled but ZERO policies** = deny-all to anon/authenticated; only reachable via SECURITY DEFINER RPCs. These are intentional and safe:
`client_code_attempts`, `client_session_tokens`, `face_search_cache`, `gallery_password_attempts`, `gallery_unlock_tokens`, `plans`, `public_gallery_sessions`, `rekognition_search_log`, `subscriptions`, `token_ledger` (note: token_ledger DOES have an owner-select policy), `client_session_tokens`. Confirmed empty to anon by live count test (`businesses=0, clients=0, event_leads=0, q_responses=0, token_ledger=0` visible to anon role).

Tables exposing rows to **anon** (live count, prod, via `SET LOCAL ROLE anon`):
- `galleries` → 81 (live + password_hash IS NULL — expected; public galleries).
- `images` → 8754 (images of live public galleries — expected).
- `feed_plans` → 6 (**LEAK**, see F1).
- `image_ai_scores` → 303 (**LEAK**, see F3).
- `vendors` → 0 today but policy is always-true (**LEAK latent**, see F2).
- `events`, `questionnaires` → public-by-design (active rows only).

---

## 2. SECURITY DEFINER RPC Inventory (prod)

37 SECURITY DEFINER functions in `public`. Grants determined from `pg_proc.proacl`.

**Locked (NO anon/authenticated EXECUTE — confirmed):**
`add_tokens`, `reset_subscription_tokens`, `mark_gallery_paid`, `set_client_access_code` (the 4 fixed), plus `images_needing_derivative`. ✅ No PUBLIC-executable sibling to the fixed RPCs exists. This is the headline negative result and it holds.

**Granted to anon/authenticated but ownership-enforced internally (SAFE — fail closed for anon):**
`duplicate_gallery`, `gallery_publish`, `update_gallery_settings`, `set_gallery_password`, `reorder_images` (authenticated only), `record_image_upload`, `set_business_custom_domain`, `gallery_activity_summary`. Each calls `auth.uid()` / `current_business_id()` and raises/returns error on mismatch. Reviewed line-by-line. No cross-tenant write path found.

**Granted to anon — public gallery surface (by design, gated by `_gallery_authz` or status):**
`gallery_bootstrap`, `gallery_get_images`, `gallery_get_stories`, `gallery_get_hidden`, `gallery_set_hidden`, `gallery_is_locked`, `gallery_token_is_valid`, `_gallery_authz`, `get_business_by_slug`, `get_vendor_by_code`, `issue_public_gallery_session`, `verify_public_gallery_session`, `verify_gallery_password`, `verify_client_code`, `verify_client_token`, `is_business_slug_taken`, `get_my_token_balance`, `get_my_token_balance`. See findings F4–F7 for the weaknesses among these.

---

## FINDINGS

### F1 — [P0] `feed_plans` anon SELECT policy leaks all businesses' feed plans cross-tenant
- **Object:** policy `feed_plans_public_select` on `public.feed_plans`, role `anon`.
- **Policy SQL:** `USING (status = ANY (ARRAY['draft','accepted','published']))` — **no `business_id` scoping at all.**
- **Impact:** Any anonymous visitor can `SELECT * FROM feed_plans` and read **every business's** AI/social feed plans (captions, scheduling, strategy, image refs) across all tenants — the entire "AI Visual OS" product surface is cross-tenant readable. Today only 1 business has feed plans (6 rows, 1 distinct business — confirmed by live count), so impact is currently contained, but it is a **direct tenant-isolation violation** that scales linearly with signups.
- **Exploit/financial risk:** Competitor/scraper harvests every customer's content strategy and unpublished post drafts. Reputational + competitive-IP leak. This is the flagship paid feature (memory: 5000₪/mo target).
- **Why it exists:** Looks intended to let the public gallery page render an "accepted/published" feed, but the predicate forgot tenant scoping AND includes `draft`.
- **Fix (SQL sketch):** Replace with an owner-or-published-and-scoped policy. If anon truly needs published feed for a specific gallery/business, scope it:
  ```sql
  DROP POLICY feed_plans_public_select ON public.feed_plans;
  CREATE POLICY feed_plans_public_select ON public.feed_plans FOR SELECT TO anon
    USING (status = 'published'
      AND EXISTS (SELECT 1 FROM businesses b JOIN galleries g ON g.business_id=b.id
                  WHERE b.id = feed_plans.business_id AND g.status='live'));
  ```
  (Better: remove anon access entirely and serve published feed via a SECURITY DEFINER RPC scoped to one business slug.)
- **Can be done safely now:** Yes — pure policy swap, no data change.
- **Production-touched by this audit:** **no.**
- **Rollback:** Re-create the original policy from migration `051_feed_plans.sql` / `056_feed_plans_draft_visibility.sql`.

### F2 — [P1] `vendors` anon SELECT policy is `USING (true)` — leaks all vendor PII cross-tenant
- **Object:** policy `vendors_public_read` on `public.vendors`, role `anon`, `USING (true)`.
- **Impact:** Any anon can read **all** vendor rows across all tenants, including columns `email`, `instagram`, `website`, `business_id`, `name`, `category` (per `get_vendor_by_code` return shape). PII exposure (vendor email/handles) + tenant-graph disclosure.
- **Current data:** 0 vendor rows in prod → **not actively leaking today**, but ships broken; any vendor created post-launch is exposed.
- **Exploit risk:** Email harvesting / spam; mapping which vendors belong to which production company.
- **Fix:** Vendors are accessed publicly only via `get_vendor_by_code(p_code)` (SECURITY DEFINER, already scoped to a single code). The table-level anon policy is redundant and dangerous — drop it:
  ```sql
  DROP POLICY vendors_public_read ON public.vendors;
  ```
  Public vendor lookups continue to work through the RPC.
- **Can be done safely now:** Yes. **Production-touched:** no.
- **Rollback:** Re-create from `vendors` migration if a direct-read use case surfaces.

### F3 — [P1] `image_ai_scores` anon SELECT policy is `USING (true)` — cross-tenant read
- **Object:** policy `image_scores_public_read` on `public.image_ai_scores`, role `anon`/`authenticated`, `USING (true)`.
- **Impact:** Any anon can read all 303 AI score rows for **all** tenants' images (image_id, scores). Not catastrophic PII, but it is a cross-tenant data leak of a private ML signal and links image IDs across businesses. Violates isolation.
- **Fix:** Scope to the owning business, or (if needed for the public gallery "top picks" render) scope to live galleries:
  ```sql
  DROP POLICY image_scores_public_read ON public.image_ai_scores;
  CREATE POLICY image_scores_owner ON public.image_ai_scores FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM images i JOIN galleries g ON g.id=i.gallery_id
                   WHERE i.id = image_ai_scores.image_id AND g.business_id = current_business_id()));
  -- (add a scoped anon policy only if the public gallery actually needs scores)
  ```
- **Can be done safely now:** Yes. **Production-touched:** no.
- **Rollback:** Re-create from `052_image_ai_scores.sql`.

### F4 — [P1] `gallery_get_meta` (SECURITY DEFINER, anon-exec) returns DRAFT gallery metadata
- **Object:** `public.gallery_get_meta(p_gallery_id uuid)`.
- **Code:** returns the gallery row (minus `password_hash`) when `status IN ('live','published','draft')`. **`draft` should not be exposed to anon.**
- **Proof (prod, anon role):** Called with a real draft gallery UUID (`32c75e25-…`) → returned `status="draft"`, full `name` + `delivery_settings`. 25 draft galleries exist in prod.
- **Impact:** Anon who knows/guesses a draft gallery UUID reads the photographer's unpublished gallery name, event details, branding/delivery settings before publish. UUIDs are not secrets — they appear in dashboard URLs, share previews, logs. Note: draft *images* are NOT leaked (gallery_get_images → `_gallery_authz` requires `status='live'`, returns nothing for draft — verified). So this is metadata-only, hence P1 not P0.
- **Fix:** Restrict to live/published:
  ```sql
  -- change predicate to: IF status_ IS NULL OR status_ NOT IN ('live','published') THEN RETURN NULL;
  ```
  Same hardening should be applied to `gallery_bootstrap` which also accepts `status IN ('live','draft')`.
- **Can be done safely now:** Yes (function replace). Verify the desktop preview flow doesn't rely on anon reading its own draft (it should use the authenticated owner path). **Production-touched:** no.
- **Rollback:** Re-deploy `gallery_get_meta` from `068`/prior migration.

### F5 — [P2] Gallery password rate-limit degrades to a 10-second cooldown (brute-forceable)
- **Object:** `public.verify_gallery_password`.
- **Code:** after 5 failed attempts, it only enforces a **10-second** (`cooldown_sec := 10`) cooldown, then allows another attempt; the failed_count is not reset on cooldown so it stays in the throttled state, but the gate is "1 attempt per 10s" indefinitely — ~8,640 guesses/day per gallery, no IP binding, no lockout escalation.
- **Impact:** Weak gallery passwords are brute-forceable over days. Galleries currently have `live_password_protected = 0` in prod, so **no active exposure today**, but the control is weak for launch.
- **Fix:** Exponential backoff or hard lockout after N failures; bind attempts to IP; consider Turnstile after 5 fails. Also enforce a minimum password length in `set_gallery_password`.
- **Safe now:** Yes (function change). **Production-touched:** no.

### F6 — [P2] `issue_public_gallery_session` ignores the Turnstile validation flag
- **Object:** `public.issue_public_gallery_session(..., p_turnstile_validated boolean)`.
- **Code:** stores `p_turnstile_validated` but **never requires it to be true** before minting a 60-minute session token. The CAPTCHA result is decorative server-side.
- **Impact:** Bots can mint public gallery sessions at will (the anti-abuse / anti-scrape control is bypassable by passing `false`). Enables automated scraping of public galleries / download-log spam. Severity P2 because public galleries are public anyway and downloads are logged; the Turnstile gate is an abuse-rate control, not an authz boundary.
- **Fix:** `IF NOT p_turnstile_validated THEN RAISE EXCEPTION 'turnstile_required'; END IF;` — but the boolean is **client-supplied and trivially spoofed**; real fix is to verify the Turnstile token server-side (in the Vercel API / edge function) before calling this RPC, and pass a server-trusted boolean. Audit the `gallery-web/api` caller.
- **Safe now:** Server-side verification is a code change in the API layer, not just SQL. **Production-touched:** no.

### F7 — [P3] `questionnaire_responses` INSERT policy `WITH CHECK (true)` (advisor: rls_policy_always_true)
- **Object:** policy `Anyone can submit responses` on `public.questionnaire_responses`, role `public`, `WITH CHECK (true)`.
- **Impact:** Anyone can insert a questionnaire response for **any** questionnaire_id (no check that the questionnaire exists/is active/belongs to a real business). Spam/garbage rows; not a cross-tenant *read* leak (read side is owner-scoped). Low severity but should be scoped to active questionnaires:
  ```sql
  WITH CHECK (EXISTS (SELECT 1 FROM questionnaires q WHERE q.id = questionnaire_id AND q.is_active));
  ```
- **Safe now:** Yes. **Production-touched:** no.

### F8 — [P3] Public storage buckets allow anonymous object **listing**
- **Object:** advisor `public_bucket_allows_listing` → buckets `business-brand`, `demo-uploads`, `gallery-stories`.
- **Detail:** These buckets have `public=true` AND broad anon `SELECT` storage.objects policies (`business_brand_public_read USING (bucket_id='business-brand')`, `demo_uploads_select`, `gallery_stories_public_read USING (bucket_id='gallery-stories')`) with no path scoping, so anon can **enumerate** object keys (not just fetch a known URL). For `gallery-stories` this means listing every business's story video/image keys cross-tenant.
- **Impact:** Object-key enumeration → harvest of all story media URLs across tenants (content is then directly fetchable since bucket is public). Cross-tenant content disclosure for the stories feature. P3 only because the content is already served publicly on live gallery pages; the *enumeration of non-live/other-tenant* keys is the marginal leak.
- **Fix:** Tighten the anon `SELECT` policies to scope by the owning live gallery (the `gallery-stories` write policy already scopes by `(storage.foldername(name))[2]` = gallery_id; mirror that in the read policy as `gallery_storage_public_read` does). For `demo-uploads`, scope by demo-session folder.
- **Note (accepted gap):** `gallery-images` bucket is `public=true` and originals are directly URL-reachable — this is the **known/accepted** gap (full-res original retrievable by guessing the path). Its read policy IS scoped to live galleries (`gallery_storage_public_read`), so no cross-tenant *listing*, but the public bucket flag still permits direct fetch of a known original path, bypassing the watermark/paywall. Documented as accepted; not re-litigated here. **Do NOT flip bucket privacy as part of this sprint (out of scope / watermark coupling).**
- **Legacy buckets `images`, `stories`, `thumbnails`:** `public=true` but **0 objects** (verified) — unused; recommend deleting the buckets to reduce surface (not a launch blocker).

### F9 — [P3] 13 functions with mutable `search_path` (advisor: function_search_path_mutable)
- **Functions:** `current_business_id`, `slugify`, `set_updated_at`, `clients_set_slug`, `gallery_sections_set_slug`, `set_gallery_slug`, `cleanup_expired_demo_galleries`, `check_gallery_face_index_complete`, `increment_face_indexed_count`, `recompute_face_indexed_count`, `try_claim_face_indexing`, `story_renders_touch_updated_at`, `debug_auth_state`.
- **Impact:** `current_business_id` is **security-sensitive** (it backs nearly every RLS policy). A mutable search_path on a SECURITY DEFINER/used-in-policy function is a known privilege-escalation vector if an attacker can create objects in a schema earlier on the path. Most of these are SECURITY INVOKER triggers (lower risk), but `current_business_id` should be pinned.
- **Fix:** `ALTER FUNCTION public.current_business_id() SET search_path = public, pg_temp;` (and same for the others). Also remove/lock down `debug_auth_state` before public launch.
- **Safe now:** Yes. **Production-touched:** no.

### F10 — [P3] Supabase Auth: leaked-password protection disabled (advisor: auth_leaked_password_protection)
- **Detail:** HaveIBeenPwned check is OFF. For public self-serve signup, enable leaked-password protection + a minimum password policy in Supabase Auth settings.
- **Safe now:** Yes (dashboard toggle). **Production-touched:** no.

---

## 3. Cross-Tenant WRITE Test (policy/code reasoning — no writes performed)

Reasoned from policy SQL + RPC bodies. Result: **an authenticated user from business A CANNOT read/update/delete business B's rows.**
- Direct table writes: `galleries`, `clients`, `images`, `stories`, `gallery_sections`, `image_faces`, `image_vendor_tags`, `vendors`, `feed_plans`, `business_tokens` all use `business_id = current_business_id()` or an `EXISTS(... business_id = current_business_id())` predicate in both `USING` and `WITH CHECK`. A cross-tenant write fails the `WITH CHECK`.
- RPC writes: every mutator re-derives the caller's business via `auth.uid()`/`current_business_id()`, fetches the target row's `business_id`, and raises `not_owner`/`not_authorized` on mismatch (verified in `duplicate_gallery`, `gallery_publish`, `update_gallery_settings`, `set_gallery_password`, `reorder_images`, `record_image_upload`, `set_business_custom_domain`, `gallery_activity_summary`). No TOCTOU write gap found.
- **Caveat:** `current_business_id()` has a **mutable search_path** (F9). If that function can be shadowed it could undermine ALL write isolation — pin it.

The cross-tenant problems are **READ-side only** (F1/F2/F3/F4/F8), via over-broad anon SELECT policies and a draft-leaking RPC.

---

## 4. get_advisors (security) — Summary

0 ERROR. 81 WARN, 9 INFO. Notable WARN groups:
- `anon_security_definer_function_executable` ×31 / `authenticated...` ×32 — broad EXECUTE grants. Reviewed individually; mutators are ownership-enforced (safe). The relevant exceptions are F4 (gallery_get_meta draft) and the F5/F6 anti-abuse gaps.
- `rls_policy_always_true` ×1 → `questionnaire_responses` (F7).
- `public_bucket_allows_listing` ×3 → `business-brand`, `demo-uploads`, `gallery-stories` (F8).
- `function_search_path_mutable` ×13 (F9).
- `auth_leaked_password_protection` ×1 (F10).
- INFO `rls_enabled_no_policy` ×9 — deny-all tables; intentional, safe.

---

## Priority Roster

| ID | Sev | Object | Fix type | Safe now | Prod touched |
|----|-----|--------|----------|----------|--------------|
| F1 | **P0** | `feed_plans_public_select` policy | RLS swap | yes | no |
| F2 | P1 | `vendors_public_read` policy | drop policy | yes | no |
| F3 | P1 | `image_scores_public_read` policy | RLS swap | yes | no |
| F4 | P1 | `gallery_get_meta` (+`gallery_bootstrap`) draft leak | fn replace | yes | no |
| F5 | P2 | `verify_gallery_password` weak rate-limit | fn change | yes | no |
| F6 | P2 | `issue_public_gallery_session` Turnstile not enforced | API+fn | partial | no |
| F7 | P3 | `questionnaire_responses` always-true insert | RLS swap | yes | no |
| F8 | P3 | bucket listing (business-brand/demo-uploads/gallery-stories) | storage RLS | yes | no |
| F9 | P3 | mutable search_path (esp. `current_business_id`) | ALTER FUNCTION | yes | no |
| F10 | P3 | leaked-password protection off | Auth setting | yes | no |

**No production objects were modified during this audit. All queries were SELECT / read-only role simulation (`SET LOCAL ROLE anon`) only.**

## Launch gate
- **Must fix before public self-serve signup:** F1 (P0), F2/F3/F4 (P1). These are the genuine cross-tenant isolation violations.
- **Strongly recommended before broad launch:** F5, F6, F9 (pin `current_business_id`), F10.
- After F1–F4 land, tenant isolation is **launch-safe**.
