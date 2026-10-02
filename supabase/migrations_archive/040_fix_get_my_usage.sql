-- ─────────────────────────────────────────────────────────────────────────────
-- 040_fix_get_my_usage.sql
-- Fix get_my_usage() — it was summing original_size from a non-existent
-- `images.metadata` JSONB column, which made every call to the function
-- return a 404 (PostgREST bubbles up "column does not exist" as a generic
-- 404). The correct column has been `original_size_bytes` since
-- migration 003. Symptom in production: the photographer's quota widget
-- never renders, plan-gating before publish silently no-ops.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION get_my_usage()
RETURNS TABLE (
  storage_used_bytes BIGINT,
  storage_limit_bytes BIGINT,
  galleries_count INTEGER,
  max_galleries INTEGER,
  photos_this_month INTEGER,
  max_photos_per_month INTEGER,
  plan_id TEXT,
  plan_name TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH biz AS (
    SELECT current_business_id() AS id
  ),
  plan_info AS (
    SELECT p.id, p.name, p.max_galleries, p.max_photos_per_month, p.storage_limit_bytes
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.business_id = (SELECT id FROM biz)
      AND s.status IN ('active', 'trial')
    LIMIT 1
  ),
  storage_used AS (
    -- Sum across the three asset tiers we actually persist sizes for.
    SELECT COALESCE(SUM(
      COALESCE(i.thumbnail_size_bytes, 0) +
      COALESCE(i.web_preview_size_bytes, 0) +
      COALESCE(i.original_size_bytes, 0)
    ), 0) AS used_bytes
    FROM images i
    JOIN galleries g ON g.id = i.gallery_id
    WHERE g.business_id = (SELECT id FROM biz)
  ),
  gallery_count AS (
    SELECT COUNT(*)::INTEGER AS count
    FROM galleries
    WHERE business_id = (SELECT id FROM biz)
  ),
  month_usage AS (
    SELECT COALESCE(photos_uploaded, 0) AS photos
    FROM monthly_usage
    WHERE business_id = (SELECT id FROM biz)
      AND period_start = DATE_TRUNC('month', CURRENT_DATE)::DATE
  )
  SELECT
    (SELECT used_bytes FROM storage_used)::BIGINT,
    pi.storage_limit_bytes,
    (SELECT count FROM gallery_count),
    pi.max_galleries,
    COALESCE((SELECT photos FROM month_usage), 0)::INTEGER,
    pi.max_photos_per_month,
    pi.id,
    pi.name
  FROM plan_info pi
$$;

GRANT EXECUTE ON FUNCTION get_my_usage() TO authenticated;

COMMIT;
