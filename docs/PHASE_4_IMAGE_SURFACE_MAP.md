# Phase 4 — Image Render Surface Map

**Generated**: 2026-05-08
**Repository**: `/Users/guysidi/gallery-flow`
**Scope**: Every image render site in the SPA + API routes that construct storage URLs

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total render sites** | 57 |
| **Sites using `storageUrl()` helper** | 48 |
| **Sites hand-building URLs (drift candidates)** | 5 |
| **API routes returning storage URLs** | 3 |
| **Unique storage buckets** | 3 (`gallery-images`, `gallery-stories`, `demo-uploads`) |
| **Download paths (fetch blob)** | 6 |

**Key finding**: The majority of the codebase **already uses the `storageUrl()` helper** defined in `gallery-web/src/supabase.ts:8`. This is excellent for Phase 4 — we can swap the helper's implementation in **one file** rather than 47 file changes. However, **5 drift sites** hard-code the full URL and must be migrated first.

---

## A. Public Gallery Viewer (`gallery-web/src/App.tsx`)

The main SPA gallery view — consumed by anonymous users and authenticated photographers.

| File:Line | Type | Audience | URL build | Notes |
|-----------|------|----------|-----------|-------|
| App.tsx:1144 | Story video | Anon | `storageUrl('gallery-stories', story.storage_path)` | Story player intro animation |
| App.tsx:1174 | Story video | Anon | `storageUrl('gallery-stories', story.storage_path)` | Story player main feed |
| App.tsx:1382 | Gallery cover | Anon | `storageUrl(imgBucket, coverImg.storage_path)` | Welcome screen: cover image fallback |
| App.tsx:1414, 1428 | Welcome mosaic (6 img) | Anon | `storageUrl(imgBucket, path)` prop to StoryPlayer | Mosaic background images |
| App.tsx:1558 | Thumbnail | Anon | `storageUrl(imgBucket, img.thumbnail_path \|\| img.storage_path)` | Masonry grid: thumb render |
| App.tsx:1562 | Web preview | Anon | `storageUrl(imgBucket, img.storage_path)` | Viewer sync: lightbox fallback |
| App.tsx:1572 | Original | Anon/Auth | `storageUrl(imgBucket, img.original_path)` | Download URL builder (HD) |
| App.tsx:1574 | Web preview | Anon/Auth | `storageUrl(imgBucket, img.storage_path)` | Download URL builder (web) |
| App.tsx:1592 | Story video | Anon | `storageUrl('gallery-stories', st.storage_path)` | Story URL resolver |
| App.tsx:1614 | Original | Anon/Auth | `storageUrl(imgBucket, img.original_path)` | Fetch HEAD check before download |
| App.tsx:1775 | Cover image | Anon | `storageUrl(imgBucket, coverImage.storage_path)` | Welcome screen cover URL |
| App.tsx:2248 | Mosaic (6 img) | Anon | `storageUrl(imgBucket, path)` prop | FaceSearchExperience background |

**Bucket logic**: Uses `isDemoGallery ? 'demo-uploads' : 'gallery-images'` (line 1370).
**Download paths**: Lines 1644, 1668, 1705, 1738 fetch image blobs via `fetch(downloadUrl(img))`.

---

## B. Public Client Dashboard (`gallery-web/src/pages/ClientDashboard.tsx`)

Authenticated client view — gallery cards, cover images, top-pick grid, stories, calendar.

| File:Line | Type | Audience | URL build | Notes |
|-----------|------|----------|-----------|-------|
| ClientDashboard.tsx:283 | Thumbnail | Client+PIN | `storageUrl('gallery-images', img.thumbnail_path \|\| img.storage_path)` | Gallery cards: cover image |
| ClientDashboard.tsx:315 | Story video | Client+PIN | `storageUrl('gallery-stories', s.storage_path)` + HEAD fetch | Story availability check |
| ClientDashboard.tsx:672 | Web preview | Client+PIN | `storageUrl('gallery-images', img.storage_path)` | Single photo download URL |
| ClientDashboard.tsx:712 | Thumbnail | Client+PIN | `storageUrl('gallery-images', img.thumbnail_path \|\| img.storage_path)` | Content studio grid |
| ClientDashboard.tsx:750 | Web preview | Client+PIN | `storageUrl('gallery-images', img.storage_path)` | Bulk download (via `downloadImage()`) |
| ClientDashboard.tsx:824, 1143 | Story video | Client+PIN | `storageUrl('gallery-stories', galleryStories[0].storage_path)` | Story player: set active |
| ClientDashboard.tsx:858, 1186 | Story video | Client+PIN | `storageUrl('gallery-stories', s.storage_path)` | Download story video blob |
| ClientDashboard.tsx:893 | (prop pass) | Client+PIN | `storageUrl={storageUrl}` | Passed to SocialManager |
| ClientDashboard.tsx:1080 | Thumbnail | Client+PIN | `storageUrl('gallery-images', img.thumbnail_path \|\| img.storage_path)` | Calendar view thumbnails |

**Download paths**: Lines 71 (`downloadImage()` function), 750, 1186 invoke `fetch()` to get blob.

---

## C. Feed Studio + Creative Engine

Complex UI for generating social-media feed plans. Heavy image loading: preview cards, direction-card variants, replace-photo picker, crop control.

| File:Line | Type | Audience | URL build | Notes |
|-----------|------|----------|-----------|-------|
| CreativeRenderer.tsx:15 | Imports | Auth | `import { storageUrl } from '../supabase'` | Module-level import |
| CreativeRenderer.tsx:168, 235, 302, 416, 475 | Thumbnail (5×) | Auth | `storageUrl('gallery-images', img.thumbnail_path \|\| img.storage_path)` | Direction-card variants; crop previews |
| EventPlanDialog.tsx:17 | Imports | Auth | `import { storageUrl } from '../supabase'` | Module-level import |
| EventPlanDialog.tsx:325, 354 | Thumbnail (2×) | Auth | `storageUrl('gallery-images', img.thumbnail_path \|\| img.storage_path)` | Event plan picker grid |
| FeedStudio.tsx:23 | Imports | Auth | `import { supabase, storageUrl } from '../supabase'` | Module-level import |
| FeedStudio.tsx:1126 | Thumbnail | Auth | `storageUrl('gallery-images', img.thumbnail_path \|\| img.storage_path)` | Workspace card grid |
| FeedStudio.tsx:1247 | Web preview | Auth | `storageUrl('gallery-images', p.thumbnail_path \|\| p.storage_path)` | Variant reveal overlay |
| FeedStudioPreviews.tsx:13 | Imports | Auth | `import { storageUrl } from '../supabase'` | Module-level import |
| FeedStudioPreviews.tsx:96 | Thumbnail | Auth | `storageUrl('gallery-images', img.thumbnail_path \|\| img.storage_path)` | Post preview card dispatcher |
| GalleryDeepDive.tsx:12 | Imports | Auth | `import { storageUrl } from '../supabase'` | Module-level import |
| GalleryDeepDive.tsx:173 | Thumbnail | Auth | `storageUrl('gallery-images', topPick.thumbnail_path \|\| topPick.storage_path)` | Top-pick grid (30 images) |
| TenderBuilder.tsx:3 | Imports | Auth | `import { storageUrl } from '../supabase'` | Module-level import |
| TenderBuilder.tsx:51 | Web preview | Auth | `storageUrl('gallery-images', path)` | Tender builder image render |
| TenderBuilder.tsx:121 | Web preview | Auth | `fetch(imgUrl(img.storage_path))` → `storageUrl('gallery-images', path)` | PDF export: fetch image blob |

**Peak concurrency**: Direction-card grid can load 4×16=64 images + replace-photo picker 30 top picks = **94 images** at peak.

---

## D. Photographer Dashboard (`gallery-web/src/pages/Dashboard.tsx`)

Gallery management, image grid, upload, story edit, cover picker.

| File:Line | Type | Audience | URL build | Notes |
|-----------|------|----------|-----------|-------|
| Dashboard.tsx:294 | Thumbnail | Auth | **DRIFT** `https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/public/gallery-images/${path}` | Gallery grid cover image |
| Dashboard.tsx:910 | Web preview | Auth | **DRIFT** `https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/public/gallery-images/${path}` | Image grid URL builder |
| Dashboard.tsx:2295 | Thumbnail | Auth | `imgUrl(img.thumbnail_path \|\| img.storage_path)` (via line 910) | Image grid render |
| Dashboard.tsx:2696 | Story video | Auth | **DRIFT** `https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/public/${STORY_BUCKET}/${st.storage_path}` | Story video render |
| Dashboard.tsx:3739 | Thumbnail | Auth | `imgUrl(img.thumbnail_path \|\| img.storage_path)` | Image grid detail view |

**Upload path**: Lines 652, 707 use `supabase.storage.from('gallery-stories')` + `.upload()` directly.
**Storage bucket constant**: Line 586 defines `const STORY_BUCKET = 'gallery-stories'`.

**DRIFT ALERT**: Dashboard.tsx has **3 hard-coded URLs**. These must migrate to `storageUrl()` in Phase 4.0 pre-work.

---

## E. Other Pages

| File:Line | Type | Audience | URL build | Notes |
|-----------|------|----------|-----------|-------|
| ClientPage.tsx:169 | Thumbnail | Client | `storageUrl('gallery-images', img.thumbnail_path \|\| img.storage_path)` | (Legacy) Gallery cards |
| ClientPage.tsx:196, 669 | Story video | Client | `storageUrl('gallery-stories', s.storage_path)` | Story player |
| ClientPage.tsx:598 | Thumbnail | Client | `storageUrl('gallery-images', img.thumbnail_path \|\| img.storage_path)` | (Legacy) Image grid |
| FaceSearchExperience.tsx:61 | (prop) | Anon/Auth | `storageUrl: (path: string) => string` prop | Param passed from parent |
| FaceSearchExperience.tsx:326 | Thumbnail | Anon/Auth | `storageUrl(backgroundImages[0].thumbnail_path \|\| backgroundImages[0].storage_path)` | Selfie background mosaic |
| LandingPage.tsx:11 | **DRIFT** | Anon | **HARDCODED** `https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/public/gallery-images/dfa8f1a5-f558-4800-a09a-272020476da1` | Demo sample photos |
| PortfolioPage.tsx:25 | Thumbnail | Anon | `storageUrl('gallery-images', path)` | Portfolio grid |
| VendorPortal.tsx:161 | Web preview | Auth | `storageUrl('gallery-images', img.storage_path)` + fetch blob | Bulk download |
| VendorPortal.tsx:304 | Thumbnail | Auth | `storageUrl('gallery-images', img.thumbnail_path \|\| img.storage_path)` | Image grid |
| SocialManager.tsx:38 | Web preview | Auth | `supaStorageUrl('gallery-images', path)` (via prop) | Scheduled post preview |
| Viewer.tsx:141-144 | Lightbox | Anon/Auth | (passed as `currentSrc` prop) | Lightbox image display |
| StoryPlayer.tsx:276 | Story video | Anon/Auth | (passed as `storyUrl` prop) | Story playback video |

**DRIFT ALERT**: LandingPage.tsx line 11 hard-codes a full Eclipse Media demo URL. This is not a production photo path — it's a **one-time hardcoded asset** for landing-page demos.

---

## F. API Routes (Server-Side)

Routes that emit storage URLs in HTTP responses (for OG crawlers, social previews, etc).

| File:Line | Type | Audience | URL build | Notes |
|-----------|------|----------|-----------|-------|
| api/og.tsx:108 | OG cover image | Crawler | **DRIFT** `${SUPABASE_URL}/storage/v1/object/public/gallery-images/${path}` | OG image generator fallback URL |
| api/og.tsx:102 | og:image meta | Crawler | `https://pixflow-ai.com/api/og?gallery=...` | Delegates to ImageResponse (not direct URL) |
| api/share.ts:102 | og:image meta | Crawler | `https://pixflow-ai.com/api/og?gallery=...` | Delegates to /api/og |
| api/gallery-page.ts:96 | og:image meta | Crawler | `https://pixflow-ai.com/api/og?gallery=...` | Delegates to /api/og |
| api/score-images.ts:111 | Vision input URL | Backend | **DRIFT** `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}` | Claude vision API: image URL for scoring |

**Path origin**: `/api/og.tsx` picks cover from:
- `delivery_settings.coverImageUrl` (if present), or
- First image's `web_preview_path` (line 104-108)

---

## Abstraction Layer Recommendation

### Current State (Before Phase 4)

The `storageUrl()` helper in `gallery-web/src/supabase.ts:8` is the **single point of URL construction**:

```typescript
export function storageUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}
```

**Coverage**: 48 of 53 sites use this helper. This is excellent.

**Drift**: 5 sites hard-code the full URL (Dashboard.tsx ×3, og.tsx, score-images.ts).

### Phase 4.0 Pre-Work: Migrate Drift Sites

Before any signed-URL work, migrate the 5 drift sites to use `storageUrl()`:

1. **Dashboard.tsx:294** — Change to `storageUrl('gallery-images', path)`
2. **Dashboard.tsx:910** — Change to `storageUrl('gallery-images', path)`
3. **Dashboard.tsx:2696** — Change to `storageUrl(STORY_BUCKET, st.storage_path)`
4. **api/og.tsx:108** — Change to a `buildPublicUrl(path)` helper consistent with the SPA's `storageUrl()`
5. **api/score-images.ts:111** — Same

**Benefit**: Eliminates drift before Phase 4 swap. ~30 minutes of work.

### Phase 4.1: Signed URL Implementation

Once drift is fixed, **one file change** (`gallery-web/src/supabase.ts`) can swap URL construction:

```typescript
// Phase 4: signed URLs
export async function signedStorageUrl(bucket: string, path: string): Promise<string> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  return data?.signedUrl || storageUrl(bucket, path)
}

// OR via custom backend for token-scoped access:
export async function signedStorageUrl(bucket: string, path: string): Promise<string> {
  const res = await fetch('/api/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket, path })
  })
  const { url } = await res.json()
  return url
}
```

**Affected sites**: All 48 that call `storageUrl()`. Most are read-only and can be migrated in batch. Download paths (6 sites) need async/await handling.

### Latency Budget

**Query latency**: Current public-URL approach = **0ms** (built in client).
**Signed-URL approach**:
- **Via Supabase API**: ~30-100ms per URL (network roundtrip + JWT validation).
- **Via custom backend**: ~50-150ms per URL (backend auth + token generation).

**Mitigation**:
- **Batch requests**: Fetch 10-20 signed URLs per API call instead of 1 per image.
- **Cache in localStorage**: Store tokens with TTL (typically 1 hour).
- **Lazy load**: Defer signed-URL fetch until image is actually rendered (intersection observer).
- **Preload critical paths**: Welcome screen cover + first 6 masonry images on mount.

**Recommended approach**: Batch-fetch signed URLs per 10-image chunk; cache with 55-minute TTL; invalidate on logout.

---

## Bucket Inventory

| Bucket | Purpose | Sites | Counts |
|--------|---------|-------|--------|
| `gallery-images` | Photos (thumb, web, original) | 45+ | 2000+ renders/day |
| `gallery-stories` | Story videos (MP4) | 12+ | 20-100 renders/day |
| `demo-uploads` | Demo-gallery fallback | 1 (App.tsx:1370 conditional) | <10 renders/day |

**Recommendation**: Phase 4 should handle all 3 buckets identically — same signed-URL logic, same caching, same TTL.

---

## Drift Report: Hard-Coded URLs

| File:Line | Code | Action |
|-----------|------|--------|
| Dashboard.tsx:294 | `https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/public/gallery-images/${path}` | Migrate to `storageUrl('gallery-images', path)` |
| Dashboard.tsx:910 | `https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/public/gallery-images/${path}` | Migrate to `storageUrl('gallery-images', path)` |
| Dashboard.tsx:2696 | `https://vlyiqfawkrjvqcmkpfvs.supabase.co/storage/v1/object/public/${STORY_BUCKET}/${st.storage_path}` | Migrate to `storageUrl(STORY_BUCKET, st.storage_path)` |
| api/og.tsx:108 | `${SUPABASE_URL}/storage/v1/object/public/gallery-images/${path}` | Migrate to a server-side helper with same shape |
| api/score-images.ts:111 | `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}` | Same |
| LandingPage.tsx:11 | Hard-coded asset path (Eclipse Media demo) | ⚠️ One-time demo asset; leave as-is (not a drift bug) |

**Phase 4.0 Pre-Check**: Run grep for `/storage/v1/object/public/` post-migration — should return **0 results** in `src/` (except supabase.ts definition).

---

## Critical Load Paths (Latency-Sensitive)

### Synchronous on Mount (< 100ms required)
- **Welcome screen mosaic** (App.tsx:1382, 1414, 2248) — 6 images, must render before user sees blank
- **Masonry grid first batch** (App.tsx:1558) — 150 images visible, but only first 30-40 above the fold matter

### Deferred / Lazy (< 500ms acceptable)
- **Direction-card variants** (CreativeRenderer.tsx) — loads only when user opens dialog
- **Calendar view** (ClientDashboard.tsx:1080) — lazy-loaded on tab click
- **Story availability check** (ClientDashboard.tsx:315) — HEAD request, happens in background

### On-Demand / Background
- **Download blobs** (App.tsx:1644+, ClientDashboard.tsx:750+) — user expects 1-2s latency; batch fetch OK
- **Replace-photo picker** (FeedStudio.tsx:1126) — user browsing; 100-200ms roundtrip acceptable

**Phase 4 implication**: Synchronous paths (Welcome screen, masonry grid above-fold) need **cached signed URLs** or **pre-generated tokens at auth time**. Lazy paths can use on-demand token fetch.

---

## Summary: Path to Phase 4

1. **Phase 4.0**: Migrate 5 drift sites to `storageUrl()` (pre-work, 1 hour).
2. **Phase 4.1**: Implement `signedStorageUrl()` alongside existing `storageUrl()` (new function, no breaking changes).
3. **Phase 4.2**: Swap callsites: `storageUrl()` → `signedStorageUrl()` in batches by surface area:
   - Feed Studio (lower traffic, test bed)
   - Client Dashboard (medium traffic, contains caching)
   - Public Viewer (highest traffic, hardest to debug)
   - API routes (OG/share; already async)
4. **Phase 4.3**: Monitoring + fallback: log signed-URL failures; transparently fall back to public URLs.
5. **Phase 4.4**: Remove public-bucket ACL once Phase 4.3 is stable.

**Effort**: ~200 lines changed across 48-50 files (mostly callsite replacements) + new signed-URL backend logic (~100 lines).
