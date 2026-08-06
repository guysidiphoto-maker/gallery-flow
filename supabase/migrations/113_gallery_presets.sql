-- ─────────────────────────────────────────────────────────────────────────────
-- 111_gallery_presets.sql — Owner-scoped reusable gallery presets.
--
-- A preset is a named bundle of REUSABLE delivery + appearance settings that a
-- photographer can apply to any of their galleries. It deliberately carries
-- NONE of a gallery's identity: no title, client assignment, event metadata,
-- passwords/codes, cover image, published status or URLs. Applying a preset
-- goes through update_gallery_settings (already owner-checked + validated), so
-- the same allowlist/constraints that guard normal edits also guard applies.
--
-- Two layers keep a preset clean:
--   1. Client filters to the reusable keys when saving.
--   2. This migration's BEFORE INSERT/UPDATE trigger re-filters settings to an
--      explicit ALLOWLIST server-side — so even a misbehaving client can never
--      persist a title, password, cover path or event date inside a preset.
--
-- Ownership: standard business_id RLS (mirrors tender_collections / 100). One
-- default preset per business is enforced by a trigger that unsets the others
-- when a row is flagged default.
--
-- Additive; does not modify applied 104–110. Reversible.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.gallery_presets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gallery_presets_business_idx
  ON public.gallery_presets (business_id, created_at DESC);

-- ── Allowlist sanitizer ──────────────────────────────────────────────────────
-- Reduce settings to the reusable keys ONLY. Anything else (identity, secrets,
-- cover paths, event metadata) is dropped before the row is written.
CREATE OR REPLACE FUNCTION public._sanitize_preset_settings(p_settings JSONB)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_allowed TEXT[] := ARRAY[
    -- Downloads
    'downloadsEnabled','bulkDownloadEnabled','trackDownloads','downloadQuality',
    -- Access mode default (NOT the password / codes)
    'accessType','facePrivacyMode','clientSelectionEnabled',
    -- Watermark
    'watermarkEnabled','watermarkText','watermarkPosition','watermarkSource',
    'watermarkScalePercent','watermarkOpacityPercent','watermarkContrastAware',
    -- Grid / layout
    'gridSpacing','layoutMode','imageSpacing','cornerStyle','thumbnailSize','feedLayout',
    -- Appearance / branding policy (NOT logoUrl — that is a per-gallery asset)
    'appearance','themeColor','headingFont','bodyFont','showFooterCredit',
    -- Welcome / viewer
    'welcomeStyle','generateStories','showStories'
  ];
  v_out JSONB := '{}'::jsonb;
  v_key TEXT;
BEGIN
  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  FOREACH v_key IN ARRAY v_allowed LOOP
    IF p_settings ? v_key THEN
      v_out := v_out || jsonb_build_object(v_key, p_settings -> v_key);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public._gallery_presets_biu()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.settings := public._sanitize_preset_settings(NEW.settings);
  NEW.updated_at := now();
  -- Enforce a single default per business by clearing the others.
  IF NEW.is_default THEN
    UPDATE public.gallery_presets
       SET is_default = false, updated_at = now()
     WHERE business_id = NEW.business_id
       AND id <> NEW.id
       AND is_default;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gallery_presets_biu ON public.gallery_presets;
CREATE TRIGGER gallery_presets_biu
  BEFORE INSERT OR UPDATE ON public.gallery_presets
  FOR EACH ROW EXECUTE FUNCTION public._gallery_presets_biu();

-- ── RLS — owner only ─────────────────────────────────────────────────────────
ALTER TABLE public.gallery_presets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gallery_presets'
      AND policyname = 'gallery_presets_owner_all'
  ) THEN
    CREATE POLICY gallery_presets_owner_all ON public.gallery_presets
      FOR ALL TO authenticated
      USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
      WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Least privilege: authenticated only; never anon.
REVOKE ALL ON public.gallery_presets FROM PUBLIC;
REVOKE ALL ON public.gallery_presets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gallery_presets TO authenticated;
GRANT ALL ON public.gallery_presets TO service_role;

COMMIT;

-- Post-conditions (run manually):
-- SET ROLE anon; SELECT count(*) FROM gallery_presets;                          -- expect: permission denied
-- INSERT ... settings '{"password":"x","gridSpacing":"large"}' → stored settings = {"gridSpacing":"large"}
