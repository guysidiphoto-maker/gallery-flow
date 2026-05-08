א# Phase 4 Master Plan — Storage Hardening

> **Status**: PLANNING ONLY. No code changes, no migrations, no bucket flips. Awaiting user approval.
>
> Per the user's original instruction:
> > "Phase 4: Storage hardening — Prepare a staged migration plan. Do not execute this phase until staging tests pass."

This is the unified plan from 3 parallel investigations. Each investigation produced a deeper supporting document; this is the executive view that ties them together and asks the questions you must answer before any execution.

**Supporting docs**:
- [`PHASE_4_STORAGE_PLAN.md`](./PHASE_4_STORAGE_PLAN.md) — architectural options, recommended design, 5-phase rollout
- [`PHASE_4_IMAGE_SURFACE_MAP.md`](./PHASE_4_IMAGE_SURFACE_MAP.md) — every image render site (57 found across the codebase)
- [`PHASE_4_RISK_AND_STAGING_PLAN.md`](./PHASE_4_RISK_AND_STAGING_PLAN.md) — risk register, staging tests, rollback procedure

---

## Top-line verdict

The bucket flip is **the single most dangerous change** on this codebase. The good news: 48 of the 57 image render sites already go through the `storageUrl()` helper, which means we can swap the implementation in **one file** for most of the surface. The bad news: 6 hardcoded URL strings bypass the helper entirely, the `rekognition` edge function fetches images via public URLs internally, and we're at Vercel's 12-function cap with no headroom for a new `signed-url` endpoint.

**Honest estimate**: 3-4 weeks of focused engineering, 5-6 weeks calendar (with the parallel Token Economy work). The bucket flip MUST be in a maintenance window and MUST be a separate deploy from the helper-swap.

**Catastrophic risk if rushed**: anyone with a guessed gallery_id can still pull originals today (audit B2). Customers may reasonably expect that "private gallery" means private. But botched execution of Phase 4 = mass image 401s during a customer event.

---

## Current state (verified against production)

| Metric | Value |
|---|---|
| Buckets | 6 total, all public — `gallery-images`, `gallery-stories`, `demo-uploads`, plus 3 unused |
| Live galleries | 71 |
| Objects in `gallery-images` | 25,914 (22-24 GB total) |
| Originals share of bytes | 20.8 GB (87%) — the security target AND the cost lever |
| Path scheme (corrected) | `<biz_slug>/<gallery_id>/<thumbs\|web\|originals>/<file>` (NOT what Phase 1 audit said) |
| Render sites in SPA | 57 |
| Sites using `storageUrl()` helper | 48 |
| Drift sites (hardcoded URLs) | 6 — Dashboard.tsx ×3, og.tsx, score-images.ts, LandingPage.tsx |
| Vercel function cap | 12/12 (cap maxed) |
| Phase 3 session tokens | NOT linked to storage today |

---

## Recommended architecture: Option B — 2-bucket split

After comparing 3 architectures, the Storage Architect recommends:

1. **Keep `gallery-images` for `web/` and `originals/` paths**, flip it to `public: false`. Access via short-lived Supabase signed URLs.
2. **Create new `gallery-images-thumbs-public`** — keep public, copy thumbs there on upload + retroactively. CDN-friendly, OG-crawler-friendly, no tokens needed.
3. Stories bucket and demo-uploads bucket: defer to a future phase; lower-value targets.

**Why Option B over alternatives**:
- **Option A** (single private bucket): every social-card crawler breaks (WhatsApp/Slack/Twitter) because they can't carry tokens. Big customer-acquisition hit.
- **Option C** (CDN proxy in front of public bucket): doesn't actually close the security gap — the public URLs still work for anyone who guesses paths.
- Option B closes the originals leak (the actual audit finding) while keeping low-risk thumbs publicly accessible for crawlers and sub-100ms initial render.

---

## The "anon public viewer" puzzle

The HARDEST piece. Today `/<biz>/<gallery-slug>` works for anonymous customers — no PIN, no login. The photographer sends the URL to their bride/CTO, they open it on their phone. We can't ask them to authenticate.

**Solution proposed**: when the gallery viewer (`App.tsx`) mounts, the SPA calls a new endpoint `/api/public-gallery-session?galleryId=<id>`. This endpoint:
1. Validates the gallery exists and is `status='live'`
2. Optionally challenges with Cloudflare Turnstile (proof-of-human, free tier, no signup for the visitor)
3. Issues a 1-hour signed JWT scoped to that specific gallery's photos
4. SPA caches the JWT; refreshes silently before expiry; uses it to generate signed URLs for thumbs+web+originals

**Risk**: every gallery open adds 1 round trip (~150-300ms first-time). Cached JWT eliminates the cost on subsequent navigations within the hour.

**Risk**: bots harvesting public galleries via Turnstile bypass would need persistent automation; rate-limiting the endpoint per IP throttles this.

---

## Where we'd be at the end of Phase 4

| Threat | Today | Post-Phase-4 |
|---|---|---|
| Anyone with a `gallery_id` can fetch originals | 🔴 trivially | 🟢 closed (private bucket + signed URLs require valid session) |
| `clientCode` PIN extractable from anon SELECT | ✅ closed in Phase 3 | ✅ closed |
| Customer of business A reads business B's gallery | 🟠 by URL guessing | 🟠 same (no Phase 4 work — covered by future RLS overhaul) |
| Botched deploy → mass image 401s mid-event | N/A | 🟠 contained by maintenance window + 1-command rollback |

---

## Risk register (top 10 of 16)

Full list in [`PHASE_4_RISK_AND_STAGING_PLAN.md`](./PHASE_4_RISK_AND_STAGING_PLAN.md). Top 10:

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| A | Bucket flipped private before all sites use signed URLs → mass 401s | 🔴 CATASTROPHIC | 5-phase staged rollout with dual-path helper through Phase 4.0–4.4 |
| B | Signed URL endpoint env var missing → all images break silently | 🔴 CATASTROPHIC | Synthetic monitoring + alarm on > 1% image-load failures |
| C | OG crawler can't fetch private images → social previews broken (Hebrew market hit) | 🟠 HIGH | Public thumbs bucket (Option B) keeps OG paths working |
| D | Photographer dashboard upload pipeline doesn't know about new flow | 🟠 HIGH | Dashboard upload uses service-role; bucket privacy is irrelevant for upload — verify in staging |
| E | `rekognition` edge function fetches via public URL internally | 🟠 HIGH | Edge function must be updated to use service-role internal access |
| F | Vercel function cap | 🟠 HIGH | Consolidate `share.ts` + `gallery-page.ts` into `og.tsx` (3 → 1), then add signing endpoint |
| G | Active customer in middle of an event opens a gallery during the flip | 🟠 HIGH | Maintenance window (Saturday 04:00 IST) + customer-comm template |
| H | Mobile Safari aggressively caches old broken URLs | 🟡 MEDIUM | Service worker version bump + cache-busting URL params during transition |
| I | JSZip downloads break (current uses public URLs) | 🟡 MEDIUM | Server-side streaming ZIP endpoint replaces client-side JSZip in Phase 4.6 |
| J | Customer-shared old WhatsApp links pre-Phase-4 | 🟡 MEDIUM | Public thumbs bucket means OG previews still resolve; the gallery link itself doesn't change |

---

## 5-phase rollout (each independently reversible)

| Phase | What | Days | Reversible? | Customer-facing? |
|---|---|---|---|---|
| **4.0** | Migrate 6 drift sites to `storageUrl()` helper. Free 1 Vercel slot by consolidating `share.ts` + `gallery-page.ts` into `og.tsx`. | 2 | ✅ Trivially | No |
| **4.1** | Implement `signedStorageUrl()` helper + new `/api/signed-url` endpoint (verifies session token, issues signed URL). No callsite changes. | 2 | ✅ | No |
| **4.2** | Create new `gallery-images-thumbs-public` bucket. Backfill thumbs to it. Update upload pipeline to write thumbs to both old + new. | 3 | ✅ Both buckets active | No |
| **4.3** | Switch ONE non-critical surface (Feed Studio direction-card previews) to signed URLs. Test in production for 48h. | 1 | ✅ Helper supports both paths | Slight (admins only) |
| **4.4** | Switch all dashboard / FeedStudio / CreativeRenderer paths to signed URLs. | 3 | ✅ Helper supports both paths | Yes (auth users only) |
| **4.5** | Switch public viewer (`App.tsx`) to public-thumbs bucket + signed URLs for web/originals. Public-view-token endpoint goes live. | 4 | 🟡 Bucket flip is here — 1-command revert restores public access | Yes (everyone) |
| **4.6** | Replace JSZip with server-side streaming ZIP endpoint. | 2 | ✅ Old client-side path can be re-enabled | Yes (downloads only) |
| **4.7** | After 7 days clean: remove dual-path fallback in `storageUrl()` helper. Bucket is now private-only. | 0.5 | 🔴 Point of no return | No (cleanup) |

**Total**: ~17 working days end-to-end. With weekends/parallel work: 4-5 calendar weeks.

---

## 1-command rollback

If at any point during Phase 4.5 a customer reports broken images:

```sql
UPDATE storage.buckets SET public = true WHERE id IN ('gallery-images', 'gallery-stories');
```

The dual-path `storageUrl()` helper falls back to the public URL, the SPA keeps working. < 60 seconds. Rehearse this in staging at least once before any production touch.

---

## Open questions you must answer before we start

| # | Question | Why it matters |
|---|---|---|
| 1 | **Cloudflare Turnstile budget?** | Anon-viewer flow needs a proof-of-human gate. Free tier (10k requests/month) covers our scale; Pro tier (~$10/month) gives us better controls. |
| 2 | **Maintenance window allowed?** | The bucket-flip step (4.5) needs ~30 min when no customer is mid-event. Saturday 04:00-05:00 IST is the safest. Are any customer events scheduled during the next 5 weeks? |
| 3 | **Server-side ZIP acceptable?** | A 1000-photo download = ~5GB. Vercel function-time cost: ~$0.50/download. If volumes are low this is fine; at scale (many downloads/day) we need Cloudflare R2 streaming. |
| 4 | **Priority: originals-only vs all-photos-private?** | Originals-only = ship Phase 4 in 2.5 weeks, closes 87% of the data exposure. All-photos-private = 5 weeks, closes 100%. Audit's #1 finding was originals exposure. |
| 5 | **Vercel Pro upgrade?** ($20/month) | Removes the 12-function cap permanently. Cleanly enables the new endpoint without consolidation. |
| 6 | **Watermarking?** | Phase 4 is a natural moment to introduce watermarks on free-tier downloads. Feature creep — but cheap to add now and expensive to bolt on later. |

---

## What we will NOT do in Phase 4 (further phases)

- **Cross-tenant RLS scoping by session token** — Phase 5 (the big RLS overhaul). Keeps anon SELECT on galleries/images intact for now.
- **Photographer JWT → httpOnly cookies** — Phase 5.
- **Drop legacy `delivery_settings.clientCode`** — Phase 5 (after token flow is mandatory).
- **Storage object reaper for orphaned files** — Phase 5 (4,655 orphan files / 2.5GB unrelated to Phase 4 scope).

---

## Acceptance criteria — must pass before flipping bucket

- All 24 Phase 1 + 24 Phase 2 + 24 Phase 3 regression tests still pass.
- Phase 4 staging suite (~30 tests in [`PHASE_4_RISK_AND_STAGING_PLAN.md`](./PHASE_4_RISK_AND_STAGING_PLAN.md)) all green.
- Rollback rehearsed in staging at least once.
- Cloudflare Turnstile site key generated + integrated.
- Sentry alert thresholds armed (>1% image load failures = page).
- Customer comm template ready (Hebrew "Gallery temporarily unavailable" message).
- Maintenance window scheduled, no customer events booked.
- 1 engineer on standby for the duration.

---

## Recommendation

Start Phase 4.0 + 4.1 (drift cleanup, helper introduction, no behavior change) within 1-2 days. **Don't touch the bucket flag yet.** Use the next 2-3 weeks to:

1. Build staging environment with sample data.
2. Implement signed-URL helper + public-view-token endpoint behind a feature flag.
3. Run all regression suites in staging.
4. Get customer comm template approved.
5. Schedule the maintenance window.

The actual bucket-flip happens in week 4-5 only after staging proves clean.

---

## What I need from you

Please confirm/answer:

1. ✅ / ❌ Approve the **Option B** architecture (2-bucket split)
2. ✅ / ❌ Approve the **5-phase rollout** with the 3-4 week calendar
3. **Answer the 6 open questions** above (especially Vercel Pro upgrade + Turnstile + maintenance window)
4. **Pick ONE start date** for Phase 4.0 (drift cleanup is safe to start anytime)
5. ✅ / ❌ Approve **deferring the bucket flip until staging tests pass** (per your original instruction)

When you've answered, I'll start Phase 4.0 (the safe drift cleanup + endpoint consolidation) and pause before any bucket changes.
