-- title: Zone waste summary by block and establishment kind
-- concepts: INNER JOIN x6, GROUP BY, SUM / COUNT(DISTINCT), date-range filter
-- purpose: The zone administrator's headline table: for the last 30 days, how much food each block wasted, split by the kind of establishment, and what it cost. It feeds the zone-comparison chart on the dashboard.
-- mode: select
-- reading: One row per block and establishment kind; waste_kg and cost_inr are 30-day totals. Read down a block to see which kind dominates, and compare blocks to find the zone's hot spots.
SELECT b.zone_name                              AS block,
       ec.kind                                  AS establishment_kind,
       COUNT(DISTINCT e.establishment_id)       AS establishments,
       ROUND(SUM(w.quantity_kg), 1)             AS waste_kg,
       ROUND(SUM(w.cost_estimate))              AS cost_inr
  FROM waste_event w
  JOIN waste_reason wr          ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
  JOIN establishment e          ON e.establishment_id = w.establishment_id
  JOIN establishment_category ec ON ec.category_id = e.category_id
  JOIN zone street              ON street.zone_id = e.zone_id
  JOIN zone b                   ON b.zone_id = street.parent_zone_id
 WHERE w.occurred_on BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE
 GROUP BY b.zone_name, ec.kind
 ORDER BY b.zone_name, waste_kg DESC;
