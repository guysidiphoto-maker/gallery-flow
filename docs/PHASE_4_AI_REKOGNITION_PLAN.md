# Phase 4.1 — AI / Rekognition Compatibility Plan

**Author:** AI/Rekognition Compatibility Agent
**Date:** 2026-05-06
**Status:** Plan only. No code in this PR.
**Scope:** Migrate every backend AI/face-recognition path off the public Supabase URL so Phase 4 can flip `gallery-images` to a private bucket without breaking `score-images`, `rekognition`, or downstream feed/campaign endpoints.

---

## 1. Internal image-access trace

| File | Constructs URL? | Sends to | Public-URL required? | Refactor needed? |
|---|---|---|---|---|
| `gallery-web/api/score-images.ts` | **Yes** — `buildPublicUrl()` at L110-112, called L320 | Anthropic Claude vision (`source: { type: 'url', url }` at L161) | No — Anthropic accepts inline base64 | **Yes** |
| `supabase/functions/rekognition/index.ts` | **Yes** — string-literal URL at L190 (`indexOneImage`) | AWS Rekognition `IndexFacesCommand` via `fetchImageBytes()` (L102, L191) — bytes already, but fetched through the public URL | No — Rekognition takes `Image: { Bytes }` directly | **Yes** |
| `gallery-web/api/generate-feed.ts` | **No** | Anthropic (text-only), no images | N/A | No |
| `gallery-web/api/generate-campaign.ts` | **No** | Anthropic (text-only), no images | N/A | No |
| `gallery-web/api/plan-event.ts` | **No** | Anthropic (text-only), no images | N/A | No |

**Key insight:** only `score-images.ts` and `rekognition/index.ts` hit image bytes. The three other endpoints reason over `image_ai_scores` rows + filenames + scores (text only) and never resolve image content. Phase 4.1 work is bounded to those two files plus a shared helper.

`rekognition/index.ts` already handles bytes downstream (L195 `Image: { Bytes: bytes }`). The only change there is *how* `bytes` are obtained — replace `fetchImageBytes(publicUrl)` (L102-106) with a service-role storage download.

`score-images.ts` is the harder case: today it passes a URL through to Anthropic. We must choose URL-via-signed vs. inline-base64.

---

## 2. Anthropic API constraint — recommend Option B (inline base64)

**Option A (signed URLs):** issue 1-hour signed URLs per image, pass to Anthropic. Pros: minimal code delta, no bandwidth blowup. Cons: leaks a (short-lived) URL; Anthropic must fetch within the window; debugging a 403 against an expired URL is nasty.

**Option B (inline base64):** `supabase.storage.from('gallery-images').download(path)` → `arrayBuffer()` → base64 → `{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }`. Pros: zero URL leakage; bytes never leave Vercel function memory; works for `gallery-images` and `demo-uploads`; symmetrical to the Rekognition refactor. Cons: +50-100 ms per image; +200 KB-2 MB egress.

**Cost parity:** Anthropic charges per image-input-token (resolution-driven, not transport), so URL vs. base64 is **the same price**. Vercel doesn't bill outbound to Anthropic.

**Recommendation: Option B.** Aligns with zero-trust, matches the Rekognition path, removes the Anthropic-timeout-vs-expired-URL failure mode.

---

## 3. AWS Rekognition constraint — Option C (inline bytes)

Rekognition supports two image inputs: `Image: { S3Object: { Bucket, Name } }` or `Image: { Bytes }`. Supabase storage is not an S3 bucket the AWS SDK can grant cross-account access to, so Option D (S3 bridge via CloudFront) is over-engineered.

**Today** (`indexOneImage`, L189-200): the function already passes bytes, just sources them via public URL.

**Option C (recommended):** fetch via service role inside the edge function. The single line change is L191 (`fetchImageBytes(publicUrl)` → service-role download). `Image: { Bytes }` already works.

**Bandwidth/latency cost:** edge function downloads from Supabase storage internally — same data center, ~30-80 ms median. Then base64 is **not** required (bytes are passed as `Uint8Array` directly to the AWS SDK). For a 50-image gallery indexing run, the wall time impact is `50 × ~50 ms = ~2.5 s` extra (already running with `INDEX_CONCURRENCY = 6` so amortized: ~400 ms).

The 5 MB inline limit (per Rekognition docs) is not a concern: the rekognition path already pulls `web_preview_path` (L255), which is the resized 1024 px web preview, ≪ 5 MB.

---

## 4. Service-role internal access pattern

**Today (public URL — score-images.ts L110-112, L320):**
```ts
function buildPublicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`
}
// ...
todo.push({ image_id: id, url: buildPublicUrl(path) })
```

**Phase 4 (service-role bytes):**
```ts
const { data, error } = await supabase
  .storage
  .from('gallery-images')
  .download(path)  // service-role bypasses RLS + bucket-public flag
if (error || !data) throw new Error(`download_failed:${error?.message ?? 'no_data'}`)
const buffer = Buffer.from(await data.arrayBuffer())
const base64 = buffer.toString('base64')
// → Anthropic: { type: 'image', source: { type: 'base64', media_type, data: base64 } }
// → Rekognition: { Image: { Bytes: new Uint8Array(buffer) } }
```

The Supabase JS client created with `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS for storage operations; the `download()` method works regardless of the bucket's `public` flag. This is documented behaviour and stable across `@supabase/supabase-js v2.x`.

`media_type` for Anthropic: derive from filename extension (jpg/jpeg → `image/jpeg`, png → `image/png`, webp → `image/webp`). All three are accepted by Claude vision.

---

## 5. Code changes (list, do not implement)

### 5a. New shared helper — `gallery-web/api/lib/serverImageBytes.ts`

**New file**, ~80 LOC. Exports:

```ts
export async function downloadImageBytes(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<{ buffer: Buffer; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }>

export function bufferToAnthropicImage(
  buffer: Buffer,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
): Anthropic.ImageBlockParam

export async function downloadImagesParallel(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
  concurrency?: number, // default 5
): Promise<Array<{ path: string; buffer: Buffer; mediaType: string } | { path: string; error: string }>>
```

Concurrency is implemented with a simple cursor-based pool (no extra dep — same pattern as `processGallery` L287-305 in the Rekognition function). Default cap of 5 protects Supabase storage from a 40-image scoring run firing 40 parallel range-reads.

### 5b. `gallery-web/api/score-images.ts`

- **Remove** L37 `STORAGE_BUCKET` constant inline literal — keep, but add `import { downloadImagesParallel, bufferToAnthropicImage } from './lib/serverImageBytes'`.
- **Remove** `buildPublicUrl()` (L110-112).
- **Replace** L314-321 (the `todo` build loop): instead of computing public URLs, collect `{ image_id, path }`. After the loop, before `if (todo.length === 0)`, call `downloadImagesParallel(supabase, STORAGE_BUCKET, todo.map(t => t.path), 5)` and zip results back. Skip any image that errored on download (log to `batchErrors`).
- **Change** `BatchPhoto` interface (L71): `url: string` → `image: Anthropic.ImageBlockParam` (pre-built block ready to drop into `content`).
- **Change** `scoreBatch` L161: `{ type: 'image', source: { type: 'url', url: batch[i].url } }` → `batch[i].image` (already built above).
- Net delta: -10 LOC, +25 LOC. Approx **+15 LOC** net.
- Failure modes: `download` returns `error.message === 'Object not found'` for missing paths (treat as permanent skip — image record is orphaned); 401/network errors bubble up as transient failures (retry on next scoring run, since this endpoint is already idempotent — see L302-311).

### 5c. `supabase/functions/rekognition/index.ts` (Deno)

- **Remove** `fetchImageBytes()` (L102-106) — the public-fetch helper.
- **Replace** L190-191 (`const publicUrl = ...; const bytes = await fetchImageBytes(publicUrl)`) with:
  ```ts
  const { data, error } = await sb.storage.from('gallery-images').download(image.storage_path)
  if (error || !data) throw new Error(`storage_download_failed:${error?.message ?? 'no_data'}`)
  const bytes = new Uint8Array(await data.arrayBuffer())
  ```
  Note: `sb` (the service-role client) is already passed into `indexOneImage` via the `sb` param (L175). Good.
- **No** new imports needed — `@supabase/supabase-js` already imported at L2 (Deno: `https://esm.sh/...`).
- Net delta: **-5 LOC, +5 LOC ≈ 0**.
- Failure modes: existing 3-attempt retry loop (`MAX_INDEX_ATTEMPTS`, L228-241) absorbs transient storage errors. A permanent `storage_download_failed` after 3 attempts will stamp `face_count = 0` with the error message — same behaviour as today's "Web preview not available" branch.

### 5d. `gallery-web/api/generate-feed.ts`, `generate-campaign.ts`, `plan-event.ts`

**No changes.** None of these touch image bytes — verified by exhaustive read. They join `images` + `image_ai_scores` and pass scores/filenames as text to Claude. Independent of bucket privacy.

---

## 6. Edge function reality check (Deno vs Node)

`supabase/functions/rekognition/index.ts` runs on Supabase Edge Runtime (Deno). The Vercel functions run on Node 22. This means the `serverImageBytes.ts` helper in `gallery-web/api/lib/` **cannot be imported** by the edge function — different module system (`https://esm.sh/...` vs npm), different std lib (`Deno.env` vs `process.env`), different Buffer semantics (Deno uses `Uint8Array`; Node has `Buffer`).

**Decision: duplicate the storage-download line.** The edge function already has the Supabase client imported and only needs ~3 lines (`download` → `arrayBuffer` → `Uint8Array`). A shared helper buys nothing; copy-paste keeps the edge function self-contained and auditable. Same pattern, written twice — one in TypeScript-Node, one in TypeScript-Deno.

If we later add a *second* Deno function that needs this, we revisit and create `supabase/functions/_shared/imageBytes.ts` (Supabase-blessed shared-module path).

---

## 7. Cost impact

| Dimension | Today | Phase 4.1 | Delta |
|---|---|---|---|
| Anthropic input tokens | URL-fetch by Anthropic (free) | Inline base64 (charged identically — image input tokens) | **0** |
| Vercel egress (function → Anthropic) | ~0 (URL only) | 200 KB-2 MB per scored image | +48-480 MB / scoring run |
| Supabase storage egress (internal, function → function) | ~0 | 200 KB-2 MB per scored image, internal | Free within Supabase region |
| Vercel function-time | baseline | +50-100 ms per image (download) | +2-4 s on a 40-image run; well under `maxDuration = 60 s` |
| Rekognition edge function bandwidth | Public URL fetch (Supabase egress) | service-role download (internal) | **Lower egress** — same bytes, no public-URL hop |

**Extrapolated monthly cost:** 100 scoring runs/month × ~240 MB avg = ~24 GB Vercel egress to Anthropic. Vercel Pro plan includes 1 TB egress; this is **<3 %** of the included quota. Net additional billable cost: **$0**.

---

## 8. Migration timing within Phase 4

Per `PHASE_4_MASTER_PLAN.md`, this work belongs to **Phase 4.4 — Backend AI flows on internal access**. Pre-requisites:

- **Phase 4.1** signed-URL helper (`gallery-web/api/lib/signedImageUrl.ts`) — irrelevant to AI flows because we're choosing inline bytes, not signed URLs. No dependency.
- **Phase 4.2** bucket-private dry run on a staging project — must complete first so we can validate that public-URL access actually fails (and our service-role path actually works) without affecting production.

**Cutover order:**
1. Land `serverImageBytes.ts` + `score-images.ts` change. Deploy to preview. Manually verify against a staging gallery (which has the bucket flipped private already).
2. Land `rekognition/index.ts` change. Deploy edge function via Supabase CLI. Manually verify face indexing on a staging gallery.
3. Production deploy: each endpoint independently. The bucket is **still public** during 4.4 — both old (public-URL) and new (service-role) paths work identically against a public bucket, so deploys are safe.
4. Phase 4.5 flips the bucket private. At that point the old code paths would fail; the new ones don't. If 4.5 reveals a regression, rollback is "flip the bucket back to public," not a code rollback.

**Per-endpoint rollback:** revert the PR. The bucket is still public during 4.4, so reverted code keeps working. Zero-risk staged rollout.

---

## 9. Edge cases

- **Demo galleries** (`isDemoGallery: true`): images live in `demo-uploads` bucket. Service-role `download` works identically. The helper takes `bucket` as a parameter, not a constant. The current `score-images.ts` uses `STORAGE_BUCKET = 'gallery-images'` (L37) — verify whether scoring is called for demo galleries (the audit report should answer this; if yes, the bucket parameter must be derived from `gallery.delivery_settings` or similar). **Open item** — flag for user.
- **Stories bucket** (`gallery-stories`): video, not images, never touched by AI scoring or Rekognition. No work.
- **Original-resolution images**: 5-15 MB each. `image_ai_scores` is keyed off `web_preview_path` (L287-318 in score-images), not `original_path`. `rekognition` also uses `web_preview_path` (L255). Both feed thumbnails/web previews (~200 KB-2 MB), well under the 5 MB Rekognition inline limit and well under any practical Anthropic limit.
- **Missing `web_preview_path`**: existing fallbacks (score-images L318 falls back to `thumbnail_path`; rekognition L184-187 stamps `face_count = 0` with explanatory error). Both already handle it; no new edge cases introduced.
- **Anthropic media-type sniffing**: if filename has no extension or is `.HEIC`, `media_type` derivation needs a fallback. Recommend defaulting to `image/jpeg` and letting Anthropic reject if truly unsupported (which surfaces in `batchErrors`).

---

## 10. Open questions for the user

1. **Concurrency cap**: confirm 5 parallel `storage.download()` calls per scoring run. Higher = faster but pressure on Supabase storage. Lower = safer but slower wall-time. Default 5 mirrors `INDEX_CONCURRENCY = 6` already used in the rekognition function.
2. **Migrate rekognition function alongside Vercel functions, or defer?** The Rekognition path is lower-frequency (per-gallery one-time index) but more complex (Deno + EdgeRuntime + waitUntil). Recommend: migrate **alongside**. Decoupling means a 4-week window where one path uses internal access and the other uses public URLs — confusing during 4.5 cutover.
3. **AI scoring latency SLA**: today, 40-image scoring run takes ~30-50 s wall time (5 batches × ~6-10 s/batch). Adding 2-4 s for downloads is <10 % overhead and within the existing `maxDuration = 60 s` cap. Is there a customer-facing SLA on "scoring completed within X" that this would violate? If yes, mitigation is to start downloads in parallel with the first batch's Claude call (overlap I/O); if no, leave the simpler sequential design.
4. **Demo-gallery scoring**: does `score-images` ever run against `demo-uploads`? If yes, the helper must accept the bucket as input (already designed that way) and the caller must derive bucket from gallery context. If no, hardcoding `gallery-images` is fine.

---

## Summary

- Two files need changes: `score-images.ts` (Vercel/Node, ~+15 LOC net) and `rekognition/index.ts` (Supabase Edge/Deno, ~0 LOC net).
- Three other AI endpoints (`generate-feed`, `generate-campaign`, `plan-event`) are text-only and need no changes.
- Recommended pattern: inline base64 to Anthropic, raw bytes to Rekognition, both sourced via service-role `supabase.storage.download()`.
- New shared helper `gallery-web/api/lib/serverImageBytes.ts` (Node only — Deno function copy-pastes the 3-line pattern).
- Cost impact: negligible. Latency impact: 50-100 ms per image, <10 % overhead.
- Cutover is per-endpoint, reversible while bucket remains public during Phase 4.4.
