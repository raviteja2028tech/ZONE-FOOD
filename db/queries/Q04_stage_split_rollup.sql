-- title: Pre- versus post-consumer waste per kind, with a grand total
-- concepts: GROUP BY ROLLUP, FILTER (WHERE ...), CASE, enum-to-text cast
-- purpose: Where in the pipeline is food lost - before it reaches the customer (prep, spoilage, expiry) or after (plates, service leftovers)? Different fixes apply. ROLLUP adds the zone-wide total row without a second query.
-- mode: select
-- reading: One row per kind plus the ALL KINDS total added by ROLLUP. A pre_consumer_pct near 100 means food is lost before service (preparation, spoilage, expiry); a low value means it is lost on plates and counters.
SELECT COALESCE(ec.kind::text, 'ALL KINDS')                                                     AS establishment_kind,
       ROUND(SUM(w.quantity_kg) FILTER (WHERE w.stage::text LIKE 'PRE_%'), 1)                   AS pre_consumer_kg,
       ROUND(SUM(w.quantity_kg) FILTER (WHERE w.stage::text LIKE 'POST_%'), 1)                  AS post_consumer_kg,
       ROUND(SUM(w.quantity_kg), 1)                                                             AS total_kg,
       ROUND(100.0 * SUM(w.quantity_kg) FILTER (WHERE w.stage::text LIKE 'PRE_%') / SUM(w.quantity_kg), 1) AS pre_consumer_pct
  FROM waste_event w
  JOIN waste_reason wr           ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
  JOIN establishment e           ON e.establishment_id = w.establishment_id
  JOIN establishment_category ec ON ec.category_id = e.category_id
 WHERE w.occurred_on >= CURRENT_DATE - 90
 GROUP BY ROLLUP (ec.kind)
 ORDER BY ec.kind NULLS LAST;
