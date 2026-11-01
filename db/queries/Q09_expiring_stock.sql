-- title: Stock expiring soon, ranked by value at risk
-- concepts: partial index (idx_lot_expiry), computed ORDER BY expression, CASE bucketing, RANK()
-- purpose: The morning "use it or lose it" list. Only lots with stock left and expiring within 7 days are scanned (that is exactly what the partial index idx_lot_expiry covers), bucketed into under 24 h / 72 h / 7 days and ranked by the money that would be lost.
-- mode: select
-- reading: Rows are the biggest losses about to happen. urgency says how soon, and value_rank is the window RANK() by money at risk.
SELECT e.name                                  AS establishment,
       fi.canonical_name                       AS food,
       l.remaining_qty                         AS qty_left,
       fi.base_unit,
       ROUND(l.remaining_qty * l.unit_cost)    AS value_at_risk_inr,
       ROUND(EXTRACT(EPOCH FROM (l.expires_at - now())) / 3600)::int AS hours_left,
       CASE WHEN l.expires_at <= now() + interval '24 hours' THEN 'under 24 h'
            WHEN l.expires_at <= now() + interval '72 hours' THEN 'under 72 h'
            ELSE 'under 7 days' END            AS urgency,
       RANK() OVER (ORDER BY l.remaining_qty * l.unit_cost DESC) AS value_rank
  FROM inventory_lot l
  JOIN food_item fi     ON fi.food_id = l.food_id
  JOIN establishment e  ON e.establishment_id = l.establishment_id
 WHERE l.remaining_qty > 0
   AND l.expires_at > now()
   AND l.expires_at <= now() + interval '7 days'
 ORDER BY l.remaining_qty * l.unit_cost DESC
 LIMIT 15;
