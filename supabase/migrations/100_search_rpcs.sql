-- 098_search_rpcs.sql — Client Portal V2: owner global search (metadata-first).
--
-- ORDERING DEPENDENCY: apply migration 097 (gallery event metadata) BEFORE 098.
-- This migration's RPC and two of its indexes reference the 097 columns on
-- `galleries`: event_size_bucket, industry, venue_type, time_of_day,
-- event_keywords. On QA (`pixflow-cpv2-qa2`): 097 first, then 098.
--
-- What this adds (contract C5):
--   * pg_trgm extension + GIN trigram indexes on galleries.name / clients.name
--     (ILIKE '%q%' works for Hebrew and English; trigram GIN makes it indexed).
--   * Partial btree indexes on the metadata filter columns.
--   * RPC `search_owner_content(p_query, p_filters)` — SECURITY DEFINER,
--     self-scoped exactly like the 092 `cpv2_owner_*` family: the business is
--     resolved from auth.uid() internally, so the owner UI calls it with its
--     own session and can never read another business's data. Fails CLOSED
--     (empty result structure) when the caller has no business. Returns no
--     secrets (no hashes, no delivery_settings blob, no member emails).
--
-- Matching is plain ILIKE substring, metadata-first. NO semantic/embedding
-- behavior is implemented or claimed.
--
-- NOT APPLIED by this program. Paired rollback: 098_search_rpcs_rollback.sql

BEGIN;

-- ── 1. Trigram support ───────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS galleries_name_trgm_idx
  ON public.galleries USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS clients_name_trgm_idx
  ON public.clients USING gin (name gin_trgm_ops);

-- ── 2. Filter-column btree indexes (partial: NULL = Unclassified, never
--       indexed, never matched by a filter) ──────────────────────────────────
CREATE INDEX IF NOT EXISTS galleries_event_type_filter_idx
  ON public.galleries (event_type) WHERE event_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS galleries_event_size_bucket_idx
  ON public.galleries (event_size_bucket) WHERE event_size_bucket IS NOT NULL;

CREATE INDEX IF NOT EXISTS galleries_industry_idx
  ON public.galleries (industry) WHERE industry IS NOT NULL;

-- ── 3. The search RPC ────────────────────────────────────────────────────────
-- p_query:   free text. Trimmed; length >= 1 → ILIKE '%q%' against
--            clients.name, galleries.name, galleries.client_name,
--            galleries.event_location, galleries.event_type, images.filename.
--            Empty query + filters → filter-only gallery browse (cap 200).
-- p_filters: jsonb object, all keys optional (contract C5):
--            client_id, status ('live'|'draft'), assigned (bool), event_type,
--            event_size_bucket, industry, venue_type, time_of_day,
--            year_from, year_to (event_date year), keywords (text[] overlap
--            with event_keywords), imported_source (matches
--            delivery_settings->'importSource'->>'provider').
--            Unknown keys and malformed values are IGNORED (never an error,
--            never a wider result than the valid filters allow).
-- Returns:   {clients:[...], galleries:[...], images:[...]} with per-row
--            match_reason text[] (['name','event_location',...]).
--            Caps: clients 50, galleries 200, images 60.
CREATE OR REPLACE FUNCTION public.search_owner_content(
  p_query   text,
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_business_id uuid;
  v_q           text;
  v_pattern     text := NULL;   -- NULL → no text matching (filter-only browse)

  f_client_id         uuid;
  f_status            text;
  f_assigned          boolean;
  f_event_type        text;
  f_event_size_bucket text;
  f_industry          text;
  f_venue_type        text;
  f_time_of_day       text;
  f_year_from         int;
  f_year_to           int;
  f_keywords          text[];
  f_imported_source   text;

  v_clients   jsonb := '[]'::jsonb;
  v_galleries jsonb := '[]'::jsonb;
  v_images    jsonb := '[]'::jsonb;
BEGIN
  -- Tenant resolution. Fail CLOSED: no business → empty structure, not error.
  SELECT id INTO v_business_id
  FROM public.businesses
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RETURN jsonb_build_object(
      'clients', '[]'::jsonb, 'galleries', '[]'::jsonb, 'images', '[]'::jsonb);
  END IF;

  -- Query normalization: trim; escape ILIKE wildcards so 'a_b' matches
  -- literally. Hebrew and English both work: ILIKE is byte-order-agnostic
  -- substring matching over UTF-8 text.
  v_q := btrim(coalesce(p_query, ''));
  IF char_length(v_q) >= 1 THEN
    v_pattern := '%' ||
      replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  -- Filter extraction. Every value is validated; anything malformed is
  -- silently dropped (treated as "filter not set").
  p_filters := coalesce(p_filters, '{}'::jsonb);

  IF (p_filters->>'client_id') ~*
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    f_client_id := (p_filters->>'client_id')::uuid;
  END IF;

  IF p_filters->>'status' IN ('live', 'draft') THEN
    f_status := p_filters->>'status';
  END IF;

  IF jsonb_typeof(p_filters->'assigned') = 'boolean' THEN
    f_assigned := (p_filters->>'assigned')::boolean;
  END IF;

  f_event_type := left(nullif(btrim(coalesce(p_filters->>'event_type', '')), ''), 60);
  f_industry   := left(nullif(btrim(coalesce(p_filters->>'industry',   '')), ''), 60);

  IF p_filters->>'event_size_bucket' IN
     ('intimate', 'small', 'medium', 'large', 'massive') THEN
    f_event_size_bucket := p_filters->>'event_size_bucket';
  END IF;

  IF p_filters->>'venue_type' IN ('indoor', 'outdoor', 'mixed') THEN
    f_venue_type := p_filters->>'venue_type';
  END IF;

  IF p_filters->>'time_of_day' IN ('day', 'night', 'mixed') THEN
    f_time_of_day := p_filters->>'time_of_day';
  END IF;

  IF (p_filters->>'year_from') ~ '^\d{4}$' THEN
    f_year_from := (p_filters->>'year_from')::int;
  END IF;

  IF (p_filters->>'year_to') ~ '^\d{4}$' THEN
    f_year_to := (p_filters->>'year_to')::int;
  END IF;

  IF jsonb_typeof(p_filters->'keywords') = 'array' THEN
    SELECT array_agg(DISTINCT btrim(x)) INTO f_keywords
    FROM jsonb_array_elements_text(p_filters->'keywords') AS t(x)
    WHERE btrim(x) <> '';
  END IF;

  f_imported_source := left(nullif(btrim(coalesce(p_filters->>'imported_source', '')), ''), 40);

  -- ── Galleries: text match (when query present) AND every set filter.
  --    Empty query = filter-only browse over the same predicate set.
  SELECT coalesce(jsonb_agg(sub.row_j
           ORDER BY sub.ord_date DESC NULLS LAST, sub.ord_name), '[]'::jsonb)
  INTO v_galleries
  FROM (
    SELECT
      jsonb_build_object(
        'id',                g.id,
        'name',              g.name,
        'slug',              g.slug,
        'status',            g.status::text,
        'client_id',         g.client_id,
        'client_name',       coalesce(c.name, g.client_name),
        'event_date',        g.event_date,
        'event_type',        g.event_type,
        'event_location',    g.event_location,
        'event_size_bucket', g.event_size_bucket,
        'industry',          g.industry,
        'image_count',       g.image_count,
        'match_reason',      coalesce(to_jsonb(array_remove(ARRAY[
            CASE WHEN v_pattern IS NOT NULL AND g.name ILIKE v_pattern
                 THEN 'name' END,
            CASE WHEN v_pattern IS NOT NULL
                  AND coalesce(c.name, g.client_name) ILIKE v_pattern
                 THEN 'client_name' END,
            CASE WHEN v_pattern IS NOT NULL AND g.event_location ILIKE v_pattern
                 THEN 'event_location' END,
            CASE WHEN v_pattern IS NOT NULL AND g.event_type ILIKE v_pattern
                 THEN 'event_type' END
          ]::text[], NULL)), '[]'::jsonb)
      ) AS row_j,
      g.event_date AS ord_date,
      g.name       AS ord_name
    FROM public.galleries g
    LEFT JOIN public.clients c ON c.id = g.client_id
    WHERE g.business_id = v_business_id
      AND (v_pattern IS NULL OR (
               g.name ILIKE v_pattern
            OR coalesce(c.name, g.client_name) ILIKE v_pattern
            OR g.event_location ILIKE v_pattern
            OR g.event_type ILIKE v_pattern))
      AND (f_client_id IS NULL         OR g.client_id = f_client_id)
      AND (f_status IS NULL            OR g.status::text = f_status)
      AND (f_assigned IS NULL
           OR (f_assigned     AND g.client_id IS NOT NULL)
           OR (NOT f_assigned AND g.client_id IS NULL))
      AND (f_event_type IS NULL        OR g.event_type ILIKE f_event_type)
      AND (f_event_size_bucket IS NULL OR g.event_size_bucket = f_event_size_bucket)
      AND (f_industry IS NULL          OR g.industry ILIKE ('%' || f_industry || '%'))
      AND (f_venue_type IS NULL        OR g.venue_type = f_venue_type)
      AND (f_time_of_day IS NULL       OR g.time_of_day = f_time_of_day)
      AND (f_year_from IS NULL
           OR (g.event_date IS NOT NULL AND extract(year FROM g.event_date) >= f_year_from))
      AND (f_year_to IS NULL
           OR (g.event_date IS NOT NULL AND extract(year FROM g.event_date) <= f_year_to))
      AND (f_keywords IS NULL          OR g.event_keywords && f_keywords)
      AND (f_imported_source IS NULL
           OR g.delivery_settings->'importSource'->>'provider' = f_imported_source)
    ORDER BY g.event_date DESC NULLS LAST, g.name
    LIMIT 200
  ) sub;

  -- ── Clients + images: only meaningful with a text query.
  IF v_pattern IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id',           s.id,
             'name',         s.name,
             'slug',         s.slug,
             'match_reason', jsonb_build_array('name'))
             ORDER BY s.name), '[]'::jsonb)
    INTO v_clients
    FROM (
      SELECT c.id, c.name, c.slug
      FROM public.clients c
      WHERE c.business_id = v_business_id
        AND c.name ILIKE v_pattern
      ORDER BY c.name
      LIMIT 50
    ) s;

    -- Images: filename match, joined through the caller's galleries (never
    -- cross-tenant), same gallery filters applied, hard cap 60 rows,
    -- thumbnail path only (never original/full collection loads).
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id',             s.id,
             'gallery_id',     s.gallery_id,
             'gallery_name',   s.gallery_name,
             'filename',       s.filename,
             'thumbnail_path', s.thumbnail_path,
             'match_reason',   jsonb_build_array('filename'))), '[]'::jsonb)
    INTO v_images
    FROM (
      SELECT i.id, i.gallery_id, g.name AS gallery_name, i.filename,
             coalesce(i.thumbnail_path, i.web_preview_path) AS thumbnail_path
      FROM public.images i
      JOIN public.galleries g ON g.id = i.gallery_id
      WHERE g.business_id = v_business_id
        AND i.filename ILIKE v_pattern
        AND (f_client_id IS NULL         OR g.client_id = f_client_id)
        AND (f_status IS NULL            OR g.status::text = f_status)
        AND (f_assigned IS NULL
             OR (f_assigned     AND g.client_id IS NOT NULL)
             OR (NOT f_assigned AND g.client_id IS NULL))
        AND (f_event_type IS NULL        OR g.event_type ILIKE f_event_type)
        AND (f_event_size_bucket IS NULL OR g.event_size_bucket = f_event_size_bucket)
        AND (f_industry IS NULL          OR g.industry ILIKE ('%' || f_industry || '%'))
        AND (f_venue_type IS NULL        OR g.venue_type = f_venue_type)
        AND (f_time_of_day IS NULL       OR g.time_of_day = f_time_of_day)
        AND (f_year_from IS NULL
             OR (g.event_date IS NOT NULL AND extract(year FROM g.event_date) >= f_year_from))
        AND (f_year_to IS NULL
             OR (g.event_date IS NOT NULL AND extract(year FROM g.event_date) <= f_year_to))
        AND (f_keywords IS NULL          OR g.event_keywords && f_keywords)
        AND (f_imported_source IS NULL
             OR g.delivery_settings->'importSource'->>'provider' = f_imported_source)
      ORDER BY g.name, i.sort_order, i.filename
      LIMIT 60
    ) s;
  END IF;

  RETURN jsonb_build_object(
    'clients',   v_clients,
    'galleries', v_galleries,
    'images',    v_images);
END $$;

-- ── 4. Least privilege — same posture as the 092 owner RPCs ─────────────────
REVOKE EXECUTE ON FUNCTION public.search_owner_content(text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.search_owner_content(text, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.search_owner_content(text, jsonb) IS
  'Owner-side global search (CPV2). Self-scoped via auth.uid() -> businesses; '
  'ILIKE metadata matching over clients/galleries/images with jsonb filters. '
  'Fails closed to an empty result when the caller has no business.';

COMMIT;

-- Verification (manual, QA only):
--   As owner JWT:   SELECT public.search_owner_content('דנה', '{}');
--                   → only the caller''s rows, each with match_reason.
--   Filter browse:  SELECT public.search_owner_content('', '{"status":"live","assigned":true}');
--   As anon:        SELECT public.search_owner_content('x', '{}');  → permission denied.
--   No business:    authenticated user without businesses row → {"clients":[],"galleries":[],"images":[]}.
