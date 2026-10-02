-- Migration 004: Production-grade dual-asset upload schema
-- Upgrades images and galleries for Pixieset-level publish system

-- ── Images table upgrades ───────────────────────────────────────────────────

-- Per-asset upload tracking
ALTER TABLE images ADD COLUMN IF NOT EXISTS thumbnail_uploaded BOOLEAN DEFAULT false;
ALTER TABLE images ADD COLUMN IF NOT EXISTS thumbnail_size_bytes BIGINT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS web_preview_uploaded BOOLEAN DEFAULT false;
ALTER TABLE images ADD COLUMN IF NOT EXISTS web_preview_size_bytes BIGINT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS original_upload_method TEXT CHECK (original_upload_method IN ('standard', 'tus'));
ALTER TABLE images ADD COLUMN IF NOT EXISTS original_failed_reason TEXT;

-- Image metadata
ALTER TABLE images ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE images ADD COLUMN IF NOT EXISTS height INTEGER;
ALTER TABLE images ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- Per-image status tracking
ALTER TABLE images ADD COLUMN IF NOT EXISTS upload_status TEXT DEFAULT 'pending'
  CHECK (upload_status IN ('pending', 'generating_assets', 'uploading_thumbnail', 'uploading_preview', 'preview_ready', 'uploading_original', 'original_ready', 'original_failed', 'failed'));
ALTER TABLE images ADD COLUMN IF NOT EXISTS preview_ready BOOLEAN DEFAULT false;
ALTER TABLE images ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── Galleries table upgrades ────────────────────────────────────────────────

-- Granular publish status (replaces simple 'status' for internal tracking)
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS publish_status TEXT DEFAULT 'draft'
  CHECK (publish_status IN ('draft', 'preparing_assets', 'uploading_previews', 'preview_live', 'uploading_originals', 'fully_live', 'partially_failed', 'failed'));

-- Upload counters
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS total_images INTEGER DEFAULT 0;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS preview_uploaded_count INTEGER DEFAULT 0;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS original_uploaded_count INTEGER DEFAULT 0;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS original_failed_count INTEGER DEFAULT 0;

-- Recovery tracking
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS last_upload_resume_at TIMESTAMPTZ;
