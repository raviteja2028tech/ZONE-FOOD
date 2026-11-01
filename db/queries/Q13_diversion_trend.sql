-- title: Diversion rate by month with month-on-month change
-- concepts: materialised view (mv_zone_monthly), window function LAG(), derived percentage
-- purpose: The sustainability headline: the share of waste kept out of landfill (composted, biogas, animal feed, donated). The monthly roll-up is precomputed in a materialised view, so this reads a few hundred rows instead of scanning every waste event; LAG() turns it into a trend.
-- mode: select
-- reading: diversion_pct per month; change_vs_prev_month_pts is the LAG() difference (positive = improving). The first month has no previous value, so it is NULL.
WITH monthly AS (
  SELECT month, SUM(waste_kg) AS waste_kg, SUM(diverted_kg) AS diverted_kg
    FROM mv_zone_monthly
   GROUP BY month
)
SELECT month,
       ROUND(waste_kg)                                         AS waste_kg,
       ROUND(100 * diverted_kg / NULLIF(waste_kg, 0), 1)       AS diversion_pct,
       ROUND(100 * diverted_kg / NULLIF(waste_kg, 0)
             - LAG(100 * diverted_kg / NULLIF(waste_kg, 0)) OVER (ORDER BY month), 1) AS change_vs_prev_month_pts
  FROM monthly
 ORDER BY month;
