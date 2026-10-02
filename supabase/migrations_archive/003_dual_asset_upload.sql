-- Migration: Dual-asset upload system
-- Separates preview pipeline from original pipeline

-- Rename storage_path → web_preview_path (semantic clarity)
ALTER TABLE images RENAME COLUMN storage_path TO web_preview_path;

-- Track per-image original upload status
ALTER TABLE images ADD COLUMN IF NOT EXISTS original_uploaded BOOLEAN DEFAULT false;
ALTER TABLE images ADD COLUMN IF NOT EXISTS original_size_bytes BIGINT;

-- Gallery-level readiness flags
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS preview_ready BOOLEAN DEFAULT false;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS originals_ready BOOLEAN DEFAULT false;
