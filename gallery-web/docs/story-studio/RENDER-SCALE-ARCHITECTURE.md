# Story Studio — Render Scale Architecture

Status: proposal / decision doc
Audience: founder + one engineer
Scope: how to scale Story Studio video rendering **beyond** today's synchronous
first-release path. No code changes here — this is the plan.

---

## 0. TL;DR

Today every render runs **inside one Vercel Function** (`api/stories/render.ts`)
using `@sparticuz/chromium` + `@remotion/renderer`, with `maxDuration=300s` and
`memory=3009MB`. That works only because we cap stories at **18 scenes / 45s**.
The cap exists purely to stay under the 300s function ceiling. It is a
scaffolding limit, not a product limit.

**Recommendation: adopt Remotion Lambda (Path B) as the render engine, and keep
the current `story_renders` table as the durable job/lifecycle record.** The
queue-worker model (Path A) is the fallback if we ever need a non-AWS renderer or
want to reuse existing Supabase-only infra. Both reuse the `ScenePlan` contract,
`_scenePlanGuard.ts` validation, and the `gallery-stories` storage layout
**unchanged**. The Vercel Function stops *rendering* and becomes a thin
*dispatcher + poller*.

---

## 1. Why synchronous-in-a-Vercel-Function does not scale past the cap

The current design is documented in the header of `api/stories/render.ts`. It is
correct and safe for the first release, but it hits four hard walls the moment we
raise the scene cap.

### 1.1 The 300s function ceiling (the primary wall)

Measured ground truth from deployed QA:

| Scenes | 9:16 render wall time @ 3009MB / ~2 vCPU | Fits in 300s? |
|-------:|------------------------------------------|---------------|
| 16     | 137–195s (~10–12s/scene)                 | Yes (headroom) |
| 18     | ~180–215s (today's enforced cap)         | Yes (barely)   |
| 30     | ~260–370s                                | **No** (exceeds ceiling on the slow end) |
| 45     | ~390–560s                                | **No** (never) |

Render time is roughly **linear in frame count** (~10–12s per scene at 30fps
9:16). Vercel's absolute function ceiling is 300s (Fluid/Pro). A synchronous
render therefore *cannot* serve 30+ scene stories — there is no config knob that
safely fixes this (see §5). The 45s / 18-scene cap in
`checkRenderFeasibility()` is the direct consequence.

### 1.2 Concurrency and cost

Each render **pins ~2 vCPU and up to ~2GB peak RSS for ~3 minutes** in a
3009MB function. Concurrency is therefore literally *N parallel 3GB functions*.
- Real money: ~**0.11–0.16 GB-hr per render** today.
- Vercel account-level concurrency limits become the throughput cap. 50
  photographers each kicking off a render at 6pm on a Saturday = 50 concurrent
  3GB functions, which is both a cost spike and a limit risk.
- The single Function can't fan a render out across cores/machines — it renders
  frames serially inside one Chromium. There is no horizontal parallelism
  *within* a render.

The in-flight partial-unique index on `story_renders (gallery_id, style)` WHERE
`status IN ('queued','rendering')` caps us to **1 active render per (gallery,
style)**, which limits self-inflicted fan-out but does nothing about cross-tenant
concurrency.

### 1.3 Cold starts

`@sparticuz/chromium` unpacks a brotli'd Chrome binary into `/tmp` and spawns it:
~3–5s cold, ~1–2s warm. The function bundle also carries `compositor-*` +
chromium + the pre-bundled Remotion site (`includeFiles` in `vercel.json`),
making the bundle large and cold starts heavier. Every render risks paying this
because render traffic is bursty and warm containers are not guaranteed.

### 1.4 No true cancel / no true retry

- **Cancel is cooperative only** (`api/stories/cancel.ts`): it flips the row out
  of `'rendering'`; the render function re-reads the row right before promoting
  to `'ready'` and, if it's no longer `'rendering'`, discards the uploaded
  artifacts. The render itself keeps burning ~2 vCPU until it finishes — we pay
  full cost for a cancelled job.
- **Retry does not exist.** A crashed/timed-out render leaves a stale
  `'rendering'` row that is reaped to `'failed'` — lazily on the next render for
  that gallery, or by the `sweep-stale` cron (every 15 min, older than 6 min).
  Recovery = the user clicks render again. There is no automatic re-attempt and
  no partial-progress resume.

---

## 2. Two candidate target architectures

Both share the same **contract boundary**, which is the whole reason a migration
is low-risk:

- **Input:** a validated `ScenePlan` produced by the deterministic planner and
  hardened by `resolveAndValidatePlan()` in `_scenePlanGuard.ts` (rejects foreign
  image ids, re-resolves `src` server-side, overrides dims from our records,
  re-runs the structural/injection validator).
- **Job/lifecycle record:** the `story_renders` row (`status` enum
  `queued → rendering → ready | failed`, `output_path`, `error_message`,
  `requested_by`, `photo_ids`).
- **Output:** an mp4 + poster jpg in the `gallery-stories` bucket at
  `{gallery_id}/{render_id}.mp4` and `{gallery_id}/{render_id}.jpg`, promoted to
  the public `stories` table by `api/stories/status.ts`.

Neither path changes any of the above. What changes is **where the pixels are
rendered** and **how the job is claimed and driven**.

---

### Path A — Queue + durable worker

Keep rendering with `@remotion/renderer` (same composition, same bundle) but move
it out of the request path into a **worker that claims jobs from a durable
queue** — the queue being the `story_renders` table itself (add columns; no new
infra) or a Supabase Queue / `pgmq`.

```
POST /api/stories/render         Worker (background fn OR container/VM)
  ├ validate ScenePlan            loop:
  ├ owner check                     claim 1 job  (SELECT ... FOR UPDATE SKIP LOCKED
  ├ INSERT story_renders(queued)                 WHERE status='queued'
  └ return { renderId } fast                     set status='rendering',
     (no render in request)                          lease_expires_at = now()+90s,
                                                      worker_id = <id>)
                                    render with @remotion/renderer
                                    heartbeat: extend lease_expires_at every ~30s
                                    upload mp4+poster to gallery-stories
                                    set status='ready', output_path=...
```

**Enqueue.** The render endpoint becomes non-blocking: validate + owner-check +
`INSERT ... status='queued'` + return `{ renderId }` immediately. The existing
idempotency (in-flight unique index + racing re-query) stays exactly as is.

**Claim with a lease + heartbeat (survives worker death).** A worker atomically
claims a `'queued'` row via `FOR UPDATE SKIP LOCKED`, sets
`status='rendering'`, `worker_id`, and `lease_expires_at = now() + 90s`. While
rendering it extends `lease_expires_at` every ~30s (heartbeat). If the worker
dies, the lease expires; the `sweep-stale` cron (repurposed to check
`lease_expires_at < now()` instead of a fixed 6-min age) returns the job to
`'queued'` for **automatic retry** (bounded by an `attempts` counter →
`'failed'` after N). This is the key upgrade over today's "reap to failed, user
retries manually."

**Worker host options (in order of effort):**
1. **Vercel background function / Fluid** — least new infra, but still Vercel's
   execution-time and cost envelope; a 45-scene render still needs a long-lived
   compute budget. Marginal win over today unless paired with chunking.
2. **Dedicated container/VM worker** (Fly.io machine, Railway, a small
   always-on/auto-scaled box, or AWS Fargate) — the honest answer for long
   renders. No 300s ceiling, cheaper per-render at sustained load, full control
   of Chromium/ffmpeg. This is what Path A really means at scale.

**Concurrency control.** Fixed worker pool size = max concurrent renders (e.g. 3
workers = 3 renders at once); extra jobs sit `'queued'`. Predictable cost, no
account-level surprise. Per-tenant fairness enforced by the existing per-(gallery,
style) unique index.

**Retry after failure.** Automatic: lease expiry → requeue → bounded `attempts`.
A crash mid-render loses that attempt's frames (no resume unless we add
chunk-level checkpointing, which Path A does not give for free).

**Cancellation.** Still **cooperative** — same model as today. The worker checks
the row's status between scenes/at heartbeat; on `'failed'/cancelled` it aborts
the render loop and drops artifacts. Better than today (can abort *mid-render* at
the next heartbeat, not just at the end) but not an instant hard kill unless we
add a signal channel and `process.kill` on a per-job worker.

**Cost model.** You pay for worker uptime, not per-request GB-hr. A single
always-on 2 vCPU / 4GB box (~$20–40/mo) can serialize many renders/day at
~$0 marginal each. At bursty low volume this is *more* expensive than serverless
(idle box); at sustained volume it's cheaper and far more predictable.
Rough $ per render at scale: **dominated by fixed worker cost**, so effectively
**~$0.005–0.02/render** once the box is busy — but you eat idle time.

**Observability.** Progress via the `onProgress` heartbeat already wired in
`render.ts`, persisted to a `progress` column and polled by the client (same
polling the UI does now). Logs live wherever the worker runs (not Vercel logs).
Metrics = queue depth, oldest-queued-age, worker utilization, attempts
histogram. **This is the weak spot of Path A: you now operate a second runtime**
and its logging/alerting, separate from Vercel + Sentry.

**Temp/artifact cleanup.** Worker writes mp4 to local `/tmp` (or its own tmp),
uploads, deletes — same as today's `finally` block. Orphan storage objects from
cancelled/failed jobs cleaned by a periodic sweep (list bucket vs. `ready` rows).

---

### Path B — Remotion Lambda (`@remotion/lambda`)

The **purpose-built** path. Remotion Lambda is Remotion's own distributed
renderer: it **fans a single render out across many AWS Lambda invocations**,
each rendering a chunk of frames, then stitches them.

**How it fans out.** `renderMediaOnLambda()` splits the composition into chunks
(`framesPerLambda`). For a 45-scene / ~135s story that's dozens of Lambdas each
rendering a few seconds **in parallel**, so wall-clock time is roughly
`chunk_time + stitch`, not `sum(all scenes)`. A render that is 390–560s serially
finishes in **tens of seconds** wall-clock. This directly dissolves §1.1 —
there is no single-function ceiling because no single function renders the whole
video.

**Concurrency model.** Two layers:
1. *Within a render*: N parallel Lambdas (you choose `framesPerLambda` /
   concurrency). More Lambdas = faster wall time, more simultaneous invocations.
2. *Across renders*: bounded by your AWS account Lambda concurrency limit
   (default 1000; raisable). Our per-(gallery, style) unique index still caps
   self-fan-out; cross-tenant concurrency is an AWS quota, not a Vercel one.

**Cost model.** Pay per GB-second of Lambda + a little S3. Because total *compute*
is similar to today (same frames rendered), cost is in the **same
~$0.10–0.20/render ballpark** as the current synchronous path — you're buying
*wall-clock parallelism*, not fewer CPU-seconds. Very long stories cost
proportionally more but never time out. No idle cost (unlike Path A's box).
Rough $ per render at scale: **~$0.10–0.20** for a 45-scene story; **~$0.03–0.06**
for an 18-scene one.

**What changes in our code (small, well-bounded):**
- **One-time deploy** (CI or a script): `deployFunction()` to create the render
  Lambda, and `deploySite()` to push the existing Remotion bundle (the same
  `stories-remotion` site we already build) to an S3 site bucket. New env:
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `REMOTION_APP_REGION`,
  the deployed function name, and the S3 site URL.
- **Swap the render call.** In `render.ts`, replace the `selectComposition` +
  `renderMedia` + `renderStill` block with `renderMediaOnLambda()` (and
  `renderStillOnLambda()` for the poster), passing the **same `inputProps`
  (`{ plan }` or `{ images, brand }`) and the same `compositionId`
  (`StoryStudio` / `Clean`)**. `getRenderProgress()` drives status.
- **Drop from the Vercel function**: `@sparticuz/chromium`, the local
  `stories-bundle` `serveUrl` resolution, the `chdir('/tmp')` dance, and the
  giant `includeFiles` in `vercel.json`. The Vercel function shrinks to a
  dispatcher — `maxDuration` can drop back toward normal (kick off + return, or
  kick off + short poll).
- **Output.** Lambda writes to its own S3 bucket. Either (a) copy the finished
  mp4/poster into `gallery-stories/{gallery_id}/{render_id}.mp4` to keep the
  **exact current storage layout and public-URL scheme** (recommended — zero
  change downstream of storage), or (b) serve from S3 and store that URL in
  `output_path`. Recommend (a) so `status.ts` and the viewer are untouched.

**Concurrency control.** `framesPerLambda` + a max-concurrency setting per
render; AWS reserved concurrency to protect the account. The `story_renders`
unique index unchanged.

**Retry after failure.** Remotion Lambda **retries failed chunks internally**
(configurable `maxRetries`). At the job level we still own the `story_renders`
row: a whole-render failure flips to `'failed'`; a small dispatcher-side retry
loop (or the sweep cron) can re-invoke. Far more robust than today — a single
bad frame retries a chunk, not the whole video.

**Cancellation.** Real-ish: no single hard kill, but you can stop tracking and
let chunks finish, or delete the render; the dominant cost saver is that chunks
are short-lived. In practice: mark row cancelled, stop polling, discard S3
output. Comparable to Path A cooperative, but blast radius is small (short
chunks) so wasted spend is naturally bounded.

**Observability.** `getRenderProgress()` returns per-render progress, chunk
counts, and **CloudWatch log links per invocation** — richer than today's
`onProgress` log heartbeat. Persist `progress` to the row for the client poll.
Metrics via CloudWatch (invocations, errors, duration, cost). Sentry still wraps
the dispatcher.

**Temp/artifact cleanup.** Lambda cleans its own `/tmp` per invocation
automatically. The intermediate S3 render bucket accumulates outputs — set an
**S3 lifecycle rule** (e.g. expire objects after 1–7 days) since we copy the
final mp4 into `gallery-stories` anyway. Cancelled/failed → delete the S3 render
prefix.

---

## 3. Side-by-side

| Dimension | Today (sync fn) | Path A (queue + worker) | Path B (Remotion Lambda) |
|---|---|---|---|
| Max story length | 18 scenes / 45s (hard cap) | Unbounded (worker has no 300s ceiling) | Unbounded (fan-out) |
| Wall time, 45 scenes | ~390–560s (infeasible) | ~sum of scenes (~450s) unless chunked | **Tens of seconds** (parallel) |
| Within-render parallelism | None | None (Remotion single-machine) | **Yes** (many Lambdas) |
| Concurrency control | N parallel 3GB fns + unique index | Worker pool size | `framesPerLambda` + AWS quota |
| Retry after failure | Manual (user re-clicks) | **Automatic** (lease expiry → requeue) | **Automatic** (chunk retry + job retry) |
| Cancellation | Cooperative, pays full cost | Cooperative, aborts at next heartbeat | Cooperative, small blast radius |
| Cost / render @ scale | ~$0.11–0.16 GB-hr | ~$0 marginal + idle box (~$20–40/mo) | ~$0.03–0.20 (no idle) |
| Cost shape | Per-request, bursty | Fixed (idle waste) | Per-render, elastic |
| New infra / ops burden | None | **New runtime + its logging/alerting** | AWS account + one-time deploy |
| Code change size | — | Medium (worker + claim/lease) | **Small** (swap render call) |
| Reuses ScenePlan + storage | — | Yes, unchanged | Yes, unchanged |

---

## 4. Recommendation + phased migration

### Recommendation: **Path B (Remotion Lambda)**, `story_renders` stays the job record.

Reasoning:
- It is the **purpose-built** solution for exactly this problem and is the only
  option that makes a 45-scene story finish in seconds instead of minutes,
  because it parallelizes *within* a render.
- **Smallest code change**: swap `renderMedia`→`renderMediaOnLambda` behind the
  same `inputProps`/`compositionId`; delete chromium/bundle plumbing.
- **No idle cost and no new runtime to operate.** Path A means running,
  monitoring, and paying for a second compute platform 24/7 — real ops burden for
  a two-person team, and it *still* doesn't parallelize a single render.
- Cost is in the same ballpark as today, elastic, and never times out.

Choose **Path A instead only if**: we must avoid AWS entirely, or we want a
Supabase-only stack, or licensing/policy rules out Remotion Lambda. In that case
prefer the dedicated-container worker, not a Vercel background function.

### Phased migration (what stays / what changes)

**Phase 0 — unchanged foundation (already done).** `ScenePlan` contract,
`_scenePlanGuard.ts` hardening, `story_renders` lifecycle, `gallery-stories`
layout, `status.ts` bridge, `cancel.ts`, `sweep-stale.ts`. **All of this is
reused verbatim.** Keep the 18-scene cap live during Phases 1–2.

**Phase 1 — stand up Remotion Lambda (no user-facing change).**
- Add a CI/script step: `deploySite()` (existing `stories-remotion` bundle) +
  `deployFunction()`. Add AWS env + region + function/site identifiers.
- Prove parity: render the same `ScenePlan` on Lambda and confirm byte-comparable
  output to the synchronous path. Nothing wired to production yet.

**Phase 2 — swap the engine behind a flag.**
- In `render.ts`, put `renderMediaOnLambda` behind a `STORIES_RENDER_ENGINE`
  env flag (`sync` | `lambda`), default `sync`. Same `inputProps`,
  `compositionId`, and the **same copy-into-`gallery-stories` finalize step**, so
  `status.ts`/viewer/UI are untouched.
- Keep the existing `story_renders` writes and cooperative cancel. Dispatcher
  polls `getRenderProgress()`, writes `progress`/`status` to the row.
- Flip the flag to `lambda` for internal galleries, then all. Roll back = flip
  back.

**Phase 3 — remove the cap + shrink the function.**
- Once Lambda is the default: **raise `checkRenderFeasibility()`** from 18/45s to
  the real product limit (e.g. 60 photos already allowed; push scene cap up).
- Delete `@sparticuz/chromium`, the local `serveUrl`/bundle resolution, the
  `chdir('/tmp')` code, and the heavy `includeFiles` from `vercel.json`; drop
  `maxDuration` on `render.ts` back toward normal.
- Adjust `sweep-stale`/lease logic for Lambda job states; add S3 lifecycle rule
  and orphan-object sweep. Add automatic job-level retry.

**Reused unchanged across all phases:** the `ScenePlan` wire format, server-side
plan hardening, tenant isolation, `story_renders` schema + idempotency unique
index, `gallery-stories` path scheme `{gallery_id}/{render_id}.mp4|.jpg`,
`status.ts` promotion to `stories`, and the client's poll-for-status UX.

---

## 5. What NOT to do

**Do not raise per-request Vercel limits to force long renders.** Do not bump
`maxDuration` toward some higher number, do not chase larger `memory` to "buy"
speed, and do not try to keep the whole render synchronous inside one Function.

- 300s is Vercel's ceiling; there is no config that makes a 45-scene (~390–560s)
  render fit synchronously. You'd be building on a limit that physically can't
  move far enough.
- A single Function renders frames **serially** — more memory doesn't add
  parallelism, and past ~2 vCPU the returns flatten. You'd pay more per render
  for no structural fix.
- It keeps every failure mode from §1: no true cancel, no retry, cold starts,
  and cost that scales as N concurrent 3GB functions.

The whole point of Path A/B is to stop treating "render a video" as an HTTP
request. Move it to a job.
