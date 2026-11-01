-- title: Chronic over-preparers (utilisation below 75% on at least 10 sessions)
-- concepts: view (v_preparation_efficiency), JOIN, GROUP BY, HAVING COUNT(*)
-- purpose: The single most actionable metric: kitchens that habitually cook far more than they serve. The view already joins sessions, batches and consumption, so the query is short; HAVING keeps only repeat offenders, not one bad day.
-- mode: select
-- reading: Each row is an establishment with at least 10 sessions below 75% utilisation. poor_sessions says how often, unconsumed_kg what that cost in food.
SELECT e.name,
       ec.category_name,
       COUNT(*)                          AS poor_sessions,
       ROUND(AVG(v.utilisation_pct), 1)  AS avg_utilisation_pct,
       ROUND(SUM(v.unconsumed_kg))       AS unconsumed_kg
  FROM v_preparation_efficiency v
  JOIN establishment e           ON e.establishment_id = v.establishment_id
  JOIN establishment_category ec ON ec.category_id = e.category_id
 WHERE v.utilisation_pct < 75
 GROUP BY e.establishment_id, e.name, ec.category_name
HAVING COUNT(*) >= 10
 ORDER BY poor_sessions DESC;
