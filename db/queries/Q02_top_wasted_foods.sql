-- title: Top 10 wasted foods with share of the zone total
-- concepts: CTE, window SUM() OVER () and running total, subquery, ORDER BY ... LIMIT
-- purpose: Which foods hurt most? The window function divides each food by the zone-wide total (computed over ALL foods, before LIMIT), and the running total shows how concentrated the problem is - it feeds the "Most wasted foods" ranked bars.
-- mode: select
-- reading: Each row is a food. pct_of_zone_total is its share of ALL waste (not just of the top 10); cumulative_pct shows how few foods account for most of the problem.
WITH per_food AS (
  SELECT fi.canonical_name AS food, SUM(w.quantity_kg) AS kg, SUM(w.cost_estimate) AS cost
    FROM waste_event w
    JOIN food_item fi    ON fi.food_id = w.food_id
    JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
   WHERE w.occurred_on >= CURRENT_DATE - 30
   GROUP BY fi.canonical_name
)
SELECT food,
       ROUND(kg, 1)                                            AS waste_kg,
       ROUND(100 * kg / SUM(kg) OVER (), 2)                    AS pct_of_zone_total,
       ROUND(100 * SUM(kg) OVER (ORDER BY kg DESC) / SUM(kg) OVER (), 2) AS cumulative_pct,
       ROUND(cost)                                             AS cost_inr
  FROM per_food
 ORDER BY kg DESC
 LIMIT 10;
