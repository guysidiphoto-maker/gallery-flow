-- ─────────────────────────────────────────────────────────────────────────────
-- 048_harden_metric_trigger_search_path.sql
-- Supabase advisor 0011 flagged `_bump_gallery_download_count` and
-- `_bump_gallery_favorite_count` from migration 046 as having a role-mutable
-- search_path. Caller-controlled search_path is a known privilege-escalation
-- vector for SECURITY DEFINER fns; these triggers aren't SECURITY DEFINER but
-- still: pinning the path is cheap insurance and silences the advisor.
--
-- Migration 046 in the repo was also edited to add `SET search_path = public`
-- so fresh environments get the hardening on first run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION _bump_gallery_download_count() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE galleries SET download_count = download_count + 1
   WHERE id = NEW.gallery_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION _bump_gallery_favorite_count() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE galleries SET favorite_count = favorite_count + 1
     WHERE id = NEW.gallery_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE galleries SET favorite_count = GREATEST(0, favorite_count - 1)
     WHERE id = OLD.gallery_id;
  END IF;
  RETURN NULL;
END;
$$;

COMMIT;
