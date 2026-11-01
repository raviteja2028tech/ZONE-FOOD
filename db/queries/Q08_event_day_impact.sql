-- title: Waste on locality-event days versus ordinary days
-- concepts: recursive CTE (zone ancestors), M:N join through zone_event, generate_series, CASE aggregation
-- purpose: Do festivals, exams and holidays change how much food is wasted? Events are attached to a sector or block, while waste is recorded at street level, so a recursive CTE first lists every ancestor of each street. Each day is then classed as an event day or not for that establishment, and the averages are compared.
-- mode: select
-- reading: day_type is the event type active on that street that day, or NO EVENT. Compare avg_kg_per_capita across rows: a type above NO EVENT means that kind of event increases waste (event types that cover few days are based on fewer observations).
WITH RECURSIVE ancestors AS (
  SELECT zone_id, zone_id AS ancestor_id FROM zone
  UNION ALL
  SELECT a.zone_id, z.parent_zone_id FROM ancestors a JOIN zone z ON z.zone_id = a.ancestor_id
   WHERE z.parent_zone_id IS NOT NULL
), event_days AS (
  SELECT DISTINCT an.zone_id AS street_id, le.event_type, d::date AS day
    FROM locality_event le
    JOIN zone_event ze ON ze.event_id = le.event_id
    JOIN ancestors an  ON an.ancestor_id = ze.zone_id
   CROSS JOIN LATERAL generate_series(le.start_date, le.end_date, interval '1 day') d
)
SELECT COALESCE(ed.event_type, 'NO EVENT')                       AS day_type,
       COUNT(*)                                                  AS establishment_days,
       ROUND(AVG(v.total_waste_kg), 2)                           AS avg_kg_per_establishment_day,
       ROUND(AVG(v.waste_kg_per_capita), 4)                      AS avg_kg_per_capita
  FROM v_daily_waste v
  LEFT JOIN event_days ed ON ed.street_id = v.zone_id AND ed.day = v.occurred_on
 GROUP BY COALESCE(ed.event_type, 'NO EVENT')
 ORDER BY avg_kg_per_capita DESC;
