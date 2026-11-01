-- title: Suppliers whose deliveries most often end in spoilage
-- concepts: multi-hop JOIN (supplier -> procurement -> line -> lot -> waste), conditional SUM, HAVING on volume
-- purpose: Traces a spoiled kilogram back to the supplier that delivered it, through the lot it came from. The Part 1 data plants one supplier whose produce spoils about three times as often; this query finds it. HAVING ignores suppliers with too little volume to judge.
-- mode: select
-- reading: spoilage_rate_pct = spoilage kilograms traced to lots from that supplier / kilograms received. An outlier supplier stands out immediately.
SELECT s.name                                                       AS supplier,
       s.supplier_type,
       ROUND(SUM(l.received_qty))                                   AS received_kg,
       ROUND(COALESCE(SUM(sp.spoiled_kg), 0))                       AS spoiled_kg,
       ROUND(100.0 * COALESCE(SUM(sp.spoiled_kg), 0) / SUM(l.received_qty), 2) AS spoilage_rate_pct
  FROM supplier s
  JOIN procurement p        ON p.supplier_id = s.supplier_id
  JOIN procurement_line pl  ON pl.procurement_id = p.procurement_id
  JOIN inventory_lot l      ON l.source_line_id = pl.line_id
  LEFT JOIN LATERAL (
        SELECT SUM(w.quantity_kg) AS spoiled_kg
          FROM waste_event w
          JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code = 'SPOILAGE'
         WHERE w.lot_id = l.lot_id) sp ON TRUE
 GROUP BY s.supplier_id, s.name, s.supplier_type
HAVING SUM(l.received_qty) > 500
 ORDER BY spoilage_rate_pct DESC;
