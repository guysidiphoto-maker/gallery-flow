# Story Studio — QA DB + Deploy Readiness
_2026-08-09 · branch feat/story-studio-revival (local, not pushed)_

## Step 1 — Migration safety ✅
- `git fetch` (fresh). `origin/main` migration frontier = **114** (`114_draft_isolation_hardening`).
- Scanned **every** `origin/*` branch: **nothing claims 115+**. #216/#220 add zero *new* logical migrations (already reconciled by #221).
- **Proposed final repo number: `115_story_studio_scene_plan.sql`** (+ rollback) — but keep **provisional / un-numbered in-repo** until #216/#220 land (they'll consume 115–120 on rebase), then re-verify. This does not affect QA (qa2 has its own migration ledger).
- Did not rename/modify any migration; did not touch Production or shared Staging.

## Step 2 — Isolated QA database ✅
Project inventory (org zrkgnikhgnxjzoqoaawn):
| Project | id | Role | Usable? |
|---|---|---|---|
| guysidiphoto-maker's Project | vlyiqfawkrjvqcmkpfvs | **Production** | ❌ never |
| pixflow-staging | bkccdomovxtuqdxrahnc | shared Staging | ❌ never |
| pixflow-cpv2-staging | idzeizesynyjcyfqfznh | **PR #214 Staging** | ❌ forbidden |
| **pixflow-cpv2-qa2** | **icxitoczqtcgdkwiaxxc** | disposable QA | ✅ chosen |

**Safety proof (qa2):** all `auth.users` emails are synthetic (`@qa.test`, `@example.com`); tiny synthetic dataset (2 businesses, 2 galleries, 1 client, 0 images); gallery ids are `dddddddd-…`. **No real customer data.**

**Schema applied (qa2 only, minimal + additive on existing `story_renders`):** `scene_plan jsonb`, `title text`, `draft_updated_at timestamptz`, `'draft'` status value, `story_renders_one_draft_per_gallery` partial-unique index.
- ✅ draft insert works; ✅ duplicate-draft rejected by the index; ✅ **rollback verified** (0 leftover columns, original CHECK restored, index dropped) then re-applied. qa2 currently = applied.

## Step 3 — Isolated Preview 🟡 DEPLOYED, awaiting 2 inputs (2026-08-09)
The Vercel CLI was already authenticated locally (`guysidiphoto-maker`), so no token was needed.
- **Isolated project created:** `pixflow-story-studio-qa` (`prj_KFifYyAvWc8aUDnF8zqvmok1xScE`), separate from gallery-web/pixflow-staging/prod. No custom domain.
- **Deployed exact HEAD** `dbebad4` of `feat/story-studio-revival`. Build **passed** (~1m) on the fresh project.
- **Target = preview** (verified via `vercel inspect`). The unavoidable first-deploy-to-production artifact was **removed**; only one **Preview** deployment remains.
- **Preview URL:** `https://pixflow-story-studio-8eiggry3f-guysidiphoto-makers-projects.vercel.app`
- **Env (Preview scope only):** `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY` → all point to qa2 (`icxitoczqtcgdkwiaxxc`). No Production/shared vars set.
- **Supabase target ref:** `icxitoczqtcgdkwiaxxc` (pixflow-cpv2-qa2) — confirmed, no secret exposed.

### 2 inputs needed to run the end-to-end flow
1. **Service-role key (only you):** Vercel → team `guysidiphoto-makers-projects` → project **pixflow-story-studio-qa** → **Settings → Environment Variables → Add New** → Key `SUPABASE_SERVICE_ROLE_KEY`, **Environment = Preview only**, **no `VITE_` prefix**. Value = qa2 service_role from Supabase → project **pixflow-cpv2-qa2** → **Project Settings → API → service_role**. Do not paste it here.
2. **Deployment Protection:** the preview is behind Vercel SSO (302 → sso-api), so browser QA can't reach it. Choose: (a) I disable Deployment Protection on this isolated QA project (synthetic-only, obscure URL), or (b) I generate a Protection-Bypass-for-Automation token. Your call.

After both: I redeploy (env applies on next deploy), seed qa2 with synthetic renderable images + a synthetic login, then run Steps 4–9.

---

## (historical) Step 3 — original blocker analysis
To deploy `feat/story-studio-revival` to a Preview wired **only** to qa2, three things are missing and cannot be obtained safely without you:

1. **Vercel access** — `vercel` CLI is not installed and no `VERCEL_TOKEN` is present. The only linked Vercel project here is **pixflow-staging** (`prj_CiFlBmNSR3fDK0hHdysJFQBNfOYs`) — a **shared** project. Deploying this branch there would inherit shared env vars → violates "no Production/shared-Staging env" and "all data synthetic." I will not do that.
2. **An isolated Vercel project** wired to qa2 (a new project, e.g. `pixflow-story-studio-qa`) — a new resource with possible cost; your call to create/authorize.
3. **qa2 `SUPABASE_SERVICE_ROLE_KEY`** — the render + draft functions require it, and it is a secret the Supabase tools do **not** expose. It must be set **directly in the Vercel project env** (never pasted in chat).

### What I need from you to proceed (any path)
- Confirm an **isolated Vercel project** to use (or authorize me to create one) — NOT pixflow-staging.
- Provide **Vercel deploy access** (install `vercel` + `vercel login`, or a `VERCEL_TOKEN`), or run the deploy yourself with the env below.
- Set these env vars on that project (service-role set by you, in Vercel):
  - `SUPABASE_URL` / `VITE_SUPABASE_URL` = `https://icxitoczqtcgdkwiaxxc.supabase.co`
  - `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` = `sb_publishable_FkEV2hzHYpdYJqjI_aUUFg_xHYd8pOm` (qa2 publishable/anon — public by design)
  - `SUPABASE_SERVICE_ROLE_KEY` = **(qa2 service role — you set it in Vercel; I never see it)**

Once an isolated Preview + qa2 service-role env exist, I can seed synthetic galleries/images in qa2 and run the full Step 4 end-to-end + Step 8 browser QA + Step 9 reviews.

## Not done (gated on Step 3)
Steps 4 (real end-to-end in the deployed Dashboard), 8 (browser QA matrix), 9 (independent review on the deployed flow), 10 (Draft PR). Draft PR remains **NO-GO** until the deployed flow passes. Production: **NO-GO**.
