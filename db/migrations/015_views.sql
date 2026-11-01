-- 015: views and a materialised view for the summaries the application and the query catalogue repeat.
-- "Waste" here means food that was NOT rescued: rows whose reason is REDISTRIBUTED (food handed to a recipient)
-- are excluded, exactly as the application dashboards define it.

-- Per-establishment daily roll-up, normalised by capacity.
CREATE VIEW v_daily_waste AS
SELECT e.establishment_id,
       e.name,
       e.zone_id,
       ec.kind,
       w.occurred_on,
       SUM(w.quantity_kg)                                        AS total_waste_kg,
       COALESCE(SUM(w.quantity_kg) FILTER (WHERE w.was_edible), 0) AS edible_waste_kg,
       COALESCE(SUM(w.quantity_kg) FILTER (WHERE dr.is_diversion), 0) AS diverted_kg,
       COALESCE(SUM(w.cost_estimate), 0)                         AS cost_lost,
       COALESCE(SUM(w.co2e_estimate), 0)                         AS co2e_kg,
       ROUND(SUM(w.quantity_kg) / e.capacity, 4)                 AS waste_kg_per_capita
  FROM waste_event w
  JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
  JOIN establishment e ON e.establishment_id = w.establishment_id
  JOIN establishment_category ec ON ec.category_id = e.category_id
  JOIN disposal_route dr ON dr.route_id = w.route_id
 GROUP BY e.establishment_id, e.name, e.zone_id, ec.kind, w.occurred_on, e.capacity;

-- Over-preparation: how much of what was cooked was actually served, and how the turnout compared to the forecast.
CREATE VIEW v_preparation_efficiency AS
SELECT ss.session_id,
       ss.establishment_id,
       ss.service_date,
       ss.slot,
       SUM(pb.prepared_qty_kg)                                    AS prepared_kg,
       SUM(cr.served_qty_kg)                                      AS served_kg,
       SUM(cr.leftover_qty_kg + cr.plate_waste_kg)                AS unconsumed_kg,
       ROUND(100.0 * SUM(cr.served_qty_kg) / NULLIF(SUM(pb.prepared_qty_kg), 0), 2) AS utilisation_pct,
       ss.expected_headcount,
       ss.actual_headcount,
       ROUND(100.0 * ss.actual_headcount / NULLIF(ss.expected_headcount, 0), 2) AS turnout_pct
  FROM service_session ss
  JOIN preparation_batch pb ON pb.session_id = ss.session_id
  JOIN consumption_record cr ON cr.batch_id = pb.batch_id
 WHERE ss.is_closed
 GROUP BY ss.session_id, ss.establishment_id, ss.service_date, ss.slot, ss.expected_headcount, ss.actual_headcount;

-- Redistribution funnel per establishment. The collected quantity and first pickup are computed per listing
-- first (LATERAL), so a listing with several collected claims is not double-counted in the totals.
CREATE VIEW v_redistribution_performance AS
SELECT sl.establishment_id,
       COUNT(*)                                                  AS listings,
       SUM(sl.offered_qty_kg)                                    AS offered_kg,
       SUM(sl.claimed_qty_kg)                                    AS reserved_kg,
       COALESCE(SUM(c.collected_kg), 0)                          AS collected_kg,
       ROUND(100.0 * COALESCE(SUM(c.collected_kg), 0) / NULLIF(SUM(sl.offered_qty_kg), 0), 2) AS rescue_rate_pct,
       ROUND(AVG(EXTRACT(EPOCH FROM (c.first_pickup - sl.created_at)) / 3600)::numeric, 2) AS avg_hours_to_pickup
  FROM surplus_listing sl
  LEFT JOIN LATERAL (
        SELECT SUM(rc.claimed_qty_kg) AS collected_kg, MIN(rc.collected_at) AS first_pickup
          FROM redistribution_claim rc
         WHERE rc.listing_id = sl.listing_id AND rc.status = 'COLLECTED') c ON TRUE
 WHERE sl.status <> 'CANCELLED'
 GROUP BY sl.establishment_id;

-- Expensive zone roll-up by month and establishment kind: materialised, refreshed on demand
-- (REFRESH MATERIALIZED VIEW CONCURRENTLY mv_zone_monthly; the unique index below is what permits CONCURRENTLY).
CREATE MATERIALIZED VIEW mv_zone_monthly AS
SELECT z.zone_id,
       z.zone_name,
       ec.kind,
       date_trunc('month', w.occurred_on)::date                  AS month,
       SUM(w.quantity_kg)                                        AS waste_kg,
       COALESCE(SUM(w.quantity_kg) FILTER (WHERE dr.is_diversion), 0) AS diverted_kg,
       COALESCE(SUM(w.cost_estimate), 0)                         AS cost_lost,
       COUNT(DISTINCT w.establishment_id)                        AS reporting_estabs
  FROM waste_event w
  JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
  JOIN establishment e ON e.establishment_id = w.establishment_id
  JOIN establishment_category ec ON ec.category_id = e.category_id
  JOIN zone z ON z.zone_id = e.zone_id
  JOIN disposal_route dr ON dr.route_id = w.route_id
 GROUP BY z.zone_id, z.zone_name, ec.kind, date_trunc('month', w.occurred_on)::date
  WITH DATA;

CREATE UNIQUE INDEX uq_mv_zone_monthly ON mv_zone_monthly (zone_id, kind, month);

COMMENT ON VIEW v_daily_waste IS 'Per-establishment per-day waste (excl. redistributed food), edible/diverted split, cost, CO2e, per-capita.';
COMMENT ON VIEW v_preparation_efficiency IS 'Per closed session: prepared vs served kg, utilisation %, turnout % vs expected headcount.';
COMMENT ON VIEW v_redistribution_performance IS 'Per establishment: listings, offered/reserved/collected kg, rescue rate, hours to first pickup.';
COMMENT ON MATERIALIZED VIEW mv_zone_monthly IS 'Street-level waste by month and kind. Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_zone_monthly.';
