# Track B — Production Foundations (PLAN ONLY — nothing built or applied)

**Status:** proposal for your approval. **No code written, no migration applied, no deploy.** This is the "phase after" prepared for a fast green-light, per your delegation. It deliberately respects your own Phase-0 sequencing (Track B comes *after* Track A ships).

> ⚠️ The SQL in §4 is a **DRAFT PROPOSAL — DO NOT APPLY** as-is. It lives here (not in `supabase/migrations/`) precisely so no migration runner picks it up. It must be previewed on a branch DB first (your rule: never destructive SQL without preview).

---

## 1. Goal & guardrails

Add a **multi-tenant foundation** (organizations, members, roles, feature flags) **additively**, behind a feature flag, so the existing single-tenant photographer product is 100% unaffected. This is the groundwork the Production product needs (per `VISION_RETAINER_PLATFORM.md` / `project_pixflow_ai_visual_os`), NOT the Production product itself.

Guardrails:
- **Additive only.** No changes to existing tables' columns or RLS in phase 1. Existing `businesses`/`galleries` RLS keeps working untouched.
- **Backfill, don't migrate.** Every existing `businesses` row gets a personal `organization` (1:1) so nothing changes for solo photographers.
- **Flagged.** A DB-level `feature_flags` / `organization_modules` layer gates all Production UI. Default off.
- **Reversible.** Phase 1 is drop-able (new tables only).

## 2. Why this is the right first slice
The audit proved the app is single-tenant (`businesses.user_id = auth.uid()`). You can't build clients/brands/projects/collections/team-roles without an org + membership + role model underneath. This slice is that substrate — and only that. It ships no user-facing Production feature, so it's low-risk and unblocks everything else.

## 3. Proposed tables (phase 1)

| Table | Purpose |
|---|---|
| `organizations` | Workspace container. `type` ∈ (photographer, studio, production_company, agency). One per existing business at backfill. |
| `organization_members` | user ↔ org, with `role`. |
| `organization_roles` | enum-backed role set: owner, admin, producer, photographer, editor, social_manager, client, viewer. |
| `feature_flags` | global + per-org flags (e.g. `production_ui`, `tender`, `social`). |
| `organization_modules` | per-org module enable/limits (founder can toggle per pilot account). |
| (link) `businesses.organization_id` | nullable FK added additively; backfilled 1:1. Existing RLS untouched in phase 1. |

## 4. DRAFT migration — DO NOT APPLY (preview on a branch DB first)

```sql
-- PROPOSAL ONLY — review + preview on a Supabase BRANCH before ever applying.
-- Additive: creates new tables + a nullable FK; does not alter existing RLS.

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'photographer'
    check (type in ('photographer','studio','production_company','agency','enterprise')),
  status text not null default 'active'
    check (status in ('active','pending','pilot','suspended','expired')),
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner','admin','producer','photographer','editor','social_manager','client','viewer')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists feature_flags (
  key text not null,
  organization_id uuid references organizations(id) on delete cascade, -- null = global
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (key, organization_id)
);

create table if not exists organization_modules (
  organization_id uuid not null references organizations(id) on delete cascade,
  module text not null,           -- e.g. 'tender','social','media_library'
  enabled boolean not null default false,
  limits jsonb not null default '{}'::jsonb,
  primary key (organization_id, module)
);

-- Additive link; nullable so existing flows are untouched until backfill.
alter table businesses add column if not exists organization_id uuid references organizations(id);

-- Backfill: one personal org per existing business, owner membership.
-- (Run as a reviewed data migration; wrap in a transaction; verify counts.)
-- insert into organizations (id, name, type) select gen_random_uuid(), business_name, 'photographer' from businesses where organization_id is null; ...
```

RLS for the new tables (phase 1): members can read their own orgs/memberships; writes via service-role/RPC only. Existing `businesses`/`galleries` policies are NOT modified in phase 1 — a later phase optionally adds org-scoped read paths behind the flag.

## 5. Rollout phases
1. **Substrate (this proposal):** tables + nullable FK + backfill, all behind `feature_flags.production_ui=false`. No UI. Preview-DB tested, then a normal PR.
2. **Production shell:** a flagged `/production` app shell + org switcher, visible only to orgs with the flag on / invite-approved accounts.
3. **First modules:** clients, brands, projects, media library — each its own PR, each flag-gated.

## 6. What I need from you to start Track B
- Green-light the table shape above (or edits).
- Confirm the invite/approval model for Production accounts (admin-created vs pilot code vs demo-request) — this decides the `organizations.status` flow.
- Confirm Track A is merged first (your own sequencing).

Until then: **not started.**
