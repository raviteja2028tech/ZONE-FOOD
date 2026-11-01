-- title: Recursive roll-up of waste through the zone hierarchy
-- concepts: WITH RECURSIVE (tree traversal), LEFT JOIN, GROUP BY on tree depth, self-referencing foreign key
-- purpose: The locality is a tree (sector -> block -> street). A recursive CTE walks from the root down to any depth, and the figures of every street roll up to the blocks and sector above it. The same query works if a new level is added; no code change.
-- mode: select
-- reading: An indented tree. own_kg is waste recorded directly at that zone (streets only); rolled_up_kg includes every descendant, so the sector row equals the sum of its blocks.
WITH RECURSIVE subtree AS (
  SELECT zone_id, parent_zone_id, zone_name, 0 AS depth, zone_name::text AS path
    FROM zone WHERE parent_zone_id IS NULL
  UNION ALL
  SELECT z.zone_id, z.parent_zone_id, z.zone_name, s.depth + 1, s.path || ' > ' || z.zone_name
    FROM zone z JOIN subtree s ON z.parent_zone_id = s.zone_id
), street_waste AS (
  SELECT e.zone_id, SUM(w.quantity_kg) AS kg, COUNT(DISTINCT e.establishment_id) AS estabs
    FROM establishment e
    JOIN waste_event w ON w.establishment_id = e.establishment_id AND w.occurred_on >= CURRENT_DATE - 30
    JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
   GROUP BY e.zone_id
)
SELECT s.depth,
       repeat('  ', s.depth) || s.zone_name        AS zone,
       COALESCE(SUM(sw.kg) FILTER (WHERE sw.zone_id = s.zone_id), 0)    AS own_kg,
       ROUND((SELECT COALESCE(SUM(sw2.kg), 0)
                FROM street_waste sw2
                JOIN subtree d ON d.zone_id = sw2.zone_id
               WHERE d.path = s.path OR d.path LIKE s.path || ' > %'))   AS rolled_up_kg
  FROM subtree s
  LEFT JOIN street_waste sw ON sw.zone_id = s.zone_id
 GROUP BY s.zone_id, s.zone_name, s.depth, s.path
 ORDER BY s.path;
