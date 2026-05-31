-- 066_story_renders.sql — Stories Phase 2 render-tracking table.
--
-- Tracks one row per Remotion Lambda render kicked off by /api/stories/render.
-- The Dashboard polls /api/stories/status?renderId=… while a render is
-- in-flight. When status flips to 'ready', the status endpoint inserts the
-- public `stories` row so the viewer surfaces the new mp4 without any
-- client-side write.
--
-- Why a partial UNIQUE on (gallery_id, style) WHERE status IN
-- ('queued','rendering'):
--   Two photographer clicks within a second otherwise spawn two Lambdas →
--   double-billing + nondeterministic "which mp4 wins" at the storage path.
--   The partial UNIQUE rejects the second INSERT at the DB so the endpoint
--   can short-circuit to the already-running row idempotently.
--
-- RLS: gallery owner only. Reads through businesses.user_id; the
-- service-role endpoint bypasses RLS, but the policy still protects any
-- accidental anon-key client read.

create table if not exists public.story_renders (
  id                uuid primary key default gen_random_uuid(),
  gallery_id        uuid not null references public.galleries(id) on delete cascade,
  style             text not null,
  photo_ids         uuid[] not null default '{}'::uuid[],
  status            text not null default 'queued'
                      check (status in ('queued','rendering','ready','failed')),
  lambda_render_id  text,
  error_message     text,
  output_path       text,
  requested_by      uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One in-flight render per (gallery, style). Completed / failed rows are
-- excluded from the index so historical retries don't collide.
create unique index if not exists story_renders_inflight_unique
  on public.story_renders (gallery_id, style)
  where status in ('queued','rendering');

create index if not exists story_renders_gallery_id_idx
  on public.story_renders (gallery_id);

create index if not exists story_renders_status_idx
  on public.story_renders (status);

-- updated_at auto-bump on UPDATE so we don't depend on the endpoint
-- remembering to set it every time we flip status.
create or replace function public.story_renders_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_story_renders_updated_at on public.story_renders;
create trigger trg_story_renders_updated_at
  before update on public.story_renders
  for each row execute function public.story_renders_touch_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.story_renders enable row level security;

-- SELECT: gallery owner only. Joins galleries → businesses → user_id.
drop policy if exists story_renders_select_owner on public.story_renders;
create policy story_renders_select_owner
  on public.story_renders
  for select
  using (
    exists (
      select 1
      from public.galleries g
      join public.businesses b on b.id = g.business_id
      where g.id = story_renders.gallery_id
        and b.user_id = auth.uid()
    )
  );

-- INSERT: same owner check on the row being created.
drop policy if exists story_renders_insert_owner on public.story_renders;
create policy story_renders_insert_owner
  on public.story_renders
  for insert
  with check (
    exists (
      select 1
      from public.galleries g
      join public.businesses b on b.id = g.business_id
      where g.id = story_renders.gallery_id
        and b.user_id = auth.uid()
    )
  );

-- No UPDATE / DELETE policy: only the service-role endpoint mutates rows
-- (Lambda status callbacks). RLS will reject anon / authenticated writes.

comment on table public.story_renders is
  'Phase 2: tracks Remotion Lambda renders kicked off by /api/stories/render. '
  'One in-flight row per (gallery, style) enforced by partial UNIQUE.';
