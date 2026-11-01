-- title: Peer rank and percentile within each establishment category
-- concepts: RANK() and PERCENT_RANK() with PARTITION BY, window over a grouped result, multi-table JOIN
-- purpose: "Am I wasting more than comparable kitchens?" Ranking happens inside each category (partition), on kilograms per unit of capacity, so a 40-seat cafe and a 1,200-seat mess are never compared raw. Rank 1 is the worst performer in its category.
-- mode: select
-- reading: worst_rank 1 = highest waste per capita in the category; percentile is PERCENT_RANK (1.00 = worst, 0.00 = best).
SELECT e.name,
       ec.category_name,
       ROUND(SUM(w.quantity_kg) / e.capacity, 3)                                          AS kg_per_capita,
       RANK() OVER (PARTITION BY ec.category_id ORDER BY SUM(w.quantity_kg) / e.capacity DESC)         AS worst_rank,
       ROUND((PERCENT_RANK() OVER (PARTITION BY ec.category_id ORDER BY SUM(w.quantity_kg) / e.capacity))::numeric, 2) AS percentile
  FROM waste_event w
  JOIN waste_reason wr           ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
  JOIN establishment e           ON e.establishment_id = w.establishment_id
  JOIN establishment_category ec ON ec.category_id = e.category_id
 WHERE w.occurred_on >= CURRENT_DATE - 90
 GROUP BY e.establishment_id, e.name, e.capacity, ec.category_id, ec.category_name
 ORDER BY ec.category_name, worst_rank
 LIMIT 30;
