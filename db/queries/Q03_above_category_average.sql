-- title: Establishments above their own category's per-capita waste average
-- concepts: correlated subquery inside HAVING, nested aggregate, multi-table JOIN
-- purpose: Fair benchmarking: a hospital kitchen is compared with hospital kitchens, not with a corner cafe. The inner query is re-evaluated for each establishment's category (the correlation on ec.category_id), and only establishments worse than that average over the last 90 days are shown - the "needs attention" list.
-- mode: select
-- reading: Only establishments worse than their own category's average appear. The larger kg_per_capita, the further above comparable kitchens. The category average comes from the correlated subquery.
SELECT e.name,
       ec.category_name,
       ROUND(SUM(w.quantity_kg) / e.capacity, 3) AS kg_per_capita
  FROM waste_event w
  JOIN waste_reason wr           ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
  JOIN establishment e           ON e.establishment_id = w.establishment_id
  JOIN establishment_category ec ON ec.category_id = e.category_id
 WHERE w.occurred_on >= CURRENT_DATE - 90
 GROUP BY e.establishment_id, e.name, e.capacity, ec.category_id, ec.category_name
HAVING SUM(w.quantity_kg) / e.capacity > (
        SELECT AVG(sub.per_cap)
          FROM (SELECT SUM(w2.quantity_kg) / e2.capacity AS per_cap
                  FROM waste_event w2
                  JOIN waste_reason wr2 ON wr2.reason_id = w2.reason_id AND wr2.reason_code <> 'REDISTRIBUTED'
                  JOIN establishment e2 ON e2.establishment_id = w2.establishment_id
                 WHERE e2.category_id = ec.category_id          -- <- the correlation
                   AND w2.occurred_on >= CURRENT_DATE - 90
                 GROUP BY e2.establishment_id, e2.capacity) sub)
 ORDER BY kg_per_capita DESC;
