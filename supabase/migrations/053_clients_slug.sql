-- 053_clients_slug.sql
-- Short, slug-based URLs for clients and (backfilled) galleries.
--
-- Goal:
--   /eclipse-media/c/pro-market               (client dashboard)
--   /eclipse-media/g/<gallery-slug>           (gallery, already supported)
-- replacing
--   /eclipse-media/client/<client-uuid>/dashboard
--
-- The Hebrew→Latin transliteration is intentionally simple. It produces
-- readable ASCII slugs for common Hebrew names; it isn't perfect linguistic
-- transliteration but it's stable, deterministic, and good enough for URLs.
-- Owners can rename slugs later via the UI.

BEGIN;

-- ── Helper: simple Hebrew→Latin transliteration + kebab-case ────────────
CREATE OR REPLACE FUNCTION slugify(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  s TEXT;
BEGIN
  IF input IS NULL OR length(trim(input)) = 0 THEN
    RETURN NULL;
  END IF;

  s := lower(trim(input));

  -- Hebrew → Latin
  s := translate(s,
    'אבגדהוזחטיכךלמםנןסעפףצץקרשת'' ',
    'avgdhvzhtikkkmnnsapptzkrst-_'
  );
  -- Multi-char replacements (must be after translate; order matters).
  s := regexp_replace(s, 'שׁ', 'sh', 'g');
  s := regexp_replace(s, 'תּ', 't', 'g');

  -- Spaces / punctuation → dash
  s := regexp_replace(s, '[\s/_\.,]+', '-', 'g');
  -- Strip anything not a-z, 0-9, dash
  s := regexp_replace(s, '[^a-z0-9-]', '', 'g');
  -- Collapse multiple dashes
  s := regexp_replace(s, '-+', '-', 'g');
  -- Trim leading/trailing dashes
  s := regexp_replace(s, '^-+|-+$', '', 'g');

  IF s = '' THEN RETURN NULL; END IF;
  RETURN s;
END
$$;

-- ── clients.slug ────────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill existing rows: slug = slugify(name), with a numeric suffix per
-- business when the same slug repeats.
WITH base AS (
  SELECT id, business_id, name,
         COALESCE(slug, slugify(name), 'client-' || substr(id::text, 1, 6)) AS s
  FROM clients
),
ranked AS (
  SELECT id, business_id, s,
         ROW_NUMBER() OVER (PARTITION BY business_id, s ORDER BY id) AS rn
  FROM base
)
UPDATE clients c
SET slug = CASE WHEN r.rn = 1 THEN r.s ELSE r.s || '-' || r.rn END
FROM ranked r
WHERE c.id = r.id AND c.slug IS NULL;

-- Make slug NOT NULL going forward, unique per business.
ALTER TABLE clients ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clients_business_slug_idx
  ON clients(business_id, slug);

-- Auto-populate slug on INSERT when caller didn't provide one.
CREATE OR REPLACE FUNCTION clients_set_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INT := 1;
BEGIN
  IF NEW.slug IS NOT NULL AND length(trim(NEW.slug)) > 0 THEN
    NEW.slug := slugify(NEW.slug);
    IF NEW.slug IS NULL THEN
      NEW.slug := 'client-' || substr(NEW.id::text, 1, 6);
    END IF;
  ELSE
    NEW.slug := COALESCE(slugify(NEW.name), 'client-' || substr(NEW.id::text, 1, 6));
  END IF;

  base_slug := NEW.slug;
  candidate := base_slug;
  WHILE EXISTS (
    SELECT 1 FROM clients
    WHERE business_id = NEW.business_id AND slug = candidate AND id <> NEW.id
  ) LOOP
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS clients_set_slug_trg ON clients;
CREATE TRIGGER clients_set_slug_trg
  BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION clients_set_slug();

-- ── galleries.slug backfill (column already exists) ──────────────────────
WITH base AS (
  SELECT id, business_id, client_id, name,
         COALESCE(slug, slugify(name), 'gallery-' || substr(id::text, 1, 6)) AS s
  FROM galleries
  WHERE slug IS NULL OR length(trim(slug)) = 0
),
ranked AS (
  SELECT id, business_id, client_id, s,
         ROW_NUMBER() OVER (PARTITION BY business_id, client_id, s ORDER BY id) AS rn
  FROM base
)
UPDATE galleries g
SET slug = CASE WHEN r.rn = 1 THEN r.s ELSE r.s || '-' || r.rn END
FROM ranked r
WHERE g.id = r.id;

-- Unique gallery slug per (business, client). Galleries already enforce
-- their own uniqueness if a constraint exists; this is a best-effort hint
-- (not enforced as a constraint in case there is legacy duplication).
CREATE INDEX IF NOT EXISTS galleries_business_client_slug_idx
  ON galleries(business_id, client_id, slug);

COMMIT;
