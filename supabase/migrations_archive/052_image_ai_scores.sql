-- 052_image_ai_scores.sql
-- Per-image AI scoring cache for the deep Feed Studio. Filled by
-- /api/score-images via Claude vision. Read by /api/generate-feed and the
-- Gallery Deep Dive view. Rows are idempotent: only top_picks ever score,
-- and once scored we never re-score (the photographer can re-trigger from
-- the UI; that path issues a DELETE first).

BEGIN;

CREATE TABLE IF NOT EXISTS image_ai_scores (
  image_id          UUID PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
  hero_score        NUMERIC(3,1) NOT NULL CHECK (hero_score        BETWEEN 0 AND 10),
  carousel_score    NUMERIC(3,1) NOT NULL CHECK (carousel_score    BETWEEN 0 AND 10),
  story_score       NUMERIC(3,1) NOT NULL CHECK (story_score       BETWEEN 0 AND 10),
  atmosphere_score  NUMERIC(3,1) NOT NULL CHECK (atmosphere_score  BETWEEN 0 AND 10),
  people_density    NUMERIC(3,1) NOT NULL CHECK (people_density    BETWEEN 0 AND 10),
  brand_fit         NUMERIC(3,1) NOT NULL CHECK (brand_fit         BETWEEN 0 AND 10),
  social_potential  NUMERIC(3,1) NOT NULL CHECK (social_potential  BETWEEN 0 AND 10),
  suggested_usage   TEXT NOT NULL CHECK (suggested_usage IN
    ('hero','support','carousel_anchor','story_only','background','ignore')),
  suggested_crop_focal_x NUMERIC(3,2) NOT NULL DEFAULT 0.5
    CHECK (suggested_crop_focal_x BETWEEN 0 AND 1),
  suggested_crop_focal_y NUMERIC(3,2) NOT NULL DEFAULT 0.5
    CHECK (suggested_crop_focal_y BETWEEN 0 AND 1),
  rationale_he      TEXT NOT NULL,
  scored_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  scored_by_model   TEXT NOT NULL DEFAULT 'claude-sonnet-4-6'
);

CREATE INDEX IF NOT EXISTS image_ai_scores_usage_idx ON image_ai_scores(suggested_usage);

ALTER TABLE image_ai_scores ENABLE ROW LEVEL SECURITY;

-- Read: anyone — scores power the public client-dashboard Gallery Deep Dive view.
CREATE POLICY image_scores_public_read ON image_ai_scores
  FOR SELECT TO anon, authenticated USING (true);

-- Write: service-role only. The scoring endpoint runs server-side with the
-- service-role key, so we deliberately don't grant insert/update to anon
-- or authenticated. (No INSERT/UPDATE/DELETE policies = blocked for those roles.)

COMMIT;
