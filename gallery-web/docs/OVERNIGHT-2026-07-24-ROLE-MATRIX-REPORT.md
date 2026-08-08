# Role Separation + Fresh Preview — Verification Report (2026-07-24)

Role model locked in: owner = Pixflow business operator (clients, galleries, assignment, Pixieset import, preview-as-client; NO tender, NO Social). Client organization = authenticated portal (only assigned published galleries, search its own content, TenderBuilder + tender collections, Social locked). Nothing merged/pushed/PR'd/Staging/Production.

## 1. Fresh Preview from exact HEAD
- **Preview URL:** https://pixflow-client-portal-v2-qa-7aeayr4az.vercel.app
- **Deployed commit:** `0e13b3267bf62c252952c2c83665112edb37ee57` (current HEAD of `feat/client-portal-v2-overnight`).
- **Deployment id:** `dpl_51kEK6iuU55FS5EqopYhQtsvZmej` — state READY.
- **Vercel QA project:** `pixflow-client-portal-v2-qa-web` = `prj_siCYAfHfeJ56gX4d8w527MUMqDvd` (dedicated QA; NOT the shared Production project `gallery-web` = `prj_ZItyMnCwuMVQgPYEX7qcKSY4XwMH`).
- **Target:** preview only (Vercel `target: null`). No production promotion. The only `target:production` deployment on the QA project is from a PRIOR session (commit `4cdd0ec`), on the QA project's own isolated env — not this session, not the shared prod.
- **QA Supabase only:** verified at runtime — a session token keyed to the QA project ref was accepted and loaded QA data; env vars are all Preview-scoped to the QA project (`VITE_SUPABASE_URL`/`SUPABASE_URL` → QA; `SUPABASE_SERVICE_ROLE_KEY` server-only, no `VITE_` service var).
- **Production + Staging untouched:** no deploy to `gallery-web`; Supabase prod `vlyiqfawkrjvqcmkpfvs` and staging `bkccdomovxtuqdxrahnc` never touched.
- **Byte-for-byte HEAD:** deployed from an isolated git worktree checked out at HEAD; `src/`, `api/`, `server/`, `supabase/` have ZERO diff vs HEAD. The only working-tree delta is a `.gitignore` `.env*` entry (excludes local secrets from the upload) — not source.

## 2. Role matrix (on the deployed Preview)

### Owner (photographerA@qa.test / Studio A)
| Check | Result |
|---|---|
| Clients Manager visible | PASS (לקוחות nav → list + create/invite/assign) |
| Gallery upload + assignment visible | PASS (New Gallery + "שייך ללקוח" field; Clients → שיוך גלריות) |
| Pixieset Import visible | PASS (ייבוא nav) |
| Preview as Client visible | PASS (client detail → public portal link `/{biz}/client/{id}`) |
| Tender Search NOT visible | PASS (no מאגר למכרזים in nav; owner-side tender fully removed) |
| Direct Tender URL denied/redirected | PASS (no tender route or in-page view exists on the owner side; the `activeView` union has no `'tender'`, no render branch, no URL — unreachable by any means) |
| Social locked | PASS (owner has NO Social entry at all) |

### Client organization (memberc1@qa.test / Client C1, entitled)
| Check | Result |
|---|---|
| Only assigned published galleries visible | PASS (sees only "C1 Event"; DB-verified: 1 live, 0 foreign) |
| Draft + unassigned hidden | PASS (DB-verified: 0 drafts visible even by direct query) |
| Search covers only this client's content | PASS (TenderBuilder searches the RLS-scoped feed; a tampered query for another client returns 0) |
| TenderBuilder visible and works | PASS (מכרזים nav → full tender surface; C1 Event shows real "אירוע חברה" + "תל אביב") |
| Tender collections work | PASS (cross-gallery photo selection persists per session, exports to ZIP/PDF) |
| Direct owner dashboard URL denied | **PARTIAL — see finding below** |
| Social remains locked (Coming Soon) | PASS (סטודיו לרשתות · בקרוב → lock panel, never the studio) |

**FINDING (role separation, not a data leak):** a client user opening `/dashboard` is NOT access-denied — the app renders an EMPTY owner workspace (0 galleries, 0 tokens) for that user's own account. It does **not** expose the real owner's (Production C) data (RLS blocks it), and it does **not** persist anything (no business row is created on load — QA still has exactly 2 businesses). This is pre-existing behavior: the app treats every authenticated user as a potential owner (business auto-created on first gallery). Hard role separation (redirecting client-member users away from `/dashboard`) is a product decision I did not make unilaterally, because a user could legitimately be both an owner and a client. Recommendation below.

## 3. Audit: deletion of api/gallery-metadata.ts (item 3)
**Where each field is stored:**
- **event type** → `galleries.delivery_settings.eventType` (JSONB), mirrored to promoted column `event_type` (migration 064).
- **location** → `galleries.delivery_settings.eventLocation`, mirrored to `event_location`.
- **year/date** → `galleries.delivery_settings.eventDate`, mirrored to `event_date`.
- **event size** → `galleries.image_count` (photo count; TenderBuilder bins it 0-30 / 30-100 / 100+).
- **industry, venue type, time of day, event_size_bucket, keywords** → dedicated `galleries` columns from migration 097.

**How created/updated:** `eventType`, `eventLocation`, `eventDate` are set by the OWNER through the normal gallery create + settings flow (they are in `TEXT_INPUT_KEYS` and validated by `deliverySettingsSchema`, persisted to `delivery_settings`). `image_count` is maintained by the upload pipeline. The 097 columns were written ONLY by the now-deleted `api/gallery-metadata.ts` (via the owner-side MetadataEnrichment UI).

**How TenderBuilder searches them:** purely CLIENT-SIDE filtering over its `galleries`/`allImages` props. It reads `delivery_settings.eventType` (event-type chips), `image_count` (size), and free-text over `name`/`client_name`/`eventLocation`/`eventDate`. TenderBuilder issues NO database queries itself.

**Did deleting gallery-metadata.ts remove the only editing path?** It removed the editor for the **097 enrichment fields** (industry / venue_type / time_of_day / event_size_bucket / event_keywords) — but **TenderBuilder does not read any of those**. It did NOT affect eventType / eventLocation / eventDate, which are edited through the normal owner gallery flow.

**Do TenderBuilder filters operate on real persisted metadata?** YES. `delivery_settings.eventType/eventLocation/eventDate` and `image_count` are persisted columns on `galleries`, not temporary frontend state. Proof: I set C1 Event's `delivery_settings` (eventType=corporate-event, eventLocation=תל אביב, eventDate=2026-07-15) via the persisted path, and TenderBuilder immediately rendered the "אירוע חברה" badge + "תל אביב" location and made the gallery filterable.

**Conclusion:** `api/gallery-metadata.ts` was NOT required for TenderBuilder. It served only the removed owner-side tender enrichment. No restore is needed; TenderBuilder has real persisted data behind every filter. (If you later want the 097 enrichment fields usable, they'd need a NEW owner-scoped classification UI — but nothing depends on them today.)

## 4. TenderBuilder security (item 4) — verified live on QA
- **Uses only assigned galleries:** ClientDashboard loads the feed with `.eq('client_id', clientId).eq('status','live')` under RLS policy `galleries_member_select` (migration 095: `status='live' AND client_id IN active-memberships-of-auth.uid()`). TenderBuilder receives this as props.
- **Never queries all owner galleries:** TenderBuilder does no DB access; it only filters its client-scoped props.
- **No cross-client exposure:** as memberC1, a query tampered to client A1 returned **0**; foreign images returned **0**.
- **Drafts hidden:** direct draft query returned **0** (status='live' filter + RLS).
- **Reacts to assign/reassign/unassign/disable/revoke:** the feed is RLS-scoped and reloaded per portal open; the earlier lifecycle test proved assign→visible, reassign→immediate loss, unassign→gone, and disable/revoke→membership inactive→empty.
- **URL/ID tampering safe:** the slug resolver (`resolve_client_portal`, migration 102) is membership-gated; the galleries/images reads are RLS-gated. A tampered clientId or galleryId yields nothing.
- **ZIP/PDF scope:** built only from `allImages` (the client-scoped feed) via per-image signed URLs — only content the client is authorized to access.

## 5. Migration consistency (item 5)
No migrations deleted or rewritten. Confirmed still applied to QA:
- **097** — the 5 event-metadata columns exist; its `client_access_audit` action CHECK still holds `gallery_metadata_updated` AND the `import_*` actions. **Must stay** (the event_* columns are read by search; the import_* audit actions are used by the Import Center).
- **100** — `tender_collections` + `tender_collection_items` tables exist (0 rows). **Retained but currently unused:** they were built for the removed owner-side tender; the client TenderBuilder uses in-session selection, not this table. Intentionally retained for migration consistency; not removed.
- **101** — tender-table grants intact (authenticated CRUD, anon 0). Retained.
No cleanup migration created (not necessary).

## 6. Test + build results (item 6)
- `tsc --noEmit -p .` (src): clean. `tsc` api/server (nodenext strict): clean. `npm run build`: success (only the pre-existing chunk-size warning).
- Offline suites (`npx tsx`), **15 suites / 364 assertions / 0 failures**: cpv2 entitlements 13 / membership 9 / clientadmin 18 / adversarial 5; regression ownerAuth 13 / cover-image 16 / dedupe-upload 9 / upload-count 15; social-lockdown 30, tour 29, assignment 34, search 65, import-center 77, portal-route 23, api-error-hygiene 8. (tender.test.ts was removed with the owner-side tender component.)
- Live DB adversarial on QA: portal-resolver enumeration blocked; assignment lifecycle (draft hidden / published visible / cross-business isolated / reassign immediate / unassign clears); TenderBuilder cross-client feed isolation (tampered=0, foreign images=0, drafts=0).
- Browser QA on the DEPLOYED Preview: owner + client role matrices above; no console errors.

## 7. Deliverables
- **New Preview URL:** https://pixflow-client-portal-v2-qa-7aeayr4az.vercel.app (open logged into Vercel — Deployment Protection is on).
- **Deployed commit:** `0e13b3267bf62c252952c2c83665112edb37ee57`.
- **QA owner login:** owner auth is Google-only (no synthetic Google account). To review the synthetic Studio A owner, tell me and I'll inject the `photographerA@qa.test` session for you (no secrets in chat), or sign in with your own Google account for a fresh empty owner workspace. (This owner-login gap is unchanged from before.)
- **QA client login:** open `/client-login`, sign in with **`memberc1@qa.test`** / **`QaPassw0rd!`** (synthetic QA-only account; entitled → has Tenders). Non-entitled client for contrast: `membera1@qa.test` / same password.
- **Screenshots captured:** owner dashboard (nav: Overview/Galleries/Search/Brand Kit/Clients/Import — no Tender, no Social); client TenderBuilder (C1 Event with real "אירוע חברה" + "תל אביב"); client Social lock panel; client portal nav (מכרזים unlocked, Social locked).
- **Social locked for both roles:** owner has no Social entry; client shows "סטודיו לרשתות · בקרוב" → lock panel. Confirmed.

### Your 10-minute checklist
1. Open the Preview URL (logged into Vercel).
2. Client: `/client-login` → `memberc1@qa.test` / `QaPassw0rd!`. Confirm you see only "C1 Event".
3. Click **מכרזים** → confirm TenderBuilder opens and C1 Event shows "אירוע חברה · תל אביב" (real metadata). Try an event-type filter.
4. Click **סטודיו לרשתות · בקרוב** → confirm the "Coming soon" lock panel (not a studio).
5. In the same client session, open `/dashboard` → confirm you get an EMPTY workspace, NOT Production C's galleries (the role-separation finding; note it's not a data leak).
6. Owner: tell me to inject the owner session (or use your Google account) → confirm the nav has Clients + Import but **no Tender and no Social**.

### Recommended product decision (the one open item)
Decide whether to hard-separate roles at `/dashboard`: e.g., if the signed-in user has active `client_memberships` and owns no business with content, redirect them to their client portal instead of the empty owner shell. I can implement this on your go — it's a small, safe guard — but it touches the owner-entry flow, so I'm leaving it for your call (a user could be both an owner and a client).

Nothing merged, pushed, PR'd, or deployed to Staging/Production. QA Supabase + Vercel Preview kept active.
