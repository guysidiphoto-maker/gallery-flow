# Phase 4.5/4.6 — Bucket Flip Playbook

> **Purpose**: scripted procedure for flipping `gallery-images` from `public:true` to `public:false` in production. Every step has an exact command, an expected result, and a rollback. Read this top-to-bottom before the maintenance window — do not improvise during the flip.

> **Estimated wall time**: 30 minutes for the flip itself, +60 minutes monitoring.
> **Crew**: 1 engineer executing, user on standby in front of phone for SMS notifications.

---

## Hard prerequisites — verify before scheduling

- [ ] All Phase 4 PRs merged into `main` (#86 through #100, plus #94/95/96/97/98/99 for Phase 4.5)
- [ ] Vercel production deploy is green on the latest main commit (visible in the Vercel dashboard)
- [ ] Cloudflare Turnstile keys configured in Vercel:
  - [ ] `CF_TURNSTILE_SECRET` (Production + Preview)
  - [ ] `VITE_CF_TURNSTILE_SITE_KEY` (Production + Preview)
- [ ] Supabase project ID ready: `vlyiqfawkrjvqcmkpfvs`
- [ ] Service-role key for Supabase available (legacy JWT format, role=`service_role`)
- [ ] No customer event scheduled within ±12 hours of the maintenance window
- [ ] User informed via SMS that 30 minutes of degraded service is expected
- [ ] Backfill gate clear: `pending_thumbs = 0` (verified earlier — see Phase 4.2 wrap-up)

If any of these is not green, **stop**. Reschedule.

---

## Maintenance window timeline

All times are local Israel time (IST/IDT). Adjust if scheduled for a different week.

| When | What | Who |
|---|---|---|
| **T-7 days** | Run pre-flight check (Section 1) | engineer |
| **T-1 day** | Send customer comm (Section 6 — template) | user |
| **T-30 minutes** | Warm-up: open Supabase + Vercel dashboards, run sanity queries (Section 2) | engineer |
| **T-0** (Saturday 04:00) | Apply migration 059 (Section 3) | engineer |
| **T+5 minutes** | Set `VITE_PUBLIC_VIEWER_SIGNED_URLS=1` in Vercel (Section 4) | engineer |
| **T+8 minutes** | Wait for Vercel rebuild + deploy (Section 4) | both |
| **T+12 minutes** | Smoke-test: open one live gallery in incognito (Section 5) | engineer |
| **T+15 minutes** | Flip the bucket (Section 5.B) | engineer |
| **T+18 minutes** | Re-run smoke test (Section 5) | engineer |
| **T+25 minutes** | Watch Sentry / Vercel logs for 1% image-load failures (Section 7) | engineer |
| **T+60 minutes** | All-clear OR rollback (Section 8) | both |

---

## 1. T-7 days — pre-flight check

Run these queries to verify the system is ready. All should return clean values.

```sql
-- 1.A — Backfill complete (pending must be 0)
SELECT
  count(*) FILTER (WHERE public_thumb_present = false AND thumbnail_path IS NOT NULL) AS pending,
  count(*) FILTER (WHERE public_thumb_present = true) AS done
FROM images;
-- Expected: pending=0, done=~7081
```

```sql
-- 1.B — Public-thumbs bucket exists + has policies
SELECT
  (SELECT public FROM storage.buckets WHERE id='gallery-images-thumbs-public') AS bucket_public,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN ('thumbs_public_anon_read','thumbs_public_owner_write')) AS new_policies;
-- Expected: bucket_public=true, new_policies=2
```

```sql
-- 1.C — Public-gallery-sessions table ready
SELECT count(*) AS rows, count(*) FILTER (WHERE expires_at > now()) AS alive
FROM public_gallery_sessions;
-- Expected: rows ≈ 0 (table exists, may have a few test rows)
```

```sql
-- 1.D — Migration 059 NOT yet applied (we apply it during the window)
SELECT name FROM supabase_migrations.schema_migrations WHERE name LIKE '%name_shadow%';
-- Expected: empty (returns nothing)
```

```sql
-- 1.E — Latent RLS bug confirmed still present
WITH probe AS (
  SELECT name AS object_name FROM storage.objects
   WHERE bucket_id = 'gallery-images'
     AND (storage.foldername(name))[2] IN (SELECT id::text FROM galleries WHERE status = 'live')
   LIMIT 1
)
SELECT
  EXISTS (
    SELECT 1 FROM galleries g, probe
    WHERE g.id::text = (storage.foldername(name))[2] AND g.status = 'live'
  ) AS broken_pattern,
  EXISTS (
    SELECT 1 FROM galleries g, probe
    WHERE g.id::text = (storage.foldername(probe.object_name))[2] AND g.status = 'live'
  ) AS fixed_pattern
FROM probe;
-- Expected: broken_pattern=false, fixed_pattern=true
```

If any of these doesn't match expected: **stop and investigate**. Do not proceed.

---

## 2. T-30 minutes — warm-up

Open these dashboards in separate tabs (not all in one window — keep them visible):

- [ ] Supabase SQL editor (project `vlyiqfawkrjvqcmkpfvs`)
  - https://supabase.com/dashboard/project/vlyiqfawkrjvqcmkpfvs/sql/new
- [ ] Supabase Storage dashboard
  - https://supabase.com/dashboard/project/vlyiqfawkrjvqcmkpfvs/storage/buckets
- [ ] Vercel project deployments
  - https://vercel.com/guysidiphoto-makers-projects/gallery-web/deployments
- [ ] Vercel logs (live tail)
  - https://vercel.com/guysidiphoto-makers-projects/gallery-web/logs
- [ ] One incognito Chrome window with one live gallery loaded but NOT yet refreshed
  - e.g., `https://eclipsemedia.co.il/eclipse-media/<gallery-slug>` (replace with a real slug)

Run sanity queries again to confirm no drift since T-7:

```sql
SELECT
  count(*) FILTER (WHERE public_thumb_present = false AND thumbnail_path IS NOT NULL) AS pending
FROM images;
-- Must be 0
```

---

## 3. T-0 — Apply migration 059

Migration 059 fixes the latent `galleries.name` shadow bug in the existing storage RLS policies. Without this fix, the bucket flip would break all authenticated reads/writes.

The migration is already on `main` (PR #91 — DRAFT branch, file is at `supabase/migrations/059_fix_storage_policy_name_shadow.sql`).

```sql
-- 3.A — Apply migration 059
-- Paste the contents of supabase/migrations/059_fix_storage_policy_name_shadow.sql
-- into the Supabase SQL editor and run.
-- ALTERNATIVELY use mcp__plugin_supabase_supabase__apply_migration.
```

Verify it applied:

```sql
-- 3.B — Verify policies have the fixed pattern
SELECT policyname, qual::text LIKE '%storage.objects.name%' AS qualified
  FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects'
   AND policyname IN ('gallery_storage_public_read','gallery_storage_owner_write');
-- Expected: 2 rows, both qualified=true
```

Re-run probe 1.E — both `broken_pattern` and `fixed_pattern` should now return `true` (the existing policies match the fixed pattern).

**Rollback if needed**: drop and recreate policies with the original (buggy) qual. The drop/create blocks are in `058_public_thumbs_bucket.sql` for reference.

---

## 4. T+5 to T+10 minutes — flip the feature flag

This activates the public-viewer signed-URL flow on the SPA. The bucket is still public — both URL types work — so this is a graceful warm-up.

1. Vercel dashboard → project `gallery-web` → Settings → Environment Variables
2. Add new variable:
   - Key: `VITE_PUBLIC_VIEWER_SIGNED_URLS`
   - Value: `1`
   - Environments: Production + Preview
   - Click **Save**
3. Vercel auto-triggers a redeploy. Watch the Deployments tab.
4. Wait until status is **Ready** (green checkmark). Usually 2-3 minutes.
5. Hard-refresh the incognito gallery tab from Section 2 (Cmd+Shift+R).

Verify in browser DevTools → Network tab:
- [ ] On gallery load, see one POST to `/api/append-event-posts` with body `{action:"public_gallery_session", galleryId:"..."}` returning 200.
- [ ] On image render, see POSTs to `/api/append-event-posts` with body `{action:"signed_url", ...}` returning 200 with signed URLs (token query param visible).
- [ ] Images render without flicker.
- [ ] No 4xx/5xx errors in console.

If anything looks broken: **delete the env var and skip to Rollback (Section 9)**.

---

## 5. T+15 minutes — flip the bucket

This is the only irreversible-ish step. Execute carefully.

### 5.A — Final pre-flight

```sql
-- Confirm public-thumbs bucket has all the thumbs (the fallback path)
SELECT count(*) FROM storage.objects WHERE bucket_id='gallery-images-thumbs-public';
-- Expected: ~7081 (matches images.public_thumb_present=true count)
```

### 5.B — The flip

```sql
UPDATE storage.buckets SET public = false WHERE id = 'gallery-images';
```

This takes <1 second. The bucket is now private. Public URLs of `gallery-images` will return 401.

### 5.C — Immediate verification (within 60 seconds)

In the incognito browser, hard-refresh the gallery. Expected:

- [ ] Page loads.
- [ ] Images render via signed URLs (DevTools shows 200 responses with token query param).
- [ ] OG share previews still work (the public-thumbs bucket serves those).
- [ ] Click an image to zoom — Viewer opens, image loads.
- [ ] Click download — file downloads.
- [ ] Click "Download all" — server-side ZIP streams (or JSZip fallback if PVT fails).

If ANY of these fails for >2 consecutive renders → **execute Rollback (Section 9) immediately**.

---

## 6. Customer comm template (Hebrew)

Send 24 hours before the window. WhatsApp + email.

> **תחזוקה מתוכננת בpiXflow**
>
> שלום {שם},
>
> במהלך השבת [DATE] בין השעות 04:00 ל-05:00 לפנות בוקר אנחנו מבצעים תחזוקה מתוכננת על המערכת. ייתכן שגלריות לא יהיו זמינות לטווח של עד 30 דקות.
>
> אם יש לך אירוע מתוכנן באותו לילה — תגיד לי, אדחה את התחזוקה.
>
> בכבוד רב,
> Pixflow

---

## 7. T+25 minutes — monitoring

Watch for 60 minutes. Three signal sources:

- **Vercel logs** — open the live tail. Look for spikes of:
  - 401 from `/api/append-event-posts` — could mean PVT validation breaking
  - 500 from any endpoint — internal error
  - 504 from gallery-zip — function timeout
- **Sentry** (if wired) — image-load failure rate. Threshold: >1% = page someone.
- **User reports** — phone the user every 15 minutes for the first hour, ask "is anything reported as broken?".

Run this query every 5 minutes:

```sql
SELECT
  date_trunc('minute', created_at) AS minute,
  count(*) AS sessions_issued,
  count(*) FILTER (WHERE turnstile_validated = true) AS turnstile_passed
FROM public_gallery_sessions
WHERE created_at > now() - interval '15 minutes'
GROUP BY 1 ORDER BY 1 DESC;
```

Expected: a steady trickle of session issuance, mostly without Turnstile (because soft limit is 30/IP/hour).

If `sessions_issued` is zero for 10 minutes after the flip → the SPA isn't calling `public_gallery_session`. Investigate immediately.

---

## 8. T+60 minutes — all-clear

If all three monitoring signals are clean for 60 minutes:

- [ ] Send "תחזוקה הסתיימה" to user
- [ ] Update the wrap-up doc (`docs/PHASE_4_WRAP_UP_2026_05_08.md`) to reflect the flip
- [ ] Close the playbook

---

## 9. Rollback (1-command revert)

If anything goes wrong, execute these in order. Each step is independent and can be done alone.

### 9.A — Rollback the bucket flip

```sql
UPDATE storage.buckets SET public = true WHERE id = 'gallery-images';
```

This restores the previous behavior in <60 seconds. Public URLs work again. The signed URL path also keeps working (signedStorageUrl returns either, browser caches whichever loaded first).

### 9.B — Rollback the feature flag

In Vercel → Environment Variables → delete `VITE_PUBLIC_VIEWER_SIGNED_URLS`. Wait for redeploy (~2 min).

### 9.C — Rollback migration 059

Only if step 9.A and 9.B don't fix the issue. The original (buggy) policies were no-ops, so reverting reproduces today's pre-fix behavior.

```sql
-- Restore the broken policies. Used only when 9.A + 9.B aren't enough.
DROP POLICY IF EXISTS gallery_storage_public_read ON storage.objects;
CREATE POLICY gallery_storage_public_read
  ON storage.objects
  FOR SELECT
  TO anon
  USING (
    bucket_id = ANY (ARRAY['gallery-images'::text, 'gallery-stories'::text])
    AND EXISTS (
      SELECT 1 FROM galleries g
       WHERE g.id::text = (storage.foldername(g.name))[2]  -- buggy: g.name shadows objects.name
         AND g.status = 'live'
    )
  );

DROP POLICY IF EXISTS gallery_storage_owner_write ON storage.objects;
CREATE POLICY gallery_storage_owner_write
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = ANY (ARRAY['gallery-images'::text, 'gallery-stories'::text])
    AND EXISTS (
      SELECT 1 FROM galleries g
       WHERE g.id::text = (storage.foldername(g.name))[2]
         AND g.business_id = current_business_id()
    )
  )
  WITH CHECK (
    bucket_id = ANY (ARRAY['gallery-images'::text, 'gallery-stories'::text])
    AND EXISTS (
      SELECT 1 FROM galleries g
       WHERE g.id::text = (storage.foldername(g.name))[2]
         AND g.business_id = current_business_id()
    )
  );
```

---

## 10. Failure triage tree

Symptoms during/after the flip and how to react:

| Symptom | Likely cause | Action |
|---|---|---|
| Some images don't render, others do | Specific path scheme legacy (~3% per audit) | Rollback bucket flip (9.A). Investigate per-row. |
| All images return 401 | `useSignedSrc` not updated, or env flag not picked up by Vercel | Verify `VITE_PUBLIC_VIEWER_SIGNED_URLS=1` in deploy. If correct: rollback bucket flip (9.A). |
| Photographer dashboard images broken | Authenticated-storage-read flow, possibly migration 059 side effect | Rollback in this order: 9.A then 9.C |
| OG cards on WhatsApp empty | OG endpoint pointing at `gallery-images` instead of `-thumbs-public` | This shouldn't happen — `og.tsx` was prepared for it. If it does: rollback 9.A. |
| Turnstile widget keeps appearing for everyone | Soft limit triggered for legitimate IPs | Increase `SOFT_LIMIT_PER_HOUR` from 30 to 100, redeploy |
| `/api/gallery-zip` returning 500 | archiver dependency, maxDuration | Check Vercel logs for the actual error |
| `/api/append-event-posts` returning 500 on `signed_url` | Probably `verify_public_gallery_session` RPC error | Check Vercel logs. May indicate Supabase rate limit |
| Customer reports broken images | Most likely an iOS Safari aggressive cache | Tell them to swipe-down to refresh; if persistent, rollback |

---

## 11. Post-flip cleanup (T+24 hours, if stable)

These are optional follow-ups that can happen days later:

- [ ] Switch `INITIAL_USE_PUBLIC` from `true` to `false` in `useSignedSrc.ts`. Today this is `true` so the first paint uses the public URL. After the flip, public URLs are 401, so first paint flickers — flipping this constant means render starts blank and shows the signed URL when ready. Visual improvement only.
- [ ] Drop the legacy `Allow public uploads *` storage policies (sloppy unconditional INSERT-allow flagged in audit).
- [ ] Remove the dual-write public-thumb upload from `uploadPipeline.ts` if we want to commit to thumbs-only-in-public-bucket. (Lower priority — current dual-write is harmless storage cost.)

---

## 12. The single SQL command, restated

For when the playbook is overwhelming and you just need the one command. **Paste this into Supabase SQL editor at T-0:**

```sql
-- Step 1: apply migration 059 (paste full file contents here, or via apply_migration MCP)

-- Step 2: flip the bucket
UPDATE storage.buckets SET public = false WHERE id = 'gallery-images';

-- If anything breaks within 60 seconds:
UPDATE storage.buckets SET public = true WHERE id = 'gallery-images';
```

That's the entire flip operation. Everything else in this document is preparation, verification, and triage.

---

**End of playbook.** Read it twice before scheduling the maintenance window.
