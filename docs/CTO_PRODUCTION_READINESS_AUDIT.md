# Pixflow / GalleryFlow — Production Readiness Audit

**Date:** 2026-04-28
**Author:** Engineering audit (read-only, no code modified)
**Scope:** Full product — auth, sessions, desktop app, web viewer, permissions, upload pipeline, face recognition
**Verdict (TL;DR):** **NOT production-ready for paying clients without targeted intervention.** The system works for a single user on a single machine in the happy path. It fails for cross-machine usage, has at least three classes of silent partial failure, and has zero observability. None of these are unfixable, but shipping new clients onto the current state is a reputation risk.

---

## Executive Summary

Three foundational issues, ranked by severity:

1. **Cross-machine login is broken by design.** A custom storage adapter (`bootAwareStorage`) wipes the auth session whenever the OS boot time differs by more than 10 seconds. Across two physical machines, the boot times will *always* differ. Result: a friend signing in from another computer is logged out on every app restart. Confirmed root cause for the user-reported issue.
2. **The desktop app is single-machine by architecture, not by accident.** Drafts, image-to-disk-path mappings, and business settings live only in `preferences.json` on the user's Mac. They are never synced to the cloud. Even if the auth session worked across machines, a photographer signing in from a second Mac would see an empty workspace and would have to manually relocate every source folder. Photographers routinely work between studio and home — this breaks the basic mental model.
3. **The publish pipeline can leave galleries in silently-broken states.** A gallery can be `status='live'` with fewer images than its `image_count` claims, with originals never finished uploading (downloads return 404), with face indexing stuck mid-flight, or with the `Rekognition` collection orphaned. Partial failures are not surfaced to the photographer and are invisible to guests until they try to use the affected feature.

Three additional issues that *would* be production blockers in any mature SaaS:

4. **Password-protected galleries can be unlocked via DevTools** (`sessionStorage.setItem('gf_unlocked_{id}', '1')`). The password is enforced only by the UI, not by RLS.
5. **No observability.** No log aggregation, no error tracking, no alerting, no per-gallery health view. Every diagnosis in this audit was done by reading raw rows from the database.
6. **Public selfie endpoint accepts a 5 MB upload before rate-limiting it.** Anonymous abuse vector — saturating egress is trivial.

What works well:
- The cloud RLS model is sound. The anon key is correctly scoped.
- TUS resumable uploads for large files are properly wired.
- Once a gallery is `status='live'` with all originals uploaded, the cloud is self-contained and serves clients reliably.
- The face-recognition fixes shipped on 2026-04-28 (race-safe stamping, skip unfetchable images, recompute counters, allow search during indexing) closed the open issues we found in that part of the system.

The honest answer to "is this safe for real clients?" is: **safe enough for one technical user shipping one event at a time, watched by a developer.** Not safe for handing to additional photographers, not safe for absent photographers, not safe for galleries with private content.

---

## System Map

```
┌─────────────────────────────────────────────────────────────────────┐
│ PHOTOGRAPHER'S MAC                                                  │
│                                                                      │
│  Electron main (src/main/index.ts)                                  │
│   ├─ preferences.json  ◄── DRAFTS, IMAGE PATHS, BUSINESS SETTINGS  │
│   │   (LOCAL ONLY — never synced to cloud)                          │
│   ├─ IPC handlers (file ops, OAuth, compression)                    │
│   └─ TUS upload (originals > 5MB)                                   │
│                                                                      │
│  Electron renderer (src/renderer/)                                  │
│   ├─ supabase.ts                                                    │
│   │   └─ bootAwareStorage  ◄── WIPES SESSION ON BOOT-TIME MISMATCH │
│   ├─ cloudUpload.ts  (publishGallery, updateGalleryImages)          │
│   ├─ store/publish.ts                                               │
│   ├─ store/session.ts                                               │
│   └─ components/auth/* + OnboardingFlow                             │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ CLOUD                                                                │
│                                                                      │
│  Supabase Auth                                                       │
│   ├─ email/password (wired)                                          │
│   └─ Google OAuth (wired)                                            │
│                                                                      │
│  Supabase Postgres                                                   │
│   ├─ businesses (1:1 with auth.users — no team support)             │
│   ├─ galleries / gallery_sections / images                          │
│   ├─ image_faces (face metadata only; embeddings live in AWS)       │
│   ├─ rekognition_search_log (rate limit)                            │
│   ├─ subscriptions / monthly_usage / plans                          │
│   └─ RLS policies via current_business_id() + status='live' anon    │
│                                                                      │
│  Supabase Storage                                                    │
│   └─ gallery-images bucket  (originals + previews + thumbs)         │
│                                                                      │
│  Supabase Edge Function: rekognition                                 │
│   ├─ index_gallery (background, EdgeRuntime.waitUntil)              │
│   ├─ search (multipart selfie, anon, IP rate-limited)               │
│   └─ delete_collection / delete_image_faces                         │
│                                                                      │
│  AWS Rekognition (eu-central-1)                                     │
│   └─ One collection per gallery (collection_id = gallery uuid)      │
└─────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ GUEST'S BROWSER                                                      │
│                                                                      │
│  gallery-web (Vite SPA, deployed on Vercel)                         │
│   ├─ App.tsx (gallery viewer, ~2050 lines)                           │
│   ├─ PasswordGate (sessionStorage unlock — bypassable via DevTools) │
│   ├─ Viewer + SwipeGestures                                          │
│   └─ FaceSearchExperience (camera capture or file upload)           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Auth & Session Findings

### What works
- **Email/password sign-in is wired.** `signInWithEmail()` in `src/renderer/src/lib/auth.ts:56` calls `supabase.auth.signInWithPassword()`. Implements proper auth.
- **Google OAuth is wired** (auth.ts:86–150). Uses Electron IPC bridge for the redirect flow.
- **Auto-refresh enabled** (`autoRefreshToken: true` at supabase.ts:78). Tokens rotate inside an active session.
- **`onAuthStateChange` listener** in `store/session.ts:70-121` fetches the business row on `SIGNED_IN` / `INITIAL_SESSION` with 3-attempt retry (0/1500/3000 ms).
- **RLS is correctly designed.** `current_business_id()` (migration 006:25-30) maps `auth.uid()` to a business row. All owner policies depend on it; all anon policies are gated by `status='live'`.
- **Web viewer auth is anon-only** — no session bleed-through risk.

### What's broken — the cross-machine login failure

**Root cause:** `bootAwareStorage` in `src/renderer/src/lib/supabase.ts:36-72`. This is a custom localStorage adapter that:
1. Reads the OS boot time via Electron IPC and stores it alongside every session.
2. On every `getItem()`, compares the stored boot time to the current boot time.
3. If they differ by more than 10 seconds (`BOOT_TIME_TOLERANCE_MS`), **deletes the session**.

The intent appears to be "force re-auth on system reboot for security" (per a comment in migration 012, the team plans to revisit). The actual effect is broader: every machine has a different boot time, so the very first time a friend launches the app on their Mac after sign-in, the next launch deletes the session.

**Reproduction sequence:**
1. Friend signs in on Mac #2 — session is stored with Mac #2's boot time.
2. Within the same app launch, everything works.
3. Friend quits the app.
4. Friend re-launches the app.
5. Adapter reads stored boot time (Mac #2's last boot), compares to current OS boot time. Works *until* Mac #2 reboots.
6. Mac #2 reboots → boot time changes by >10s → session wiped → login screen.

If the friend opens the app right after sign-in without rebooting, it appears to work, which is exactly the kind of intermittent behavior that's hard to diagnose.

**Adjacent issues:**
- Sessions are stored in localStorage only. Not in macOS Keychain. Easy to extract from disk.
- Logout clears localStorage correctly (auth.ts:152-153) — no leakage on signout.
- No multi-user / team support — `businesses` is one row per `auth.uid()`. There is no `business_members` table. A photographer cannot add an assistant.

---

## 2. Desktop App / Local State Findings

### What's stored locally only (`~/Library/Application Support/Pixflow/preferences.json`)

- `projects` — full draft data: name, sections, image lists, vendor info.
- `imageRegistry` — map of `imageId → { path: "/absolute/path/on/this/mac.jpg" }`.
- `businessSettings` — studio name, website, **logo path** (sometimes a local path, sometimes a cloud URL — inconsistent).
- Rename history, undo stacks, UI state.

**This file is never synced to the cloud.** No background sync, no on-login fetch, no migration.

### Implications

- **Switching Macs = losing your entire workflow.** A photographer signing in on a second Mac sees an empty project list. They cannot resume a draft they were working on.
- **The "249 photos missing" banner** is the visible symptom. When `imageRegistry` paths point to files that no longer exist on the current machine — because the machine changed, the iCloud Drive folder moved, or the photographer renamed a folder in Finder — the banner offers "Locate folder" to relink. This works one-machine-at-a-time; switching machines means relinking again.
- **No schema versioning on `preferences.json`.** Adding a field to `ProjectData` will silently corrupt old drafts. Renaming a key drops drafts entirely. No migration framework.
- **No per-device locking.** If a user is signed in on two machines and edits the same draft, last write wins, with no conflict detection.

### What's correctly cloud-resident

- Once a gallery is `status='live'`, the cloud has everything: previews, thumbnails, originals (when finished uploading), section definitions, settings, password hash, face index data.
- A published gallery's public URL works from any device anywhere. No local files needed for viewing.

### The hybrid trap

- **Logo on stories**: stored as `logoUrl` (cloud) AND `logoPath` (local). Old galleries fall back to local; new ones use cloud. UI mixes the two.
- **Cover image**: same — sometimes a local path, sometimes a cloud URL. Inconsistent surface area.
- **Delivery settings**: mostly cloud, but with local "last-used" fallbacks. Confusing.

---

## 3. Web / Gallery Findings

### What's solid

- **Anon key + RLS scoping** on `status='live'` is the right model. No data leak risk for anon users on non-live galleries.
- **Public storage policies** correctly gate `gallery-images/{gallery_id}/...` reads on `gallery.status='live'`.
- **Face search private mode** is robust: when `facePrivacyMode='private'`, the viewer fetches zero images on initial load, only hydrating face-matched rows server-side via service-role. Unmatched images cannot leak.
- **Mobile compatibility** is adequate: viewport meta, touch gestures, safe-area insets, getUserMedia fallback to file input.
- **Bulk download** — JSZip on desktop, native share sheet on mobile.

### What's broken or fragile

- **Password gate bypass.** `PasswordGate.tsx` stores the unlock state as `sessionStorage.setItem('gf_unlocked_{id}', '1')`. The viewer checks this string in `App.tsx:977-979`. A guest who knows the URL of a private gallery can paste one line into DevTools and unlock it without ever knowing the password. The RLS policies on `images` allow any anon user to SELECT for a `status='live'` gallery — RLS does not enforce the password.
- **No staleness handling.** No service worker. No React Query / SWR. Gallery data loads once on mount via `useEffect`. If the photographer changes settings (enables stories, changes password, toggles downloads), guests already viewing see the old version until they manually reload.
- **Failure modes are silent.** `face_index_status='failed'` is hidden from the viewer. The selfie endpoint returns 404 for unsupported states with a generic message. No error boundary wraps the main grid; a fetch failure shows a centered text string and nothing else.
- **No usage analytics** beyond the rate-limit log.

---

## 4. Upload / Publish Findings

### Gallery state machine

`galleries.status`: `draft` → `publishing` → `live` | `failed`

Within publish, a parallel `publish_status` column moves through `preparing_assets` → `uploading_previews` → `preview_live` → `uploading_originals` → `fully_live` | `partially_failed` | `failed`.

### The "atomic point" of going live

`cloudUpload.ts:532-536` — a single `UPDATE galleries SET status='live'`. If this update fails for any reason (network blip, RLS denial, DB timeout), the gallery is permanently stuck in `status='publishing'`. There is no retry. Two such drafts exist in production right now (the duplicate "Alma Academy" rows from 2026-04-27).

### Live with broken state — the Lisbon problem

A gallery becomes `status='live'` after **previews** complete, while **originals are still uploading in the background**. This means:

1. **`image_count` can be wrong.** Set at gallery creation as `imagePaths.length` (line 206), never reconciled. If some `images` row inserts fail silently, `image_count > actual rows`. *(Recompute RPC shipped 2026-04-28 fixes counter overshoot during face indexing, but does not fix `image_count` at the gallery level except during a re-index trigger.)*
2. **Originals can fail without blocking the live transition.** The gallery is `live` immediately. If originals never complete, guests clicking "Download" get 404. There is no banner, no warning, no automatic retry. The photographer has to spot the per-item failure flag in the publish store.
3. **Partial preview failure has a soft floor.** If <80% of previews fail, the gallery proceeds to live with the successful ones. The photographer's expected-1198 vs. actual-1068 image count drift originated here.

### Stuck states observed in production today

| State | Cause | Recovery |
|---|---|---|
| `status='publishing'` | `live`-flip update failed | None automatic. Must be SQL-fixed manually. |
| `status='live'` + `image_count > actual` | Some image inserts failed silently | None automatic. |
| `status='live'` + originals never finished | Background upload failed, app closed | Photographer manually clicks "Retry originals". |
| `face_index_status='indexing'` for hours | Edge function exceeded EdgeRuntime time, no fresh claim | Lock auto-stales after 10 min, but only if user clicks Re-run. |
| Rekognition collection orphaned in AWS | `delete_collection` called but `image_faces` rows not cleaned, or vice versa | Manual cleanup via AWS console. |

### What the photographer doesn't see

- Per-image upload errors are stored on the row (`face_index_error`, `original_failed_reason`) but no UI surfaces them.
- The publish completion screen shows "Gallery Published!" even when originals are still uploading or face indexing is still running.
- No notification when originals finally complete — or when they fail to.

### Delete gallery is not transactional

`deleteGalleryFromCloud()` at `cloudUpload.ts:732-776`:
1. Delete Rekognition collection (best-effort).
2. Query images.
3. Delete storage files.
4. Delete stories + stories storage.
5. Delete DB rows (cascade).

If step 3 fails, step 5 still runs → DB is empty but storage has orphans. If step 5 fails, DB has rows but storage is gone → broken gallery view. No transaction wraps the steps.

### `face_indexed_count` is not decremented on photo delete

`updateGalleryImages()` updates `image_count` after deletes (line 845-846) but does not adjust `face_indexed_count`. After enough deletes, the counter exceeds the actual indexed-images count.

---

## 5. Face Recognition Findings

(Detailed audit in `docs/CTO_AUDIT_FACE_RECOGNITION.md`. Summary here.)

### Fixed on 2026-04-28
- Race-safe per-image stamping (no more counter overshoot during concurrent worker claims).
- Skip images whose web preview is missing instead of burning retries.
- Don't mark the whole gallery `failed` for a few bad images.
- Allow selfie search during `indexing` once at least one image is in (the viewer was advertising this; the server was rejecting it).
- Recompute `face_indexed_count` and `image_count` from source of truth at the start of every index run.

### Still open
- **Lock staleness (10 min) is shorter than realistic worker lifetimes** for very large galleries. A new claim can run while an old worker is still alive. Idempotent stamping prevents the count race, but doesn't prevent paying AWS twice for the same image.
- **No worker progress checkpoint.** If a worker dies mid-flight, the system has no "we got to image N" signal — only the per-image stamps.
- **Threshold of 70% with `MaxFaces=100`** is recall-biased. False positives on event-floor crowd photos are real. No per-event tuning.
- **No re-index pathway** beyond delete-the-whole-collection. Adjusting threshold means re-indexing.
- **No audit log of selfie searches.** The system can't answer "did this guest find their photos?"

---

## 6. Critical Blockers — Production Readiness

If we accept new clients tomorrow, here are the blocking issues, ranked:

| # | Blocker | Why it blocks | How to know it bit you |
|---|---|---|---|
| 1 | `bootAwareStorage` deletes session across machines | Photographer cannot work from two devices, friend cannot test, no team support possible | "I can't log in" — but only after a reboot. |
| 2 | Local-only drafts (`preferences.json` not synced) | Even with auth fixed, second-machine = empty workspace + broken paths | Photographer says "where are my drafts?" |
| 3 | Gallery can be `live` with wrong `image_count` and missing originals | Guest hits a 404 on download, no signal to anyone | Guest emails complaining their photo isn't downloadable. |
| 4 | Password gate bypassable via DevTools | Private galleries are not actually private | Hard to detect without a security review. |
| 5 | No observability | Every issue must be diagnosed by reading DB rows directly | Issues are always discovered by users, not us. |
| 6 | `get_my_usage` returns 404 in production | Quota / plan enforcement broken silently | Photographer overshoots their plan with no warning. |
| 7 | Public selfie endpoint accepts 5 MB before rate-limiting | DOS vector via egress saturation | Surprise AWS bill. |
| 8 | Stuck `publishing` rows have no recovery | Photographer thinks they published, gallery is invisible | "My gallery isn't showing up." |

---

## 7. Risk Map

### Critical — blocks real usage
- Cross-machine session wipe (`bootAwareStorage`)
- Local-only draft storage (`preferences.json`)
- Live gallery with missing originals / wrong image_count
- Password gate bypass

### High — can break client delivery
- Stuck `publishing` rows (no auto-recovery)
- Orphaned Rekognition collections after delete
- `get_my_usage` 404 — silent quota failure
- Lock staleness causing duplicate AWS calls (cost, not correctness)
- No retry on `status='live'` transition

### Medium — hurts UX or reliability
- No staleness invalidation in viewer (settings changes invisible)
- No per-image error surface in photographer UI
- `face_indexed_count` not decremented on delete
- No service worker / no offline support in viewer
- `face_index_attempts` counter often reads 0 even after demonstrable failures (silent DB write loss)
- No structured logging on edge function

### Low — cleanup
- Schema versioning on `preferences.json`
- Storage orphans from failed uploads
- Hybrid logo path / cloud URL inconsistency
- One-to-one user-business model (no team support)

---

## 8. Stabilization Plan

### Phase 0 — Freeze (today)

**Do not change:**
- `bootAwareStorage` semantics until we have a replacement plan ready (changing it is a security regression vs. its stated intent; we want a *correct* solution, not a removal).
- `try_claim_face_indexing` RPC (load-bearing for the worker).
- `images.face_indexed_at` trigger (`check_gallery_face_index_complete`) — load-bearing for the status machine.
- The TUS upload flow for originals (resumability is delicate).
- The public URL format `gallery-web-theta.vercel.app/gallery/{id}` (already shared with clients).
- The `delivery_settings` JSONB shape (read by photographer UI and viewer; loose coupling = changing breaks both).

**Do not deploy** during a known active event window.

**One-time SQL cleanup** (with explicit approval per row):
- Unstick the two Alma Academy `status='publishing'` rows.
- Verify `image_count` for all live galleries; recompute from `COUNT(*)`.
- Audit `face_index_status='indexing'` rows older than 30 minutes.

### Phase 1 — Observe (this week, no risk)

- **Add Sentry / log drain** for the Electron renderer process. Catches the silent failures we've been seeing in the console.
- **Add structured logging** to the `rekognition` edge function: every log line tagged with `gallery_id` and a request id.
- **Add a `face_index_runs` audit table.** Insert at start of `actionIndexGallery`, update at end with `exit_reason` (`done` / `edge_timeout` / `aws_error` / `crashed`). Read-only side effect; gives us our first real "did it finish?" signal.
- **Add a per-gallery health-check RPC** returning: `image_count_actual`, `face_indexed_actual`, `pending_count`, `last_indexed_at`, `stuck_minutes`.
- **Add SQL views** for: galleries stuck in `publishing` >5 min, galleries stuck in `indexing` >30 min, per-image `face_index_attempts > 0` in last 24 h.
- **Internal diagnostic page** in the photographer UI (hidden URL) showing the above. Read-only, internal-only.
- **Investigate `get_my_usage` 404** — likely a one-line migration fix. Verify in a staging gallery before deploy.

### Phase 2 — Stabilize (next 2 weeks, behind flags)

- **Idempotent retry on `status='live'` transition.** 3 attempts, exponential backoff. Behind a feature flag.
- **Background reconciliation job.** Every 15 min, re-claim `indexing` galleries stuck >30 min, retry `live`-flip on `publishing` galleries stuck >5 min, alert on irrecoverable cases.
- **Server-side password enforcement** on private galleries. Replace the sessionStorage unlock with a short-lived signed token returned by the `verify_gallery_password` RPC. RLS reads the token claim and gates image SELECT on it. Closes the DevTools bypass.
- **Pre-flight rate-limit check** on the selfie endpoint. Reject before accepting the 5 MB upload.
- **Per-image error surface** in the photographer's section view. Already-collected data, just unhidden.
- **Settings re-fetch on viewer mount.** If the gallery was already loaded and the user navigates back, re-fetch `delivery_settings` to pick up photographer changes.
- **Originals completion signal.** Only show the "Gallery Published" success screen after `originals_uploaded_count == image_count`.
- **Cloud sync for the project list** (read-only first pass). On login, fetch the user's published galleries from Supabase and surface them in the "My Galleries" view, even if the local `preferences.json` is empty. Solves the second-machine empty-workspace symptom.
- **Schema versioning** for `preferences.json`: add `prefs_version: 2` and a migration framework.

### Phase 3 — Refactor (only after Phases 1-2 give us data)

- **Replace `bootAwareStorage`** with a correct cross-machine auth model. Options:
  - Default Supabase localStorage adapter (simplest; trade boot-time invalidation for cross-machine).
  - macOS Keychain via `keytar` for persistence + keep auto-refresh (proper).
  - Custom JWT claim with per-machine boot time, only invalidate on the *same* machine if boot time changes (preserves intent without breaking cross-machine).
- **Replace `image_count` with a derived view.** Or: enforce that every code path that mutates `images` also recomputes the gallery counter via a trigger.
- **Move face indexing off Edge Functions** onto a long-running worker (Fly.io machine, GCP Cloud Run job). Removes the EdgeRuntime time cliff and the lock-staleness race entirely.
- **Multi-user / team support.** Introduce `business_members` table, allow assistants. Requires RLS rewrite.
- **Replace AWS Rekognition with a self-hosted vector store + embedding model** — only if cost or accuracy data justifies. Multi-week project.

---

## 9. Required Test Checklist (before next paying client)

These are the minimum tests that must pass on a clean environment before onboarding another photographer:

### Auth & Session
- [ ] Sign up new account → onboarding flow completes → see empty workspace.
- [ ] Sign in / sign out / sign in again → session restored, workspace intact.
- [ ] **Sign in on a fresh second machine** → see published galleries in cloud-synced list, no empty-workspace surprise.
- [ ] Restart Mac, re-launch app → session still valid (after the `bootAwareStorage` fix).
- [ ] Wait until token expires (1 hour) → auto-refresh, no logout.
- [ ] Logout → all local session data cleared, login screen appears.

### Upload & Publish
- [ ] Upload 10 images, publish, verify gallery `status='live'`, all images visible in viewer.
- [ ] Upload 100 images, verify originals complete after publish, no 404 on any download.
- [ ] Upload 500 images with intentional network drop mid-upload → resume successfully.
- [ ] Cancel publish mid-flight → gallery cleaned up, no orphaned rows.
- [ ] Update a live gallery (add 5, remove 5, reorder) → `image_count` matches reality, face indexing reruns on the new ones.
- [ ] Force a partial preview failure → photographer sees explicit failure, gallery does not silently go live with missing photos.

### Web Gallery
- [ ] Public gallery URL loads on desktop Chrome, Safari, Firefox.
- [ ] Public gallery URL loads on iOS Safari, Android Chrome.
- [ ] Private gallery requires correct password — incorrect password rejected.
- [ ] **Private gallery cannot be unlocked via DevTools sessionStorage manipulation** (after Phase 2 server-side enforcement).
- [ ] Selfie search works on a fully-indexed gallery.
- [ ] Selfie search works on a partially-indexed gallery (with `face_indexed_count > 0`).
- [ ] Selfie search returns rate-limit error after 10 searches in an hour.
- [ ] Single download works on desktop and mobile.
- [ ] Bulk download works (ZIP on desktop, share sheet on mobile).
- [ ] Photographer changes settings → guest sees update on refresh.

### Face Recognition
- [ ] Indexing 100 images completes within reasonable time, status flips to `done`.
- [ ] Indexing a gallery with 4 broken-preview images skips them and reaches `done`.
- [ ] Selfie matching returns reasonable results (no false positives at threshold 70% — need real-world sample).
- [ ] Re-running a failed gallery successfully recovers.

### Multi-machine
- [ ] Sign in on Mac A, publish a gallery, sign out.
- [ ] Sign in on Mac B with same account, see the published gallery in the list.
- [ ] Edit gallery settings on Mac B, see changes reflected.

### Failure Recovery
- [ ] Pull network mid-publish → on reconnect, queue resumes.
- [ ] Quit app mid-publish → on relaunch, resume prompt appears, accepts resume.
- [ ] Delete a gallery → DB rows + storage + Rekognition collection all cleaned up. No orphans.

---

## 10. Open Questions for the CTO

1. **What is our acceptable risk threshold for the password-bypass issue?** Closing it requires server-side enforcement (signed token in JWT) — moderate effort. Do we want this before the next paying client?
2. **What's the budget for observability?** Sentry / a log drain is the highest-leverage item in this audit. Order of magnitude: $0–50/mo for the volume we're at.
3. **How important is multi-machine workflow?** Phase 2 includes a cloud-synced project list for read-only first pass. Full sync (drafts editable on multiple machines with conflict resolution) is a Phase 3 commitment.
4. **What's the tolerance for false positives in face search?** The 70% threshold is recall-biased. If guests are complaining about wrong photos, we should run shadow-mode threshold tuning.
5. **Who owns the AWS Rekognition account?** Need access to billing metrics broken down by collection to size the duplicate-call cost.
6. **What SLA do we want to commit to photographers?** "Face search ready within 1 hour of publish" is realistic with current infra. "Within 5 minutes" requires Phase 3 worker move.
7. **What's the plan for support escalation?** Today, every user-reported issue requires a developer to read DB rows. We need a user-facing diagnostic surface or an internal admin tool.
8. **Are we ok with the one-user-per-business model?** Photographers with assistants will hit this wall.

---

## 11. Recent Production Changes (2026-04-28)

For full context, three changes were deployed during the diagnostic phase that produced this audit:

| Change | File | Reason |
|---|---|---|
| Race-safe stamping + skip unfetchable images + don't fail-whole-gallery | `supabase/functions/rekognition/index.ts` | One image without a web preview was failing the entire gallery |
| Recompute RPC for `face_indexed_count` | `supabase/migrations/037_face_index_recompute_rpc.sql` | Counter overshoot (e.g. 1991/1198) from concurrent worker claims |
| Recompute extended to `image_count` | `supabase/migrations/038_recompute_image_count.sql` | Stale `image_count` produced misleading "Index N new photos" labels |

Commit: `cfbbf72` on `main`. Repository: `https://github.com/guysidiphoto-maker/gallery-flow`.

---

## Final Verdict

The product is well-architected at the cloud layer (RLS, anon scoping, edge functions), but undermined by three foundational gaps: cross-machine auth fails by design, drafts are local-only, and partial publish failures are silent. None of these are unfixable, and most can be addressed in 2–3 weeks of focused work without breaking the live client gallery.

The honest answer to "is this safe for paying clients?":

- **Yes, with caveats**: a single technical user (founder), a single Mac, a single event at a time, with a developer watching for issues. This is the current state, and Alma Academy is being served safely.
- **No, without changes**: any second user, any second machine, any unattended workflow, any private gallery with sensitive content. Phase 1+2 of this plan must complete before that scenario.

This document is read-only by intent. Nothing here is to be implemented without an explicit go-ahead. Phase 1 is purely diagnostic and can start today.

---

*End of audit.*
