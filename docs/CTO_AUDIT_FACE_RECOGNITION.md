# Pixflow / GalleryFlow — CTO Audit
## Face-Recognition Pipeline & Adjacent Risks

**Date:** 2026-04-28
**Author:** Engineering audit (read-only)
**Scope:** Production system, currently live, in active use by photography clients
**Status:** Read-only assessment. No structural changes proposed without explicit approval.

---

## Executive Summary

Pixflow is functional in production but architecturally fragile. Face recognition specifically suffered from three independent bugs that compounded into "feels broken" — two of them were fixed and deployed on 2026-04-28; the third (a UX/server contract mismatch) was also fixed.

The deeper concerns are structural and remain open:

1. **No retry on the gallery `publishing → live` transition.** A single failed UPDATE leaves the gallery permanently stuck. Two such drafts exist in the DB right now.
2. **Two separate sources of truth for gallery size** (`galleries.image_count` vs `COUNT(*)` on `images`), which drift apart and silently mislead the UI.
3. **The face-indexing status machine depends on a DB trigger that only fires on a specific column transition** — if a worker dies before stamping, the gallery is stuck in `indexing` indefinitely with no self-healing.
4. **EdgeRuntime CPU/wall time is an undocumented cliff** for galleries with 1000+ images. The system depends on lock-staleness re-claim, which created a counter-overshoot race we just fixed.
5. **No observability.** Errors are written to user-facing columns, not to logs. We cannot answer "did the worker finish?" without inspecting per-image rows.
6. **The `get_my_usage` RPC is returning 404 in production** (visible in client console), creating a billing/quota blind spot.

None of the open issues require immediate intervention. All can be addressed with diagnostic-first, behind-the-flag tactics. This document recommends a phased plan.

---

## 1. System Understanding

Pixflow is a desktop app for event photographers (Electron + React) with a public web viewer for guests (Vite SPA on Vercel). The product loop:

1. Photographer imports a folder of photos in the desktop app.
2. The app generates three asset tiers locally: originals, web-optimized previews (~1600 px JPEG), and thumbnails.
3. The app uploads all three tiers to Supabase Storage in a specific order, then publishes the gallery.
4. After publish, AWS Rekognition runs in the background and indexes faces from the web previews.
5. The photographer shares a public URL: `gallery-web-theta.vercel.app/gallery/{id}`.
6. Guests open the gallery, take a selfie, the selfie is sent to a Supabase edge function that calls `Rekognition.SearchFacesByImage`, and matched photos are returned.

**What is unclear from a CTO seat:** there is no centralized observability — no error aggregation, no trace IDs across the upload→index→search path, no alerting on stuck galleries. The system is built but not instrumented for production support.

---

## 2. Architecture Map

```
[Photographer's Mac]                          [Cloud]
─────────────────                             ───────────────────────────
Electron main (src/main)
Electron renderer (src/renderer)
  ├─ cloudUpload.ts ─── TUS / signed URL ──▶  Supabase Storage (gallery-images)
  ├─ faceIndex.ts   ─── invoke ──────────▶    Edge Function: rekognition
  └─ store/publish.ts                          │
                                               ├─ AWS Rekognition (eu-central-1)
                                               │   collection per gallery
                                               │
                                               └─ Supabase Postgres
                                                  ├─ galleries
                                                  ├─ images
                                                  ├─ image_faces
                                                  ├─ rekognition_search_log
                                                  ├─ businesses / subscriptions
                                                  └─ triggers + RPCs

[Guest's phone/laptop]
─────────────────────
gallery-web (Vite SPA, Vercel)
  ├─ FaceSearchExperience.tsx ── multipart ─▶ Edge Function: rekognition (action=search)
  └─ App.tsx (gallery viewer)
```

**Key data flows:**
- **Photographer → Storage:** large, sequential, can take hours.
- **Edge function → Rekognition:** background, fan-out concurrency = 6 per worker, `EdgeRuntime.waitUntil` keeps it alive after the HTTP response returns.
- **Guest → Edge function:** single round-trip multipart upload of a selfie (≤ 5 MB), rate-limited to 10 per IP per hour.

---

## 3. Flow Trace (Read-Only)

### 3.1 Upload + Publish — `src/renderer/src/lib/cloudUpload.ts`

| Step | What should happen | Where it can fail | Signals available today |
|---|---|---|---|
| Insert gallery row | `status='publishing'`, `image_count=imagePaths.length` (line 206) | RLS / auth race | DB row with `status=publishing` |
| Compress 3 images in parallel | sharp-style local compression | OOM on large RAW, missing source file | console.error in renderer; **no DB record** |
| Upload thumbs + previews | direct API or TUS for >limit | network blip; TUS resume bug; storage 5xx | per-image `web_preview_uploaded` flag |
| Image rows insert | only after preview pass threshold (lines 483-527) | RLS, race vs gallery row | `images.upload_status` |
| Flip `status='live'` | single update (lines 532-536) | **no retry** — if this throws, gallery stays in `publishing` forever | gallery row stuck |
| Kick off face indexing | `startFaceIndexingInBackground(galleryId)` | already-running lock | `face_index_status` |
| Originals upload | async after live | per-item failure flag, manual retry only | `original_failed_count`, `original_failed_reason` |

### 3.2 Face Indexing — edge function + DB triggers

| Step | What should happen | Where it can fail | Signals |
|---|---|---|---|
| Client invokes `rekognition` with `action=index_gallery` | atomic claim of the lock (`try_claim_face_indexing`) | concurrent claim, stale lock | `started` / `alreadyRunning` |
| Recompute counters *(fixed 2026-04-28)* | self-heal `face_indexed_count` + `image_count` | RPC missing → fallback | RPC return value |
| Pre-stamp images without uploaded preview *(fixed 2026-04-28)* | mark `face_index_error='Web preview not uploaded'` | PG conflict; trigger overhead | per-image stamp |
| Concurrent indexing of pending images | bounded concurrency = 6 | AWS throttle, EdgeRuntime CPU/wall limit, image fetch 4xx | per-image `face_index_attempts`, `face_index_error` |
| Trigger flips gallery to `done` | when last `face_indexed_at` lands | trigger silently no-ops if `image_count` mismatches | `face_index_status='done'` |
| Polling | client polls every 3 s until terminal | edge function dies mid-run; no terminal write | UI shows infinite "indexing" |

### 3.3 Selfie Search — gallery viewer

| Step | What should happen | Where it can fail | Signals |
|---|---|---|---|
| Guest opens gallery | viewer reads `face_index_status` + `face_indexed_count` | private/auth gate | UI shows search button |
| Selfie capture (camera or upload) | client-side 5 MB cap | bad-camera permissions | client error |
| Multipart POST to `rekognition` | server checks gallery status, rate-limit (10/hr/IP) | 404 if not 'live' or not indexable, 429 if rate-limited *(was: 404 during 'indexing' — fixed 2026-04-28)* | console error |
| Rekognition search | `SearchFacesByImage`, threshold=70, max=100 matches | InvalidParameterException = no face in selfie (treated as 0 matches) | `result.FaceMatches` |
| Hydrate matched rows server-side | service-role select bypasses RLS | image rows missing | empty matches |
| Return + render in viewer | client renders matches across sections | none observed | UI displays photos |

---

## 4. Root Problems (Structural)

These are real issues regardless of any single bug already fixed.

1. **No retry on the `status='live'` transition.** A single failed `UPDATE` permanently strands the gallery. Two Alma Academy drafts are stuck right now.
2. **Two separate sources of truth for gallery size.** `galleries.image_count` is set at publish time and never reconciled. `COUNT(*) FROM images WHERE gallery_id = X` drifts. UI labels that subtract these silently lie.
3. **The face-indexing trigger only fires on a NULL→non-NULL `face_indexed_at` transition.** If a worker dies leaving NULLs, the gallery stays in `indexing` indefinitely. Recovery requires manual user action.
4. **EdgeRuntime CPU / wall time is an undocumented cliff** for galleries with 1000+ images. The 10-minute lock-staleness is a workaround, not a design.
5. **No observability when things go wrong silently.** `face_index_attempts=0` on demonstrably-failed images is the canary: the inner try/catch swallows DB write failures, so we have no audit of what happened. Errors persist to user-visible columns, not logs.
6. **No idempotency in the upload pipeline.** Re-publishing a partially-failed gallery has no deduplication. Structural debt.
7. **`get_my_usage` RPC returns 404 in production.** Visible in client console. Tracked to `migrations/015_plans_and_subscriptions.sql` referencing a metadata field that doesn't match the actual `images` schema. Quota / plan-gating widget fails silently.
8. **Public selfie endpoint accepts a 5 MB upload before rate-limiting.** Anonymous abuse vector — egress saturation possible before the throttle kicks in.
9. **Cross-component coupling via DB columns rather than events.** `web_preview_uploaded` boolean and `web_preview_path` field can disagree (observed). Neither alone is authoritative.
10. **Local source files referenced from cloud rows.** The "249 photos missing" banner is an Electron-side disk check tied to DB rows. Moving an iCloud Drive folder breaks the linkage. Cloud should be self-sufficient.

---

## 5. Face-Recognition Issues — Deep Dive

### Where the moving parts live

| Concern | Implementation |
|---|---|
| Detection | AWS Rekognition `IndexFacesCommand` (server-side, eu-central-1) |
| Embeddings | **Stored only inside Rekognition's per-gallery collection.** We never persist a vector ourselves. |
| `image_faces` table | Holds only `rekognition_face_id`, `confidence`, `bounding_box`. Embedding is a black box managed by AWS. |
| Matching | `SearchFacesByImageCommand` against the gallery's collection (threshold=70, MaxFaces=100). |

### Why it fails or feels unreliable, in order of impact

1. **(Fixed 2026-04-28)** A single image whose web preview never uploaded would block the entire gallery's status from reaching `done` — the worker burned its retries and either gave up or got killed before stamping. The gallery stuck on `indexing` or flipped to `failed`.
2. **(Fixed 2026-04-28)** The viewer advertised partial search during `indexing` but the server returned 404. Worst kind of bug: UI looked healthy, the user got an error, no logs.
3. **(Open) Lock staleness (10 min) is shorter than realistic worker lifetimes** for very large galleries. A new claim can run while an old worker is still alive. Idempotent stamping (shipped) prevents the double-count, but doesn't prevent two workers doing the same Rekognition API call (paying twice).
4. **(Open) No worker progress checkpoint.** If a worker dies, the system has no idea how far it got. Only `face_indexed_at` per image tells you, and only after success.
5. **(Open) `MaxFaces` per image = 100, threshold = 70%.** Reasonable defaults but no per-event tuning. Threshold 70 against chaotic event-floor crowd photos surfaces false positives. The user-perceived "unreliable" claim is partly real.
6. **(Open) No re-index pathway.** Changing threshold, MaxFaces, or AWS region requires deleting the collection and re-indexing. There is `delete_collection`, but no managed flow combining it with re-indexing.
7. **(Open) No audit log of selfie searches.** `rekognition_search_log` records IP hash + timestamp for rate-limiting only. We can't tell whether the system "feels unreliable" to *one* guest or *every* guest at a given event.

---

## 6. Safe Fix Strategy — Three Levels

### Level 1 — Zero risk (do these first)

- **Add structured logging on the edge function.** Add `gallery_id` and a request ID to every log line. Read-only behavior change.
- **Add a per-gallery health-check RPC** that returns: `image_count_actual`, `face_indexed_actual`, `pending_count`, `last_indexed_at`, `stuck_minutes`. Surface it in the photographer's "Live Galleries" list.
- **Add a server-side validity check on `web_preview_path` before writing it to images.** A HEAD request after upload. We already have the data; we just don't verify.
- **Surface `face_index_error` per-image in the photographer UI.** Today only the gallery-level error shows. Per-image errors are written to the row but no UI reads them.
- **Add a Sentry / log drain for the renderer process.** Catches the silent renderer-side failures we have been seeing in the console.

### Level 2 — Low risk (behind a flag or shadow)

- **Background reconciliation job** (cron / Supabase scheduled function). Every 15 min, find galleries in `indexing` for >30 min and re-claim them; find galleries in `publishing` for >5 min and either retry the live flip or alert. Does not change live behavior — catches stuck rows.
- **Idempotent retry on `status='live'`.** Wrap the publish flip in a 3-attempt loop with exponential backoff. Behind a feature flag.
- **Pre-flight rate-limit check on selfie search.** Accept a small "intent" POST first (no body) and return 429 if rate-limited, *before* a 5 MB upload. Gallery-viewer change only.
- **Shadow-mode threshold tuning.** Run search at threshold 70 (current) AND 80 simultaneously, log both result sets to a new `face_search_shadow` table. After two weeks, decide if 80 is better. Zero impact on what guests see.
- **Per-image error surface in the photographer's section view.** Already-collected data, just unhidden.

### Level 3 — High risk (do NOT implement now)

- **Replace AWS Rekognition with a self-hosted vector DB + embedding model.** Multi-week project, regression risk on match quality, billing model change, infra ownership shift. Only consider if Rekognition cost or accuracy becomes unacceptable.
- **Rewrite the upload pipeline as an event-driven job queue** (BullMQ / Inngest / Supabase queues). Solves race conditions and adds resumability cleanly, but is a re-architecture.
- **Decouple `image_count` from gallery row by always deriving it from a view.** Touches every read path; high blast radius.
- **Move face indexing off Edge Functions onto a long-running worker** (e.g. Fly.io machine, GCP Cloud Run job). Removes the EdgeRuntime time cliff and the lock-staleness race entirely. Big infra change.

---

## 7. What NOT to Touch Right Now

While the system is live and serving Alma Academy:

- **Rekognition collection IDs.** They are keyed to gallery UUIDs. Renaming or migrating them invalidates all indexed data without re-indexing.
- **The `try_claim_face_indexing` RPC semantics.** Multiple parts of the worker depend on its specific lock-and-update behavior.
- **The `images.face_indexed_at` trigger** (`check_gallery_face_index_complete`). It is load-bearing for status transitions.
- **The TUS upload flow for originals.** Resumable uploads have subtle state. Any change risks breaking "can resume after Mac sleep" behavior photographers rely on.
- **The public URL format** (`gallery-web-theta.vercel.app/gallery/{id}`). Photographers have shared these with clients; changing breaks live links.
- **The `delivery_settings` JSONB shape.** Read by both photographer UI and viewer; loose coupling = changing the shape breaks things silently.
- **Anything during a known active event window.** No DB schema changes, no edge-function deploys while a photographer is mid-publish.

---

## 8. Safe Debug Plan

Instrument **without** changing behavior:

1. **`face_index_runs` audit table.** Insert a row at the start of `actionIndexGallery`, update it at the end. Captures: `gallery_id`, `started_at`, `ended_at`, `claimed`, `pending_at_start`, `pending_at_end`, `exit_reason` (`'done' | 'edge_timeout' | 'aws_error' | 'crashed'`). Zero impact on hot path; gives us our first real "did the worker actually finish?" signal.
2. **Daily / hourly metrics view:**
   - galleries stuck in `publishing` > 5 min
   - galleries stuck in `indexing` > 30 min
   - per-image `face_index_attempts > 0` in the last 24 h
   - selfie searches by gallery + match-rate distribution
   All read-only, materialized via SQL views.
3. **A single internal diagnostic page** in the photographer UI (behind a hidden URL): stuck galleries, worker health, recent errors. Read-only, internal-only.
4. **Test with isolated data.** A dedicated diagnostic business + 10-photo test gallery (separate Supabase user). Run end-to-end against it before any non-trivial change. Never test in production with real galleries.
5. **Replay capability for selfie searches.** Selfies are not stored (correct — PII). But persist a *match summary* per search: `gallery_id`, `ip_hash` (already there), `match_count`, `top_similarity`. When a guest reports "it didn't find me", we have something to look at.

---

## 9. Prioritized Action Plan

### This week — diagnostic, no risk

1. Add the `face_index_runs` audit table + insert/update from the edge function (read-only side effect).
2. Add the per-gallery health-check RPC and surface it in the photographer's "Live Galleries" list.
3. Manually unstick the two Alma drafts in `status='publishing'` (one-time SQL update after explicit approval).
4. Investigate the `get_my_usage` 404 — likely a one-line migration fix; verify in a staging/diagnostic gallery first.

### Next 2 weeks — low risk, behind flags

5. Background reconciliation job for stuck `publishing` and stuck `indexing` rows.
6. Per-image error surface in the photographer UI.
7. Pre-flight rate-limit check on selfie endpoint.
8. Renderer-process error log drain (Sentry / similar).

### Month 1 — measure before changing

9. Shadow-mode threshold tuning: log search results at threshold 70 + 80 in parallel for two weeks, then decide.
10. Audit cost: how many duplicate Rekognition calls happened in the last 30 days because of the lock-staleness race? If <5%, leave it. If higher, prioritize Level 3 worker move.

### Quarter — only if data justifies

11. Move face indexing off Edge Functions onto a long-running worker.
12. Replace `image_count` with a derived view.

---

## What I Could Not Verify

- Whether `face_index_runs` would conflict with existing migrations 023–035 (a full migration grep was not done).
- Actual Rekognition cost per gallery today (no telemetry).
- Whether the gallery viewer caches `face_index_status` — if yes, the "search now works during indexing" fix may have a stale-cache delay.
- Whether anyone is currently mid-publish on a different gallery (would affect timing of any redeploy).

---

## Recent Production Changes Made During This Audit (2026-04-28)

For full context, three changes were already deployed to production during the diagnostic phase:

| Change | File | Reason |
|---|---|---|
| Race-safe stamping + skip unfetchable images + don't fail-whole-gallery | `supabase/functions/rekognition/index.ts` | One image without web preview was failing the entire gallery |
| Recompute RPC for `face_indexed_count` | `supabase/migrations/037_face_index_recompute_rpc.sql` | Counter overshoot (e.g. 1991/1198) from concurrent worker claims |
| Recompute extended to `image_count` | `supabase/migrations/038_recompute_image_count.sql` | Stale `image_count` produced misleading "Index N new photos" labels |

Commit: `cfbbf72` on `main` — `https://github.com/guysidiphoto-maker/gallery-flow`.

---

## Questions for the CTO

1. **What is the acceptable level of false-positive matches on selfie search?** The current threshold (70%) is recall-biased. If we are getting complaints about "wrong photos surfaced", that's a data point that justifies the shadow-tuning experiment.
2. **What is our observability budget?** Adding Sentry or a log drain has a small cost but is the highest-leverage change in this document.
3. **Who owns the AWS Rekognition account?** If costs need to be audited, we need access to billing metrics broken down by collection.
4. **What is the SLA we want to commit to photographers?** "Face search ready within 1 hour of publish" is realistic with current infra; "within 5 minutes" would require Level 3 changes.

---

*End of audit.*
