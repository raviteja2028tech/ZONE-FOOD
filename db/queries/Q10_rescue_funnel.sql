-- title: Rescue funnel - offered, requested, approved, collected
-- concepts: two aggregating CTEs, LEFT JOIN, conditional aggregates (FILTER), division with NULLIF
-- purpose: How much of the food offered for rescue actually reaches people, by establishment kind? Listings and claims are aggregated separately and joined afterwards, so a listing with several claims is never counted several times (the classic join-fan-out bug).
-- mode: select
-- reading: One row per kind, from listings offered down to kilograms actually collected. rescue_rate_pct is collected over offered.
WITH offered AS (
  SELECT ec.kind, COUNT(*) AS listings, SUM(sl.offered_qty_kg) AS offered_kg
    FROM surplus_listing sl
    JOIN establishment e ON e.establishment_id = sl.establishment_id
    JOIN establishment_category ec ON ec.category_id = e.category_id
   WHERE sl.status <> 'CANCELLED'
   GROUP BY ec.kind
), claimed AS (
  SELECT ec.kind,
         COUNT(*)                                                         AS claims,
         COUNT(*) FILTER (WHERE rc.status IN ('APPROVED', 'COLLECTED'))   AS approved,
         COUNT(*) FILTER (WHERE rc.status = 'COLLECTED')                  AS collected,
         COALESCE(SUM(rc.claimed_qty_kg) FILTER (WHERE rc.status = 'COLLECTED'), 0) AS collected_kg
    FROM redistribution_claim rc
    JOIN surplus_listing sl ON sl.listing_id = rc.listing_id
    JOIN establishment e ON e.establishment_id = sl.establishment_id
    JOIN establishment_category ec ON ec.category_id = e.category_id
   GROUP BY ec.kind
)
SELECT o.kind,
       o.listings,
       ROUND(o.offered_kg)                                   AS offered_kg,
       COALESCE(c.claims, 0)                                 AS claims,
       COALESCE(c.approved, 0)                               AS approved,
       COALESCE(c.collected, 0)                              AS collected,
       ROUND(COALESCE(c.collected_kg, 0))                    AS collected_kg,
       ROUND(100.0 * COALESCE(c.collected_kg, 0) / NULLIF(o.offered_kg, 0), 1) AS rescue_rate_pct
  FROM offered o
  LEFT JOIN claimed c ON c.kind = o.kind
 ORDER BY rescue_rate_pct DESC NULLS LAST;
