# Overnight Launch-Readiness Audit — 2026-06-29

**Acting CTO / Release Manager report.** Simulated 10-role team (1 lead + 6 parallel specialist agents + direct CTO implementation). Window: ~2 hours, overnight. Production: https://pixflow-ai.com · Supabase prod `vlyiqfawkrjvqcmkpfvs` · staging `bkccdomovxtuqdxrahnc`.

Sub-reports (full detail) live in `docs/audit/`: `SECURITY-tenant-isolation.md`, `SIGNUP-self-serve.md`, `PAYMENTS.md`, `QA-matrix.md`, `PERF-DEVOPS.md`, `UX-launch-trust.md`.

---

# ⚡ SPRINT 2 UPDATE — implementation pass (parallel engineering team)

After the audit (below), a second sprint **built and verified the fixes for every P0**. All work is on isolated branches; **production was NOT touched** (read-only verification only). Everything is staged for your one-click approval.

## Task board

| # | Task | Owner role | Status | Branch | Risk | Prod touched | Next step |
|---|---|---|---|---|---|---|---|
| 1 | Blocker 2 — AI endpoint auth | Security+Backend+QA | ✅ **Built + verified** (build clean, 13/13 unit tests, verify script) | `security/blocker2-ai-endpoint-auth` | Low | No | Merge → Preview smoke → atomic deploy |
| 2 | feed_plans P0 read leak | Security+Supabase | ✅ **Migration ready + proven read-only on prod** | `security/feed-plans-anon-read-leak` (mig 080) | Low (reversible DROP) | No | Apply mig 080 to prod (approve) |
| 3 | /en unsafe claims | UX+Frontend | ✅ **Done** (4 fake testimonials + "80% faster" + fake "Free Trial" removed) | `ux/en-trust-cleanup` | Low | No | Merge → deploy |
| 4 | Free-plan guardrails | Payments+Backend | ✅ **Migration + UI ready** (cap 3 galleries, grandfathers all existing) | `plan/free-tier-gallery-cap` (mig 081) | Low (additive + trigger) | No | Apply mig 081 + merge UI |
| 5 | Payments safe state | Payments | ✅ **Done** ("Buy more" gated behind flag; balance kept) | `payments/hide-buy-more-cta` | Low | No | Merge → deploy |
| 6 | Blocker 1 durability | Security | ✅ **Done** (codifying migration) | `security/blocker1-revoke-rpc-migration` (mig 079) | None (idempotent) | No (already locked) | Apply mig 079 (no-op) |
| 7 | gallery-zip crash (P1) | DevOps | ⏳ **Open** — needs env/bundling debug + browser test | — | — | No | Investigate (orig §11) |
| 8 | P1 read leaks (vendors/image_scores/draft-meta) | Security | ⏳ **Diagnosed, not yet patched** (scoped out of feed_plans task) | — | — | No | Second RLS migration |

## What was built + how it was verified

- **Blocker 2** (`security/blocker2-ai-endpoint-auth`): shared gate `gallery-web/server/ownerAuth.ts` (JWT + business-ownership), wired into all 5 AI endpoints, `authedFetch` on all 8 frontend call sites. **Verified:** `vite build` exit 0 (`authedFetch` bundled); **13/13** offline unit assertions (`tests/blocker2-ownerAuth.test.ts`) proving missing-token→401 before any network call, bad-token→401 before any DB read, cross-tenant→403, owner→ok; safe HTTP abuse script `scripts/verify-blocker2-ai-auth.sh`. Only remaining check: a Preview smoke run (needs a deploy).
- **feed_plans** (mig 080): drops the unscoped `anon` SELECT policy. **Proven read-only on prod:** anon could read 6 rows / 1 business / 3 drafts; it is the *only* anon SELECT policy; the authenticated owner path (`feed_plans_owner_select`) and service_role paths are independent → zero functional impact. Reversible.
- **/en** (`ux/en-trust-cleanup`): removed four invented named testimonials + the fabricated "80% faster" stat + two fake "Start Free Trial" CTAs; replaced with honest value-prop copy. Typecheck clean. (Unused `.lp-testimonial*` CSS left in place — harmless.)
- **Free-tier cap** (mig 081 + Dashboard): `businesses.gallery_limit` (NULL=unlimited); existing businesses grandfathered to NULL (prod has 2 with >3 galleries, max 99 — all owner's), new signups default to 3, enforced by a BEFORE INSERT trigger on `galleries` (covers direct insert + duplicate RPC). Friendly Hebrew limit toast added. Photos already capped by the 100-token grant. Reversible.
- **Payments** (`payments/hide-buy-more-cta`): every buy/checkout affordance gated behind `VITE_FEATURE_GALLERY_BILLING` (OFF in prod); token balance still shown; no path reaches `startCheckout` when off. The public ₪590 unlock screen is already protected by the same flag. Typecheck clean.

## Revised launch decision (Sprint 2): **CONDITIONAL GO — pending your APPROVAL + DEPLOY of the staged fixes**

The blocker shifted from *"work isn't done"* to *"work is done and waiting for you to approve applying it."* Every P0 is now built and verified. Public self-serve signup becomes **safe** once you: apply migrations 080+081, deploy Blocker 2 + the /en + payments branches, verify the GoTrue signup config, and decide gallery-zip (P1) + accept P2.4 (known risk).

## Shortest path to launch — exact merge/apply order (sequence risky changes)

1. **Apply mig 079** (Blocker 1 codify — idempotent no-op). *DB. Zero risk.*
2. **Apply mig 080** (feed_plans — closes P0 read leak). *DB. Reversible. Verify anon SELECT now 0.*
3. **Deploy Blocker 2:** merge `security/blocker2-ai-endpoint-auth` → Vercel **Preview** → run `gallery-web/scripts/verify-blocker2-ai-auth.sh` against the Preview (expect all 401/403) → **atomic** prod deploy (backend+frontend together). *Code.*
4. **Deploy `ux/en-trust-cleanup`** (remove fake claims). *Code.*
5. **Apply mig 081 + deploy `plan/free-tier-gallery-cap`** (gallery cap + message), ideally together. *DB+code.*
6. **Deploy `payments/hide-buy-more-cta`**. *Code.*
7. **Manual:** verify Supabase GoTrue signup config (enable_signup / email provider / autoconfirm); investigate `/api/gallery-zip` crash; accept P2.4 originals as known risk (or schedule the staged migration).

After 1–6 + the GoTrue check, **open self-serve signup is launch-safe.** (P1 read leaks in row 8 and gallery-zip in row 7 should follow immediately but are not strict P0 launch blockers — vendors/image_scores tables are empty today; gallery-zip affects "download all", not signup safety.)

---

# 📋 ORIGINAL AUDIT (Sprint 1) — full detail below

---

## 1. Executive summary

The product is **operationally healthy** (no 500s, no timeouts, 0 ERROR-level advisors, galleries/dashboard/signed-downloads all working) and the **write-side tenant isolation is solid** (RLS scopes every mutation by `auth.uid()`/business; the 4 privileged RPCs are confirmed locked). Two of the launch blockers were advanced tonight: **Blocker 1 is now made permanent** (codifying migration on a branch), and **Blocker 2 (AI-cost endpoint abuse) is implemented end-to-end** on a branch, typechecked, ready for Preview verification.

However, **public self-serve signup is NOT launch-safe yet.** The fleet surfaced **four genuine P0s** that open signup would amplify: (1) a cross-tenant **read** leak of the flagship feed-plans feature to anonymous users, (2) the AI-abuse gate (Blocker 2) is built but **not deployed**, (3) **fabricated testimonials** on the `/en` page (FTC/legal risk), and (4) **no enforced free-tier resource caps** beyond the 100-photo token grant (unlimited galleries + unbounded storage/egress per free account) plus an unverified GoTrue signup config.

**Bottom line: do not flip on public self-serve signup tonight.** The path to a safe launch is short and well-defined (Section 18) — most blockers are a single migration, a single deploy, or a copy/flag change away.

## 2. Launch decision: **CONDITIONAL — NO-GO for public self-serve signup as of now**

- **GO** for the *current* invite/low-traffic posture (4 known users) — production is stable and nothing regressed.
- **NO-GO** for *public, open self-serve signup* until the P0s in Section 6 are closed or explicitly accepted.
- This matches your stated intent: you want open signup, but not broken/insecure. The remaining work makes open signup *safe* — it does **not** require disabling signup.

## 3. What changed in PRODUCTION tonight

**Nothing.** Only read-only `SELECT`s and a re-verification of Blocker 1 grants were issued against prod. No DDL, no writes, no deploys, no bucket/storage/payment/auth changes. (Blocker 1's REVOKEs were applied by you *before* this session and were independently re-verified here — still locked.)

## 4. What changed in STAGING tonight

**Nothing.** No staging writes or deploys.

## 5. Branches / commits / PRs created (all pushed; PRs not auto-opened — `gh` not installed)

| Branch | Commit | Contents | Open PR at |
|---|---|---|---|
| `security/blocker1-revoke-rpc-migration` | 1 commit | `supabase/migrations/079_revoke_privileged_rpc_public_execute.sql` — idempotent REVOKE codifying Blocker 1 | github.com/guysidiphoto-maker/gallery-flow/pull/new/security/blocker1-revoke-rpc-migration |
| `security/blocker2-ai-endpoint-auth` | 1 commit | JWT+ownership gate on 5 AI endpoints + `authedFetch` on 8 call sites + verify script | github.com/guysidiphoto-maker/gallery-flow/pull/new/security/blocker2-ai-endpoint-auth |

Neither is merged. Neither is deployed. Both are off `origin/main`.

## 6. Full blocker table

| # | Severity | Title | Owner | Status | Root cause | Fix | Risk | Rollback | Next action |
|---|---|---|---|---|---|---|---|---|---|
| B1 | P0 (closed) | Privileged RPCs PUBLIC-executable | Security/Backend | **CLOSED in prod + now durable** | Postgres default grants EXECUTE to PUBLIC on `SECURITY DEFINER` RPCs | Prod REVOKE (done by you) + migration 079 codifies it | None — REVOKE-only, idempotent, service_role untouched | `GRANT … TO authenticated` (documented in 079, reopens hole — don't) | Merge migration 079 so it can't silently reopen |
| B2 | P0 | AI endpoints abusable by anonymous callers | Security/Backend (me) | **FIXED on branch, NOT deployed** | Origin-only gate, skipped entirely when no Origin/Referer header; no caller auth | JWT + business-ownership gate before any AI call (branch `security/blocker2-…`) | Anyone could burn `ANTHROPIC_API_KEY` budget on any tenant's data | Revert the single commit | Preview-deploy → run `verify-blocker2-ai-auth.sh` → atomic prod deploy |
| B3 | P0 | `feed_plans` anon cross-tenant **read** leak | Security | **OPEN** | Policy `feed_plans_public_select USING (status IN draft/accepted/published)` — no business scoping | Scope policy to the gallery/business that owns the plan, or drop the anon SELECT (reads go through a scoped RPC) | Any anon can read every business's AI feed plans (flagship paid feature). 6 rows today; grows per signup | Re-create old policy | Write + stage + apply a corrective migration |
| B4 | P0 | Fabricated testimonials + fake stat on `/en` | UX/Product | **OPEN** | Invented named photographers, fake quotes, fake "80% faster" (`LandingPage.tsx:79-90,760-762`) | Hide the testimonials section + remove the stat | FTC/consumer-law + trust risk at public launch | Re-add block | Copy/flag change (small, safe) |
| B5 | P0 | No enforced free-tier resource caps + unverified signup config | Signup/Auth | **OPEN (needs decision)** | Only the 100-token photo cap is enforced; `max_galleries`/`storage_limit_bytes` are display-only; `enable_signup`/email-provider/autoconfirm not SQL-readable | Add server-side caps (max galleries + storage ceiling) OR formally make 100 tokens the whole free tier; lock GoTrue config in dashboard | Open signup → unlimited galleries + unbounded storage/egress per free account | Drop added caps | Decide free-tier limits; do manual dashboard checks (Section 14) |
| B6 | P1 | `/api/gallery-zip` crashes at module init | Backend/DevOps | **OPEN** | GET returns `FUNCTION_INVOCATION_FAILED` (500) before its own guards — likely missing prod env var or unbundled `archiver` | Reproduce, fix env/bundling, add guard | "Download all" may be broken in prod | n/a | Browser-test download-all; check `archiver` + env |
| B7 | P1 | `vendors_public_read` + `image_scores_public_read` `USING(true)` | Security | **OPEN** | Two anon SELECT policies with no scoping | Drop/scope both (redundant with scoped RPCs) | Vendor PII (0 rows today) + 303 AI score rows leak cross-tenant | Re-create | Fold into the B3 corrective migration |
| B8 | P1 | `gallery_get_meta` leaks DRAFT gallery metadata to anon | Security | **OPEN** | RPC returns draft galleries' name/settings to anon (proven; 25 drafts) | Filter to published in the RPC | Unpublished metadata leak (images NOT leaked) | Restore RPC | Patch RPC in corrective migration |
| B9 | P1 | Raw English/technical errors shown to Hebrew users | UX/Frontend | **OPEN** | e.g. "Anthropic key not configured in Vercel" shown to clients (`FeedStudio.tsx:1266-1267`) | Use the existing humanizer (`App.tsx:1601-1624`) | Trust/professionalism | n/a | Map error codes to Hebrew copy |
| B10 | P1 | "Coming soon"/dead affordances in primary UI | UX/Product | **OPEN** | `בקרוב` download-tracking panel, disabled export/schedule, blank live tab, 4/5 post formats stubbed | Hide stubs behind flags | Looks unfinished | n/a | Hide or flag dead buttons |
| B11 | P1 | Error monitoring is blind | DevOps | **OPEN** | Error channel is 100% `DEP0169 url.parse()` deprecation noise; a real 500 would be missed. Node version mismatch (config 24 vs runtime 18, no `engines.node` pin) | Silence the deprecation; pin Node; add real error alerting | Incidents go unnoticed | n/a | Add monitoring before scale |
| B12 | P2 | Public `gallery-images` originals (P2.4) | Security/Storage | **OPEN — accepted risk** | Single public bucket; direct `/object/public/…/originals/…` reachable by anyone with the (unguessable) path | Staged multi-hour bucket migration (see §10) | Watermark/quality leak to someone who already holds the link; NOT a cross-tenant breach (downloads enforced by P2.2) | Documented | Accept for launch or schedule migration |
| B13 | P2 | "Buy more tokens" button dead-ends in error toast | Payments | **OPEN** | `create-checkout` not deployed → `null` → toast | Hide behind a flag like `VITE_FEATURE_GALLERY_BILLING` | Minor UX rough edge; no charge possible | n/a | Flag-gate the CTA |
| B14 | P2 | Anon `*_demo_insert` write surface | Security | **OPEN** | Demo-insert policies allow anon writes (0 rows, no rate limit) | Remove or rate-limit | Spam/abuse vector | n/a | Review demo policies |
| B15 | P2/P3 | Cache-Control on hashed assets; cold render 3.3s; weak gallery-password rate-limit; `current_business_id` mutable search_path | DevOps/Security/Perf | **OPEN** | Various | `immutable` cache headers; warmups; tighten rate-limit; pin search_path | Perf + minor security hardening | n/a | Backlog |

## 7. Security status

- **Write isolation: STRONG.** Every mutator RPC and RLS policy enforces `current_business_id()`/`auth.uid()`. A new user cannot mutate cross-tenant. The 4 privileged RPCs are confirmed `service_role`-only (re-verified tonight). **No PUBLIC-executable sibling RPC exists** (the thing we most feared).
- **Read isolation: HAS HOLES.** P0 `feed_plans` anon read (B3); P1 `vendors`/`image_scores` `USING(true)` (B7); P1 `gallery_get_meta` draft leak (B8). All fixable in one corrective migration.
- **AI-cost abuse (B2): FIXED on branch, not deployed.** This is the single most important *new* security fix of the night.
- Advisors: **0 ERROR-level** (security + performance). WARNs are scale-time hardening.

## 8. Signup / self-serve status

- Sign-in is **Google-OAuth-only in the app** (no password/OTP/signup UI). Onboarding auto-provisions a business + **100 free tokens** (= 100 photos) and works end-to-end with no dead-ends.
- **Tenant isolation for a new user is solid** (sees 0 cross-tenant rows; cannot write cross-tenant).
- **Blocking gaps for OPEN signup:** (B5) only the 100-token cap is enforced — galleries and storage are unbounded; GoTrue config (`enable_signup`, email provider, autoconfirm) must be verified in the dashboard.
- Verdict: **safe to open ONLY after** adding minimal free-tier caps (or formally accepting "100 tokens = the whole free tier") **and** locking the GoTrue config.

## 9. Payments status — **Outcome B: safely fails closed, NOT launch-blocking**

- `create-checkout` is **not deployed** → every "buy" button dead-ends in a benign toast. **No real charge is reachable.**
- Webhook **verifies HMAC-SHA256** with constant-time compare before any DB write → **forgery infeasible** without the secret.
- `add_tokens`/`mark_gallery_paid`/`reset_subscription_tokens` are `service_role`-only → **client cannot spoof payment state.**
- Action: hide the "Buy more" CTA behind a flag (B13); verify `LEMONSQUEEZY_WEBHOOK_SECRET` is set **before** ever enabling checkout. **Do not enable live charging** (per your rule — and it's not needed for launch).

## 10. Storage / originals / P2.4 status — **deferred, accepted-risk (B12)**

- Display renders `/web/` + `/thumbs/` via the **public** transform endpoint; **downloads are enforced** server-side + signed (P2.2: unauthorized → 401, cross-gallery token denied).
- Residual gap: someone who already holds a gallery's path can fetch a full-res original by raw URL. UUIDv4 paths are unguessable/non-enumerable. **Quality leak, not a cross-tenant breach.**
- Real P2.4 = a multi-hour **staged** migration (new private `gallery-originals` bucket → copy ~12.3k objects → repoint paths → rollback tooling), proven on staging first. **NOT a launch-eve change.** Recommend: **accept as known risk for launch**, schedule the migration as its own gated task. **Do not flip the bucket to private** — it breaks all gallery display.

## 11. QA results — **YELLOW (conditional GO)**

- **GREEN:** all marketing routes, SEO landing pages, blog, sitemap, robots, and gallery viewers return 200; SSR meta correct; OG tags render for bots; signed-URL gate enforced (unauth sign → 400); assets/bundles valid. No P0 via HTTP.
- **FAIL:** B6 `/api/gallery-zip` 500 at module init (download-all possibly broken — needs browser test). B12 public originals (known). P3: cold render ~3.3s; gallery pages serve a generic `<title>` to non-bots.
- **Manual QA still required in a browser** (login, upload, create/delete gallery, set cover, password gate, lightbox, section-per-page, mobile, face search, download-all) — see `docs/audit/QA-matrix.md`.

## 12. UX / product findings — **CONDITIONAL**

- Hebrew root `/` and the ILS pricing page are **honest and launch-ready**; onboarding, the public gallery viewer, and PasswordGate are genuinely strong.
- **P0 (B4): the `/en` testimonials are fabricated** — hide before any public/English launch.
- P1: raw technical errors leak to Hebrew users (B9); "coming soon" dead buttons in primary UI (B10); two contradictory landing pages (USD desktop vs ILS SaaS) — a consistency risk.

## 13. Performance / DevOps findings — **GREEN operationally**

- No real 500s/timeouts; current prod deploy READY; every "error" log is harmless `DEP0169` noise. 17 functions on **Pro** plan → no function-count risk. 0 ERROR advisors.
- P1: monitoring blind (B11) + Node version mismatch. P2: hashed-asset cache headers. Required prod-env checklist + monitoring-gaps in `docs/audit/PERF-DEVOPS.md`.

## 14. Manual actions required from you

1. **Decide free-tier limits (B5):** either accept "100 tokens = the whole free trial" or approve adding server-side caps (max galleries + storage ceiling). I can implement either on a branch.
2. **Supabase dashboard (B5):** verify **Authentication → Settings → Allow new users to sign up** is in the state you want for *open* signup; **confirm Email provider + autoconfirm** settings (decide if email/password is allowed or Google-only). These aren't SQL-readable.
3. **Approve deploy of Blocker 2** (B2) after I (or you) run the Preview verification — needs an atomic deploy (backend + frontend together).
4. **Approve the B3/B7/B8 read-leak corrective migration** (I'll prepare it on a branch + staging-prove it before any prod apply).
5. **Browser-test `/api/gallery-zip`** (B6) — or tell me to dig into the module-init crash.
6. **Verify `LEMONSQUEEZY_WEBHOOK_SECRET`** before ever enabling checkout (B13). **Do not enable live charging.**
7. **Confirm P2.4 acceptance** (B12) for launch, or ask me to schedule the staged migration.
8. Open the two PRs via the links in Section 5 (merge requires your review — main is protected).

## 15. What CAN launch now

- The current product to **known/invited users** — production is stable, isolated on writes, payments fail closed, galleries/downloads/dashboard all work.
- The **Hebrew marketing site + ILS pricing page** (honest copy).

## 16. What MUST NOT launch (until fixed/accepted)

- **Public open self-serve signup** — until B2 deployed, B3 read-leak closed, B5 caps+config decided.
- **The `/en` page** — until B4 fabricated testimonials are removed.
- **Live charging** — not until the full payments decision + secret verification (and your explicit approval).

## 17. What MUST NOT be touched (hard rules honored tonight)

- Did **not** make originals private / flip the `gallery-images` bucket / delete or move storage objects.
- Did **not** touch watermark, enable live charging, or expose/print/commit any secret.
- Did **not** deploy anything or run destructive SQL; did **not** apply migration 079 to prod (prod already correct).
- Did **not** break owner/admin access (verified RPCs + RLS unchanged; service_role intact).

## 18. Next 2-hour sprint plan (shortest path to safe public launch)

1. **Deploy Blocker 2 (B2):** push branch → Vercel Preview → run `gallery-web/scripts/verify-blocker2-ai-auth.sh` against the Preview (expect all 401/403) → one manual happy-path check with a real login → atomic prod deploy. *(~30 min)*
2. **Close read leaks (B3/B7/B8):** one corrective migration — scope/drop `feed_plans_public_select`, `vendors_public_read`, `image_scores_public_read`; filter drafts out of `gallery_get_meta`. Staging-prove (anon SELECT returns 0 cross-tenant rows; display still works), then apply to prod with rollback. *(~40 min)*
3. **Remove fabricated testimonials (B4)** + flag-gate the "Buy more" CTA (B13) + humanize leaked errors (B9). One small frontend branch. *(~30 min)*
4. **Free-tier caps (B5):** implement the limits you choose; lock GoTrue config in dashboard. *(~20 min + your decision)*
5. **Investigate `/api/gallery-zip` crash (B6).** *(~20 min)*

After 1–4 (+ P2.4 accepted), **open self-serve signup is launch-safe.**

## 19. Final recommendation as CTO

**Hold public self-serve signup for now — but you are ~2 focused hours away, not days.** Tonight closed the two hardest security items conceptually: Blocker 1 is permanent, and Blocker 2 (the real anonymous-AI-budget-burn risk) is built, typechecked, and verifiable. The remaining blockers are concrete and low-risk: one read-leak migration, one deploy, one copy removal, and one free-tier-cap decision. None require risky production surgery. **Do them in the order in Section 18, verify on staging/Preview first, and launch open signup once B2/B3/B4/B5 are green.** P2.4 (public originals) is a real but bounded quality-leak — recommend accepting it for launch and scheduling the staged migration separately. Do not enable live charging until you explicitly choose to.

— Acting CTO & Release Manager, 2026-06-29
