# Watermark Engine (`/api/watermark`)

Composites the studio's brand-kit watermark (logo OR studio name OR custom
text) onto the full-resolution download at the moment the guest clicks
"Download". Browsing surfaces — thumbnails, web previews, lightbox — keep
streaming the clean image, so the gallery preserves its wow factor. Only
the explicit export is marked.

## Endpoint

```
GET /api/watermark
  ?image=<storage_path>            # original_path OR storage_path
  &business=<business uuid>
  &pvt=<public-viewer token>       # gallery-scoped session token
```

Auth chain (mirrors `/api/gallery-zip`):

1. Origin allowlist (localhost, *.vercel.app, *.pixflow.co.il,
   *.pixflow-ai.com, *.eclipsemedia.co.il).
2. Service-role lookup resolves `gallery_id` + `bucket` from the image
   row; if the row's `business_id` doesn't match the supplied query
   param, we 404.
3. `verify_public_gallery_session(pvt, gallery_id)` RPC must return true
   — same RPC the signed-URL path uses, so a token scoped to a different
   gallery can't pull bytes through this endpoint.

Response: `image/jpeg` (default) or `image/png` (when the source format
is PNG so transparency is preserved). `Content-Disposition: attachment`
so the browser triggers a download rather than rendering inline.

## Brand-kit resolution order

Per-gallery override (in `galleries.delivery_settings`) always wins over
the studio default; if both are unset we serve the unmarked original.

| Field | Per-gallery key | Brand-kit key | Default |
| --- | --- | --- | --- |
| Enabled | `watermarkEnabled` | `brand_kit.watermark.enabled` | off |
| Source | `watermarkSource` | `brand_kit.watermark.source` | inferred |
| Text | `watermarkText` | `brand_kit.watermark.text` | `business_name` |
| Logo | — | `brand_kit.watermark.logo.{url, square_url}` | `businesses.logo_url` |
| Position | `watermarkPosition` | `brand_kit.watermark.position` | `bottom-right` |
| Scale (% of min dim) | `watermarkScalePercent` | `brand_kit.watermark.scale_percent` | 12 (logo) / 6 (text) |
| Opacity (1–100) | `watermarkOpacityPercent` | `brand_kit.watermark.opacity_percent` | 70 |
| Contrast-aware | `watermarkContrastAware` | `brand_kit.watermark.contrast_aware` | off |

Contrast-aware mode samples an 8×8 grey downsample of the region under
the watermark; if the average luminance > 140 we flip to dark text /
negate the logo, otherwise we keep white. Costs ~3 ms per call.

## Cost envelope

`sharp` is a native binding (libvips). Vercel Functions (Node 20 runtime)
warm up after the first invocation per container:

| Step | Cold (ms) | Warm (ms) |
| --- | --- | --- |
| Cold-start + module load | 250–400 | n/a |
| Supabase metadata lookups (×2) | 70–120 | 40–60 |
| Storage download (10 MB original) | 200–500 | 200–500 |
| sharp decode + metadata | 40–80 | 10–20 |
| Text overlay (SVG → PNG) | 15–30 | 5–10 |
| Logo overlay (fetch + resize + opacity) | 80–150 | 30–60 |
| Contrast sample | 6–12 | 2–4 |
| sharp composite + encode (mozjpeg q=92) | 120–250 | 50–120 |
| **Total per request** | **~700–1500 ms** | **~330–780 ms** |

Throughput (Fluid Compute, 1024 MB): ~30 req/s steady-state per region.

### Bandwidth

The endpoint re-encodes at JPEG q=92 (mozjpeg). For a typical 8 MB
camera original this lands at ~7–9 MB — call it neutral. Egress is
charged at standard Vercel rates (no AI Gateway in front, no Smart CDN
re-encode). For a 1000-download wedding gallery the bandwidth bill is
~$0.07 (image bytes) + ~$0.30 (compute @ 1 GB-s × 1000) ≈ **$0.40 per
1000 originals downloaded**.

Cache headers:

- `Cache-Control: public, max-age=31536000, s-maxage=86400, stale-while-revalidate=86400, immutable`
- 1 day at Vercel's CDN, 1 year client-side. Watermark config changes
  are rare; on a brand-kit update operators rotate via a gallery slug
  bump or a targeted CDN purge.

## Why Node, not Edge

`sharp` is a native binding (libvips) — Edge Functions and Edge
Middleware don't ship native modules. The `og.tsx` endpoint can render
text/SVG on Edge because it uses `@vercel/og` (satori, pure JS), but
satori can't decode a 12 MP RAW-source JPEG, recompress it, and stream
back 8 MB without OOM. Sharp + Node is the only viable runtime today.

## Failure mode

A failed watermark is worse for the photographer than no watermark — a
500 in front of a paying guest derails the whole download flow. Every
catch path serves the **unmarked original** instead. Specifically:

- Supabase metadata lookup fails → 404 (we never had bytes to serve).
- Storage download fails / file >50 MB → 404.
- PVT invalid or wrong gallery → 401.
- Brand-kit config missing or disabled → original unmarked (200).
- sharp throws (corrupt source, OOM, invalid SVG, etc.) → original
  unmarked (200) with `console.warn` for the operator.

The frontend never has to special-case the response shape: bytes are
bytes, the watermarked path is a strict superset of the clean path.
