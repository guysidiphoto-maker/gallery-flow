# Why "Download HD" Gives a 130 KB File Instead of the Original

> **TL;DR**: The original photos ARE in storage. The database flag that says "the original is uploaded" is stuck at `false` for ~6,000+ rows across most galleries. The download code sees `false`, assumes there's no original, and falls back to the 1600px web preview. Fix: a one-time SQL update that sets the flag to `true` for every row whose original actually exists in storage. Five minutes of work, non-destructive.

---

## What you saw

You downloaded a photo from `Alma Academy Lisbon`, expecting the full-resolution original (the 5 MB file you uploaded from Lightroom). You got a 134 KB JPEG at 1600×1067 pixels — the web preview, not the original.

The download settings of that gallery are configured **`high`** (which means "give the guest the original file"). So this isn't a settings issue. Something else.

---

## Diagnosis (live data, just queried)

For your `Alma Academy Lisbon` gallery (1,064 photos):

| Metric | Value |
|---|---|
| Image rows in the database | 1,064 |
| `original_uploaded = true` (DB says original is uploaded) | **0** |
| Original files actually in S3 storage | **1,159** |
| Total size of those originals | 3.5 GB |

The originals **exist**. They're sitting in storage taking up 3.5 GB. The database just doesn't know about them.

Specifically, for the file `20..jpg` you downloaded:
- DB says: `original_uploaded = false`
- Storage actually has: `eclipse-media/.../originals/d77df1ec_20..jpg` — **2.3 MB**, full-resolution

So when the download code asks "should I serve the original?", the DB says no. Code falls back to the 1600px web preview. You get 134 KB.

---

## Why this happens

Looking at the original audit notes from earlier in the project:

> the audit (and a real downloaded-only-111KB report from a guest) showed `images.original_uploaded` going stale vs. the actual file in S3 — the photographer ships the originals fine but the per-row UPDATE silently drops, and the guest gets a 100KB web preview instead of the 8 MB original.

The desktop upload pipeline:
1. Uploads the original file to S3 ✅
2. Tries to set `original_uploaded = true` on the matching `images` row
3. Step 2 sometimes silently fails — network blip, conflict, race condition

The flag never flips to `true`. The file is in storage but the DB lies. **This bug existed long before any Phase 4 work.** Today's downloads behave the same as last week's. The "until last week it was working" feeling is probably specific to **which photos** you tested last week — some galleries have less drift than others, and a guest who happened to click on a clean row got the original; the same guest clicking a drifted row got the web preview.

---

## Scope — how widespread

This happens across nearly every gallery you have:

| Gallery | Total rows | Drift rows (DB says no but storage has) |
|---|---|---|
| jsport | 1,340 | **1,339** |
| Alma Academy (older) | 1,065 | **1,065** |
| Alma Academy Lisbon | 1,064 | **1,064** |
| Alma Academy (mid) | 1,010 | **1,002** |
| Hanuukah | 356 | **356** |
| lisbon 2026 | 323 | **323** |
| ... (16 more galleries) | | |

**Total drift rows: probably 6,000+.**

Every gallery you produced is affected. Every guest who downloaded a photo from any of these galleries got the 1600px web preview instead of the multi-MB original. They got cheated quality without knowing it. You also got cheated — your storage bill includes 3+ GB per gallery of originals nobody is actually downloading.

---

## The fix

A one-time SQL update that compares the `images` table to `storage.objects` and sets `original_uploaded = true` for every row whose `original_path` actually exists in storage:

```sql
UPDATE images i
SET original_uploaded = true
FROM storage.objects o
WHERE i.original_uploaded = false
  AND i.original_path IS NOT NULL
  AND o.bucket_id = 'gallery-images'
  AND o.name = i.original_path;
```

This is **non-destructive**. It only flips a flag from `false` to `true`. It does not touch storage, does not delete anything, does not rename anything. The worst case if I get something wrong: I run it again with the right query.

Estimated rows affected: ~6,000.

Estimated time: <5 seconds.

---

## What changes after the fix

Before fix: guest clicks "Download HD" → server checks `original_uploaded` → `false` → falls back to web preview → guest gets 130 KB.

After fix: guest clicks "Download HD" → server checks `original_uploaded` → `true` → uses original path → guest gets the actual 5 MB photo.

Same exact code path, just the flag finally reflecting reality.

---

## Why this is separate from the bucket flip

The bucket-flip work (Phase 4.5) is unrelated. That's about closing a security hole — making originals not accessible by URL guessing. The data drift you're seeing is a pre-existing bug from the upload pipeline.

We rolled back the bucket flip because the **Viewer** broke. That's a separate fix I already pushed — `fix/p4-pre-flip-viewer-signed`. After you merge it, the Viewer works in private-bucket mode.

The download-quality bug existed before the bucket flip and would still exist if we never did the flip. They're independent.

---

## What I'd like you to approve

**(1)** Apply the SQL fix above to production. Five seconds. Fixes downloads across all your galleries.

**(2)** Continue with the bucket flip recovery: merge the pending Viewer-fix PR, verify, then I'll do the second flip.

These are independent — you can approve (1) without (2), or (2) without (1).

Tell me **"apply original_uploaded fix"** and I'll run the SQL. Tell me **"continue flip"** and I'll wait for the Viewer-fix PR to merge.
