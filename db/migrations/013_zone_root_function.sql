-- 013: stored function used by the matching rules.
-- zone_root(z) walks the locality hierarchy (street -> block -> sector) with a recursive CTE and returns the
-- top-level zone id. Two zones with the same root belong to the same locality, which is the hard "same area"
-- constraint applied BEFORE any semantic ranking (Master Plan B2.9).
CREATE OR REPLACE FUNCTION zone_root(p_zone_id INT) RETURNS INT
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE up AS (
    SELECT zone_id, parent_zone_id FROM zone WHERE zone_id = p_zone_id
    UNION ALL
    SELECT z.zone_id, z.parent_zone_id FROM zone z JOIN up ON z.zone_id = up.parent_zone_id
  )
  SELECT zone_id FROM up WHERE parent_zone_id IS NULL
$$;

COMMENT ON FUNCTION zone_root(INT) IS 'Top-level ancestor of a zone (recursive CTE over zone.parent_zone_id).';
