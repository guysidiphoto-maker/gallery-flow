# Phase 4 — Public Viewer Session Design

**Owner**: Storage / Platform
**Phase**: 4.5 (gated by 4.1 helper, 4.2 thumbs bucket, 4.3 canary)
**Status**: Design (no code yet)
**Last updated**: 2026-05-06

---

## 1. The puzzle, restated

Today `/<biz>/<gallery>` is anonymous. The photographer copies the URL, pastes it into WhatsApp, and the recipient opens it on an iPhone — there is no login, no PIN, no installed app, no cookie from a prior visit. The SPA boots, asks Supabase for `images`, and renders `<img src=publicUrl>` straight against a public Storage bucket. Phase 4 needs originals (and eventually web previews) to be **non-fetchable by URL guessing**, but the viewer still has nothing to authenticate with.

The constraint set is harsh: no human credential, no app credential, can't break OG crawlers, can't add a perceptible round-trip on cold load, can't double-count against the Vercel 12-function cap, can't conflate with the Phase 3 PIN-gated `client_session_tokens` flow (different audience: dashboard owners, not anonymous gallery viewers). The answer is a **short-lived, IP-scoped, gallery-scoped, anonymous-issued** token — a "public-view session" — issued on first asset request, refreshed silently, validated by the signed-URL helper before it mints any Storage URL.

## 2. Token model

| Decision | Choice | Why |
|---|---|---|
| Type | **Opaque 32-byte random** (base64url, ~43 chars) stored DB-side | JWT would let us skip the DB read on every signed-URL call, but we *want* the DB read — it's where rate limiting + revocation live. JWT also forces us to manage a signing key + rotation. Opaque is simpler and equally fast at our scale (single PK lookup, <5ms). |
| Scope | **One gallery per token.** Token row carries `gallery_id`. `signedStorage.ts` rejects any request whose `path` doesn't start with `<gallery_id>/`. | Smaller blast radius. A bot that scrapes one gallery URL can't pivot to another business's gallery with the same token. Cost is one extra round-trip per gallery navigated, which is fine — same-business cross-gallery navigation is rare on the public viewer. |
| Buckets | `gallery-images` (originals), `gallery-images-web` (web previews). **Not** `gallery-images-thumbs-public` — thumbs stay public for OG. | Matches the Storage Architect's master plan: thumbs are share-card-safe by definition; web/originals are gated. |
| TTL | **60 minutes**, refreshed silently at minute 50 | Long enough to scroll a 600-photo wedding once; short enough that a leaked token from a screen recording dies same hour. |
| Storage | **New table `public_gallery_sessions`** | Different security model from `client_session_tokens` (anonymous, no PIN, IP-bound, lower trust). Mixing them complicates RLS + auditing. Cheap to keep separate. |

### DB schema

```sql
create table public.public_gallery_sessions (
  token              text         primary key,             -- 43-char base64url
  gallery_id         uuid         not null references galleries(id) on delete cascade,
  issued_at          timestamptz  not null default now(),
  expires_at         timestamptz  not null,
  last_used_at       timestamptz  not null default now(),
  ip                 inet         not null,
  user_agent         text,
  turnstile_validated boolean     not null default false,
  refresh_count      smallint     not null default 0
);

create index public_gallery_sessions_gallery_idx
  on public.public_gallery_sessions (gallery_id, expires_at desc);
create index public_gallery_sessions_ip_idx
  on public.public_gallery_sessions (ip, issued_at desc);

-- TTL reaper: nightly cron deletes rows where expires_at < now() - 1 day.
```

RLS: deny all by default. Only the service-role-keyed `/api/append-event-posts` Function reads/writes.

## 3. Endpoint design

Reuses `/api/append-event-posts` (already service-role, already has the action dispatcher) — adds **one** new action, no new function file, stays under the 12-cap.

### Request

```http
POST /api/append-event-posts
Content-Type: application/json
Origin: https://pixflow-ai.com

{
  "action": "public_gallery_session",
  "galleryId": "1f3a…uuid",
  "turnstileToken": "<cf-token>"   // optional — only sent after a 429 challenge
}
```

### Validation (in order, fail fast)

1. **Origin allowlist** — the existing `isAllowedOrigin()` guard.
2. **Body shape** — `galleryId` is a UUID; reject `400 invalid_payload` otherwise.
3. **Gallery exists + is live** — `select id, status from galleries where id=$1`. Reject `401 gallery_not_live` for any status outside `('live','published')`. Same shape the SPA already shows the 404 page for.
4. **IP rate limit** — count rows in `public_gallery_sessions` where `ip = $client_ip` and `issued_at > now() - interval '1 hour'`. If >= 30 and `turnstileToken` is empty → `429 turnstile_required`. If >= 100 → `429 hard_limit_exceeded` regardless of Turnstile.
5. **Turnstile validation** — if a token was sent, POST to Cloudflare's `siteverify` with the secret. On failure → `429 turnstile_failed`.
6. **Reuse existing un-expired session** — if there's a row for `(ip, gallery_id)` with `expires_at > now() + interval '5 min'`, return *that* token (idempotent — refreshing the page or opening a second tab on the same network reuses the row). Otherwise mint a new one.

### RPC

A SECURITY DEFINER RPC `issue_public_gallery_session(p_gallery_id uuid, p_ip inet, p_user_agent text, p_turnstile_validated boolean)` that does the gallery-status check + insert in one transaction. Returns `(token text, expires_at timestamptz)`.

### Response

```json
// 200
{ "ok": true, "token": "8f3d…43-chars", "expires_at": "2026-05-06T15:42:11Z" }
// 401 — gallery doesn't exist or isn't live
{ "ok": false, "error": "gallery_not_live" }
// 429 — rate limit, optional retry hint + Turnstile site-key for the SPA to render the challenge
{ "ok": false, "error": "rate_limited", "retry_after_seconds": 60, "turnstile_site_key": "0x4AAA…" }
```

## 4. Anti-abuse: rate limit + Turnstile

### Per-IP rate limit

- **30 sessions per IP per hour** before Turnstile kicks in. A wedding family of 8 sharing the URL on one home WiFi opens the gallery, the parents reload it twice, the kids scroll on three phones — none of them ever hit 30. A scraper polling every gallery_id from 1.0.0.0 hits 30 in seconds.
- **100 per hour** is a hard ceiling — even a verified Turnstile pass can't get more.
- **Counter**: stored in `public_gallery_sessions` itself (`count(*)` over the IP partition). No Redis, no extra dependency. Index `public_gallery_sessions_ip_idx` keeps the lookup at <2ms even at 1M rows.

### Cloudflare Turnstile

- **Free tier** (1M challenges/month). At our scale (~50 photographers, ~300 galleries/month, ~50 viewers/gallery = 15k sessions/month) we're nowhere near the cap. **Pick free.**
- **When to challenge**: only after the first 30/hour from an IP. The vast majority of legit viewers never see it. The SPA renders Cloudflare's invisible widget on the same page that handled the 429 response, retries the session call with the resulting `turnstileToken`. If invisible-mode auto-passes, the user sees a 1s shimmer and nothing else.
- **Site-key vs secret-key**: site-key shipped in the SPA bundle (it's public by design); secret-key only in Vercel env (`CF_TURNSTILE_SECRET`).

### Walkthrough — bot harvesting a wedding gallery

A scraper that found the URL on a public Twitter post requests sessions from 100 datacenter IPs in parallel. Each IP gets a token scoped to **only this gallery**. After 30/hour each IP needs Turnstile, which datacenter IPs reliably fail. Worst case: ~3000 photo fetches before everything throttles — costly, attributable, and revocable (`delete from public_gallery_sessions where ip=…`). Today: one guessed UUID, full bucket, forever.

## 5. Frontend integration in `App.tsx`

Inserted ahead of the existing `useEffect` that fetches gallery meta + images.

```ts
// New file: gallery-web/src/lib/publicSession.ts

const KEY = (gid: string) => `pixflow-public-token-${gid}`
const REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000  // refresh at minute 50

interface CachedSession { token: string; expiresAt: number }

export async function ensurePublicSession(galleryId: string): Promise<string | null> {
  // 1. Cache hit?
  const raw = sessionStorage.getItem(KEY(galleryId))
  if (raw) {
    const cached: CachedSession = JSON.parse(raw)
    if (cached.expiresAt - Date.now() > REFRESH_BEFORE_EXPIRY_MS) return cached.token
  }
  // 2. Issue new
  const r = await fetch('/api/append-event-posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'public_gallery_session', galleryId }),
  })
  const j = await r.json()
  if (!j.ok) {
    if (j.error === 'gallery_not_live') return null   // → 404 page
    if (j.error === 'rate_limited')      return await runTurnstileFlow(galleryId, j.turnstile_site_key)
    return null
  }
  const cached: CachedSession = { token: j.token, expiresAt: new Date(j.expires_at).getTime() }
  sessionStorage.setItem(KEY(galleryId), JSON.stringify(cached))
  return cached.token
}
```

In `App.tsx` (immediately after `setGallery(...)` resolves):

```tsx
useEffect(() => {
  if (!gallery?.id) return
  let cancelled = false
  ;(async () => {
    const tok = await ensurePublicSession(gallery.id)
    if (cancelled) return
    if (tok === null) { setStatus('not_found'); return }
    setPublicToken(tok)
  })()
  // Silent refresh
  const iv = setInterval(() => ensurePublicSession(gallery.id), REFRESH_BEFORE_EXPIRY_MS)
  return () => { cancelled = true; clearInterval(iv) }
}, [gallery?.id])
```

- **Loading state**: keep showing the existing welcome-splash (`<div id="root">…pixflow…</div>`) until both the meta fetch and `ensurePublicSession` resolve. **Do not** add a new spinner — first-paint should be visually identical to today.
- **404 path**: if `ensurePublicSession` returns `null` because the gallery isn't live, route to the existing not-found page.
- **Token storage**: `sessionStorage` (not localStorage). Survives reload of the same tab; dies when the tab closes. Matches the master plan's "ephemeral session" intent.
- **No token, no signed URL**: `signedStorage.ts` reads `sessionStorage.getItem(KEY(galleryId))` and refuses to mint URLs without it. The whole grid degrades to placeholders rather than leaking a public URL.

## 6. Mid-scroll handling

Two failure modes worth designing around:

**A — token lives, image fetch fails.** `signedStorage.ts` caches signed URLs at TTL=55 min, which is intentionally shorter than the 60-min token. So as long as the token is alive, every image URL the helper hands out is alive too. No mid-scroll cliff.

**B — token expires while user is idle, then they scroll.** The `setInterval` from §5 runs every 10 min and re-issues; if the tab is throttled (background) the interval may skip. On scroll, the next image triggers `signedStorage.ts`, which sees an expired/missing token, calls `ensurePublicSession` itself, gets a fresh token, and signs the URL. **The user sees a sub-second pause on image #101, no error.** Implementation note: `signedStorage.ts` must serialise concurrent re-issue calls (single in-flight Promise per galleryId) — otherwise a 600-image grid all firing at once issues 600 sessions.

**Fallback**: if re-issue itself fails (network down, server 500), the helper falls back to the legacy public URL during the dual-path window (Phase 4.5 still has both buckets readable). After the bucket flip (Phase 4.6+), failure shows a Hebrew toast `הסשן פג, רענן את הדף בבקשה` ("Session expired, please refresh") with a refresh button. No silent broken-image state.

## 7. OG / share crawler interaction

WhatsApp/Slack/Twitter/iMessage crawlers don't carry tokens — they fetch the OG URL exactly once, server-side, no JS, no cookies. Our existing `share.ts` and `gallery-page.ts` already point `og:image` at `https://pixflow-ai.com/api/og?gallery=…`, which generates a branded share card from the cover thumb.

The fix is structural, not procedural: the **`gallery-images-thumbs-public` bucket stays public**. Master plan §4.2 explicitly populates it with low-res cover/share thumbs. `og.tsx` reads only from there. Originals + web previews are gated; thumbs aren't.

Concretely: when the bucket flip happens in Phase 4.6, the `gallery-images` bucket goes private, `gallery-images-web` goes private, `gallery-images-thumbs-public` stays public. `og.tsx` is auditable — it must never reference anything outside the public-thumbs bucket. Add a CI grep: `grep -E "gallery-images($|-web)" gallery-web/api/og.tsx` should return zero hits.

## 8. Latency budget

| Path | Cost today | Cost after | Notes |
|---|---|---|---|
| Cold gallery load (first visit, no cache) | 0 | **+150–300 ms** | One round-trip to `/api/append-event-posts`. Vercel Function cold-start adds ~200ms occasionally; Function is already warm from `gallery-page.ts` calls in 95% of paths. |
| Reload same tab | 0 | **0** | sessionStorage hit. |
| Background refresh (minute 50) | n/a | **0** to user | Happens off the critical render path. |
| Mobile 4G in Israel | budget 1.5s for first paint | budget 2s | Fits well inside the existing splash-screen. |

**Optimisation skipped in v1**: prefetching the token from `index.html` via `<link rel="preload">`. The 150-300ms is paid inside the existing splash screen; users perceive the splash as load time, so the cost isn't visible. Skip until measured.

## 9. Edge cases

| Case | Behaviour |
|---|---|
| Two tabs same gallery, same browser | Both read from same `sessionStorage` (same origin → shared). One token, both tabs use it. Refresh interval runs in both; the dedupe in step 6 of §3 collapses concurrent re-issues to one row. |
| User refreshes page | sessionStorage survives reload (it's tab-scoped, not pageload-scoped). No re-fetch unless within the 10-min refresh window. |
| User closes + reopens browser | sessionStorage cleared. New token issued on next visit. Fine — pays the 150-300ms once. |
| Photographer testing on production while a real client is viewing | They share an IP only if on the same WiFi. Tell photographers: *test in incognito or with VPN.* Document, don't engineer around. |
| User on cellular, IP rotates mid-session | Old token in sessionStorage stays valid (use isn't IP-bound, only issue is). Refresh at minute 50 mints a new one from the new IP. No disruption. |
| Corporate / mobile NAT (many users one IP) | 30/hour is generous; Turnstile catches the overflow. |
| iPhone Safari caching | sessionStorage is tab-scoped, not bfcache-cached. Token endpoint sets `Cache-Control: no-store`. |

## 10. Migration timeline within Phase 4

| Phase | Step |
|---|---|
| 4.1 | `signedStorage.ts` helper deployed. Accepts optional `token`. No callsite changes yet. |
| 4.2 | `gallery-images-thumbs-public` bucket populated. OG keeps working. |
| 4.3 | Canary surface (e.g. dashboard preview) migrated to `signedStorage.ts`. Validate. |
| **4.5** | **Public viewer migration (this doc)**: deploy session endpoint, deploy `publicSession.ts`, wire into `App.tsx`. Ship behind `VITE_PUBLIC_VIEWER_SIGNED_URLS=1` env flag. **Buckets are still public** during dual-path window — fallback works. |
| 4.6 | Bucket flip: `gallery-images` and `-web` go private. The session flow becomes mandatory. |

**Cutover mechanism**: Vite reads `VITE_PUBLIC_VIEWER_SIGNED_URLS` at build time, exposes it to the SPA. `App.tsx` checks the flag — if `0`, `publicSession.ts` is a no-op and `signedStorage.ts` falls back to public URLs (today's behaviour). If `1`, the flow above activates. Easy revert: set the env to `0` in Vercel and redeploy (~2 min).

## 11. Open questions for the user

1. **Cloudflare Turnstile: free vs Pro?** — Free covers our scale by 60×. Pick free.
2. **Rate limit aggressiveness** — Suggest 30 sessions/IP/hour soft, 100 hard. Reasonable for family-sharing patterns. Confirm or pick a different number.
3. **Cross-gallery token sharing within one business?** — Recommend NO. One token per gallery. Smaller blast radius. Cost: one extra round-trip per gallery navigated, rarely happens on the public viewer.
4. **Expired-token UX** — Recommend silent re-fetch (no UI noise). Only show a Hebrew toast if re-fetch itself fails twice in a row.
5. **Origin allowlist for the new action** — same as existing? (Yes — the function already enforces it.) Confirm we don't want to allow third-party embeds (e.g., a wedding planner iframing the gallery on their own domain).

## 12. Implementation effort estimate

| Workstream | Days |
|---|---|
| Backend: action handler in `append-event-posts.ts` + `issue_public_gallery_session` RPC + `public_gallery_sessions` table + RLS | 1.0 |
| Frontend: `publicSession.ts` + `App.tsx` integration + `signedStorage.ts` glue | 1.0 |
| Turnstile integration (site-key in env, widget render on 429, retry flow) | 0.5 |
| Testing: staging matrix — fresh visit, reload, second tab, expired token mid-scroll, rate-limit + Turnstile, OG crawler, photographer self-test, iPhone Safari | 1.0 |
| **Total** | **3.5 days** |

Add 1 day buffer for the Turnstile UX polish (Hebrew copy, RTL widget alignment) and 0.5 day for the bucket-flip dry run in staging. Realistic ship: **5 days, one engineer.**
