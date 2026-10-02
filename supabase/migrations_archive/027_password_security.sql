-- ─────────────────────────────────────────────────────────────────────────────
-- 025_password_security.sql
-- Move gallery passwords out of the anon-readable delivery_settings JSONB and
-- into a server-side-only password_hash column. Anonymous viewers verify
-- passwords via verify_gallery_password() RPC instead of comparing locally.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE galleries ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Backfill: hash any existing plaintext passwords from delivery_settings.
UPDATE galleries
   SET password_hash = extensions.crypt(delivery_settings->>'password', extensions.gen_salt('bf', 10))
 WHERE password_hash IS NULL
   AND delivery_settings ? 'password'
   AND COALESCE(NULLIF(delivery_settings->>'password', ''), NULL) IS NOT NULL;

-- Strip the plaintext password from delivery_settings so anon SELECT can no
-- longer return it.
UPDATE galleries
   SET delivery_settings = delivery_settings - 'password'
 WHERE delivery_settings ? 'password';

-- Verify a candidate password against the gallery's stored hash. Runs as
-- SECURITY DEFINER so anon does not need direct SELECT on password_hash.
-- Returns false for unknown galleries, galleries without a password set,
-- or wrong passwords.
CREATE OR REPLACE FUNCTION verify_gallery_password(
  p_gallery_id UUID,
  p_password   TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_hash TEXT;
  gallery_status TEXT;
BEGIN
  SELECT password_hash, status INTO stored_hash, gallery_status
    FROM galleries WHERE id = p_gallery_id;
  IF stored_hash IS NULL THEN RETURN FALSE; END IF;
  IF gallery_status <> 'live' THEN RETURN FALSE; END IF;
  IF p_password IS NULL OR length(p_password) = 0 THEN RETURN FALSE; END IF;
  RETURN extensions.crypt(p_password, stored_hash) = stored_hash;
END;
$$;

REVOKE EXECUTE ON FUNCTION verify_gallery_password(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION verify_gallery_password(UUID, TEXT) TO anon, authenticated;

-- Owner-only RPC to set / clear a gallery password. Keeps the plaintext off
-- the wire from the photographer's app: the client calls this RPC with the
-- raw password and the server hashes it.
CREATE OR REPLACE FUNCTION set_gallery_password(
  p_gallery_id UUID,
  p_password   TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  owner_business UUID;
  caller_business UUID;
BEGIN
  SELECT business_id INTO owner_business FROM galleries WHERE id = p_gallery_id;
  IF owner_business IS NULL THEN
    RAISE EXCEPTION 'Gallery not found';
  END IF;
  SELECT id INTO caller_business FROM businesses WHERE user_id = auth.uid() LIMIT 1;
  IF caller_business IS NULL OR caller_business <> owner_business THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_password IS NULL OR length(p_password) = 0 THEN
    UPDATE galleries SET password_hash = NULL WHERE id = p_gallery_id;
  ELSE
    UPDATE galleries
       SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10))
     WHERE id = p_gallery_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_gallery_password(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION set_gallery_password(UUID, TEXT) TO authenticated;

COMMIT;
