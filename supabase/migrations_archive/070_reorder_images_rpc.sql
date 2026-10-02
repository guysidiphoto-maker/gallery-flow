-- 070_reorder_images_rpc.sql
--
-- Batched image reorder RPC.
--
-- Before: dashboard drag-reorder fanned out N parallel `update` calls (one
-- per image in the visible set). A 500-photo wedding section drop = 500
-- concurrent UPDATE round-trips → Supabase rate-limit risk, partial-failure
-- inconsistencies (some rows committed, some not), no atomicity.
--
-- After: a single SECURITY DEFINER RPC that takes parallel `p_ids` /
-- `p_orders` arrays and performs ONE bulk UPDATE inside a transaction.
-- Ownership is enforced explicitly (gallery.business_id =
-- current_business_id()), and the WHERE clause is scoped to p_gallery_id
-- so a caller cannot smuggle in image IDs from a different gallery (which
-- would otherwise pass the per-row business check if the attacker happened
-- to own that other gallery too — defense in depth).
--
-- Returns the number of rows updated. The caller compares this to
-- expected_count and toasts a partial-failure warning if they differ.

BEGIN;

CREATE OR REPLACE FUNCTION public.reorder_images(
  p_gallery_id UUID,
  p_ids        UUID[],
  p_orders     INT[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_owner_id    UUID;
  v_updated     INT;
BEGIN
  -- Length-mismatch → bail out with 0 (caller treats as failure and shows
  -- the partial-failure toast). RAISE NOTICE so it surfaces in pg logs for
  -- the operator to debug a misbehaving client.
  IF p_ids IS NULL OR p_orders IS NULL OR array_length(p_ids, 1) IS DISTINCT FROM array_length(p_orders, 1) THEN
    RAISE NOTICE 'reorder_images: length mismatch (ids=%, orders=%)',
      coalesce(array_length(p_ids, 1), 0),
      coalesce(array_length(p_orders, 1), 0);
    RETURN 0;
  END IF;

  -- Empty list → trivial success (0 rows touched, nothing to do).
  IF array_length(p_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  -- Resolve the caller's business via the same helper RLS uses. Running
  -- SECURITY DEFINER means we don't get the per-row USING/CHECK on images
  -- for free, so we re-derive ownership here.
  v_business_id := public.current_business_id();
  IF v_business_id IS NULL THEN
    RAISE NOTICE 'reorder_images: no current_business_id (unauthenticated?)';
    RETURN 0;
  END IF;

  -- Verify the gallery belongs to the caller's business. Without this an
  -- authenticated user could bulk-shuffle another studio's gallery.
  SELECT g.business_id INTO v_owner_id
  FROM   public.galleries g
  WHERE  g.id = p_gallery_id;

  IF v_owner_id IS NULL OR v_owner_id <> v_business_id THEN
    RAISE NOTICE 'reorder_images: gallery % not owned by business %',
      p_gallery_id, v_business_id;
    RETURN 0;
  END IF;

  -- Single bulk UPDATE. unnest()-with-two-args zips the two arrays into a
  -- (id, new_order) virtual table; the join filters out any id that
  -- doesn't belong to this gallery (paranoia + ensures the returned row
  -- count reflects actual matches, not silently-skipped foreign IDs).
  WITH pairs AS (
    SELECT * FROM unnest(p_ids, p_orders) AS u(id, new_order)
  )
  UPDATE public.images i
  SET    sort_order = pairs.new_order
  FROM   pairs
  WHERE  i.id = pairs.id
    AND  i.gallery_id = p_gallery_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Lock down: only authenticated owners may call this. SECURITY DEFINER
-- functions inherit the function-owner role's privileges, so the EXECUTE
-- grant is what actually gates access.
REVOKE ALL ON FUNCTION public.reorder_images(UUID, UUID[], INT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_images(UUID, UUID[], INT[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reorder_images(UUID, UUID[], INT[]) TO authenticated;

COMMENT ON FUNCTION public.reorder_images(UUID, UUID[], INT[]) IS
  'Batched image reorder. Returns rows updated. Caller compares to expected to detect partial failure. Owner-gated via current_business_id() + gallery business_id check.';

COMMIT;
