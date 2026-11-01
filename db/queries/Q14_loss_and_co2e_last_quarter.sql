-- title: Monetary loss and CO2e per establishment, last full quarter
-- concepts: SUM over trigger-derived columns, date_trunc on quarters, view reuse, derived ratio
-- purpose: Turns kilograms into money and carbon. Cost and CO2e were filled in by database trigger T2 at insert time, so a report re-run next year reproduces today's numbers even if prices change. The quarter boundaries come from date_trunc('quarter', ...), not hard-coded dates.
-- mode: select
-- reading: Last complete quarter's losses per establishment; inr_per_kg shows how expensive the wasted food is, not only how much of it there is.
SELECT v.name,
       ROUND(SUM(v.total_waste_kg))                         AS waste_kg,
       ROUND(SUM(v.cost_lost))                              AS cost_lost_inr,
       ROUND(SUM(v.co2e_kg))                                AS co2e_kg,
       ROUND(SUM(v.cost_lost) / NULLIF(SUM(v.total_waste_kg), 0), 1) AS inr_per_kg
  FROM v_daily_waste v
 WHERE v.occurred_on >= date_trunc('quarter', CURRENT_DATE) - interval '3 months'
   AND v.occurred_on <  date_trunc('quarter', CURRENT_DATE)
 GROUP BY v.establishment_id, v.name
 ORDER BY cost_lost_inr DESC
 LIMIT 15;
