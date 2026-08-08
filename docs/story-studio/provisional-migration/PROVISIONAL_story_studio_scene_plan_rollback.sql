-- ROLLBACK for PROVISIONAL_story_studio_scene_plan.sql — fully reverses it.
begin;

drop index if exists public.story_renders_one_draft_per_gallery;

-- Restore the original status CHECK (without 'draft'). Any draft rows must be
-- removed first or this will fail — intentional, so rollback never silently
-- strands a row in an invalid state.
delete from public.story_renders where status = 'draft';

alter table public.story_renders
  drop constraint if exists story_renders_status_check;
alter table public.story_renders
  add constraint story_renders_status_check
  check (status in ('queued','rendering','ready','failed'));

alter table public.story_renders drop column if exists draft_updated_at;
alter table public.story_renders drop column if exists title;
alter table public.story_renders drop column if exists scene_plan;

commit;
