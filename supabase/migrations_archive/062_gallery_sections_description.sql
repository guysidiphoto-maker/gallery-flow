-- Phase 2 — sections completeness
--
-- The "Add Set" modal in the dashboard captures a 500-char description, but
-- there was no DB column to write it into, so the field was silently dropped.
-- Adding a nullable TEXT column is non-destructive: existing rows get NULL,
-- existing code paths keep working, and the new write target is opt-in.
--
-- The client-facing gallery renders this beneath the section heading
-- ("storytelling beat" between chapters), per the Pic-Time-style chapters
-- layout.

ALTER TABLE public.gallery_sections
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Length cap mirrors the UI (500 chars) to keep dashboard input + DB in sync;
-- no point storing a novel under a section heading.
ALTER TABLE public.gallery_sections
  ADD CONSTRAINT gallery_sections_description_length
  CHECK (description IS NULL OR char_length(description) <= 500);
