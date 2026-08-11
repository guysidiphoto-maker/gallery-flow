-- PROVISIONAL — NOT NUMBERED, NOT IN supabase/migrations, NOT APPLIED ANYWHERE.
-- =============================================================================
-- Story Studio: additive scene-plan persistence on the EXISTING story_renders
-- table. This is deliberately kept OUT of supabase/migrations/ so it cannot be
-- auto-applied to prod or shared Staging while the migration numbering is in
-- flux (see MIGRATION-INVENTORY-AND-COLLISION-PROOF.md).
--
-- Assign a real NNN_ number and move into supabase/migrations/ ONLY after draft
-- PRs #216 and #220 have landed on main (they will consume 115-120). Until then
-- Story Studio runs against this provisional patch in an isolated branch DB / the
-- pure in-memory fixtures used by the planner tests.
--
-- Design principle: REUSE the canonical story model. We do NOT create a second
-- story table. We add three additive, nullable columns + one draft status value
-- + one partial-unique index. Fully reversible (see the _rollback file).
-- =============================================================================

begin;

-- 1. The editable scene plan (canonical ScenePlan JSON, schema in sceneplan.ts).
--    Nullable: existing rendered rows have no authoring plan and stay valid.
alter table public.story_renders
  add column if not exists scene_plan jsonb;

-- 2. Human title for the studio project (shown in the dashboard list).
alter table public.story_renders
  add column if not exists title text;

-- 3. When the owner last saved the draft (drives "recovered your draft" UX).
alter table public.story_renders
  add column if not exists draft_updated_at timestamptz;

-- 4. Extend the status machine with a 'draft' state (autosaved, not yet rendered).
--    Recreate the CHECK constraint to include it. Reversible.
alter table public.story_renders
  drop constraint if exists story_renders_status_check;
alter table public.story_renders
  add constraint story_renders_status_check
  check (status in ('draft','queued','rendering','ready','failed'));

-- 5. Exactly ONE autosaved studio draft per gallery (the working project).
--    Rendered/queued rows are unaffected (they use the existing in-flight index).
create unique index if not exists story_renders_one_draft_per_gallery
  on public.story_renders (gallery_id)
  where status = 'draft';

-- Note on writes: draft autosave/load goes through an OWNER-authenticated API
-- endpoint that verifies ownership then uses the service-role key (identical to
-- the existing /api/stories/render pattern). We therefore add NO new anon/auth
-- UPDATE policy — the existing owner-only SELECT + service-role-only mutate model
-- is preserved unchanged.

comment on column public.story_renders.scene_plan is
  'Story Studio: canonical editable ScenePlan JSON (see sceneplan.ts). Null for legacy render rows.';

commit;
