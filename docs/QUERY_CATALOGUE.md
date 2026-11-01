# SQL query catalogue

_Generated 2026-11-01 19:29 by `python scripts/gen_part3_docs.py` - every query below was **executed** against the live PostgreSQL database and the output shown is what it returned. Source: `db/queries/Qnn_*.sql`._

**27 of 27 queries executed and returned rows.** The PDF asks for 22; ZoneFood has 27: 23 analytical queries (Q21 is a data-provenance report; the PDF's forecast-accuracy query is Q27, which reads the stored forecast run) plus four data-manipulation statements (Q23-Q26). DML queries are always run inside a transaction that is **rolled back**, so running the catalogue never changes your data.

Run one yourself: `python scripts/catalogue.py Q03` · all: `python scripts/catalogue.py` · or in the app: **DBMS Lab** page (zone admin / auditor).

## Index

| # | Title | Mode | Rows | ms |
|---|---|---|---|---|
| Q01 | Zone waste summary by block and establishment kind | select | 22 | 31 |
| Q02 | Top 10 wasted foods with share of the zone total | select | 10 | 15 |
| Q03 | Establishments above their own category's per-capita waste average | select | 29 | 1654 |
| Q04 | Pre- versus post-consumer waste per kind, with a grand total | select | 8 | 30 |
| Q05 | Chronic over-preparers (utilisation below 75% on at least 10 sessions) | select | 32 | 45 |
| Q06 | Turnout versus utilisation correlation per establishment | select | 15 | 54 |
| Q07 | Day-of-week waste profile | select | 7 | 34 |
| Q08 | Waste on locality-event days versus ordinary days | select | 6 | 95 |
| Q09 | Stock expiring soon, ranked by value at risk | select | 15 | 5 |
| Q10 | Rescue funnel - offered, requested, approved, collected | select | 5 | 9 |
| Q11 | Recipients with idle capacity while surplus expired unclaimed nearby | select | 2 | 12 |
| Q12 | Median hours from listing to pickup, per establishment kind | select | 5 | 8 |
| Q13 | Diversion rate by month with month-on-month change | select | 6 | 4 |
| Q14 | Monetary loss and CO2e per establishment, last full quarter | select | 15 | 73 |
| Q15 | Anomalous waste days (z-score above 2.5 against the trailing 28 days) | select | 15 | 74 |
| Q16 | Rolling 7-day average waste for one establishment | select | 21 | 8 |
| Q17 | Peer rank and percentile within each establishment category | select | 30 | 22 |
| Q18 | Recursive roll-up of waste through the zone hierarchy | select | 31 | 12 |
| Q19 | Ingredient-level exposure to wasted dishes | select | 11 | 98 |
| Q20 | Suppliers whose deliveries most often end in spoilage | select | 9 | 987 |
| Q21 | Data provenance - how each establishment kind's waste figures were captured | select | 7 | 47 |
| Q22 | Semantic top-5 recipients for a listing (pgvector) | select | 5 | 9 |
| Q23 | INSERT ... SELECT - list near-expiry, still-edible stock as surplus | dml | 3 | 38 |
| Q24 | UPDATE - mark listings that passed their expiry as EXPIRED | dml | 12 | 14 |
| Q25 | DELETE with a subquery - purge one imported document's rows so it can be re-synced | dml | 3 | 52 |
| Q26 | INSERT ... ON CONFLICT (upsert) - teach the name matcher a new alias | dml | 1 | 10 |
| Q27 | Forecast accuracy per model (MAE, RMSE, MAPE) on the held-out test days | select | 3 | 7 |

## DBMS-feature coverage

| Feature | Queries |
|---|---|
| SELECT | Q01-Q22, Q27 |
| INSERT (… SELECT, RETURNING) | Q23 |
| INSERT … ON CONFLICT (upsert) | Q26 |
| UPDATE | Q24 |
| DELETE | Q25 |
| INNER JOIN, multi-table (4–7 tables) | Q01, Q03, Q10, Q12, Q17, Q19, Q20 |
| LEFT JOIN | Q08, Q10, Q16, Q18, Q20 |
| GROUP BY / HAVING | Q01, Q03, Q05, Q06, Q19, Q20 |
| Aggregates (SUM, AVG, COUNT, CORR, PERCENTILE_CONT, STDDEV_SAMP) | Q01, Q06, Q12, Q15 |
| Nested subquery | Q02, Q03, Q22, Q25 |
| Correlated subquery | Q03 |
| EXISTS / NOT EXISTS (anti-join), LATERAL | Q11, Q20, Q22 |
| Window functions | Q02, Q09, Q13, Q15, Q16, Q17 |
| ROLLUP / FILTER | Q04, Q10, Q21 |
| Recursive CTE | Q08, Q18 (and function zone_root() used by Q11, Q22) |
| Views / materialised view | Q05–Q08, Q13–Q16 |
| Date-based analytics | Q01, Q07, Q09, Q14, Q16 |
| Locality-based analytics | Q01, Q08, Q11, Q18, Q22 |
| pgvector semantic search | Q22 |

## Q01 - Zone waste summary by block and establishment kind

**DBMS concepts:** INNER JOIN x6, GROUP BY, SUM / COUNT(DISTINCT), date-range filter

**Purpose in ZoneFood:** The zone administrator's headline table: for the last 30 days, how much food each block wasted, split by the kind of establishment, and what it cost. It feeds the zone-comparison chart on the dashboard.

```sql
SELECT b.zone_name                              AS block,
       ec.kind                                  AS establishment_kind,
       COUNT(DISTINCT e.establishment_id)       AS establishments,
       ROUND(SUM(w.quantity_kg), 1)             AS waste_kg,
       ROUND(SUM(w.cost_estimate))              AS cost_inr
  FROM waste_event w
  JOIN waste_reason wr          ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
  JOIN establishment e          ON e.establishment_id = w.establishment_id
  JOIN establishment_category ec ON ec.category_id = e.category_id
  JOIN zone street              ON street.zone_id = e.zone_id
  JOIN zone b                   ON b.zone_id = street.parent_zone_id
 WHERE w.occurred_on BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE
 GROUP BY b.zone_name, ec.kind
 ORDER BY b.zone_name, waste_kg DESC;
```

**Result** (22 row(s) in 31 ms - first 8 shown):

| block | establishment_kind | establishments | waste_kg | cost_inr |
|---|---|---|---|---|
| Block A | EDUCATIONAL | 1 | 8014.8 | 701102 |
| Block A | COMMERCIAL | 4 | 2883.3 | 418303 |
| Block A | RESIDENTIAL | 6 | 2331.0 | 41212 |
| Block B | EDUCATIONAL | 2 | 7044.7 | 614927 |
| Block B | COMMERCIAL | 5 | 2873.8 | 407783 |
| Block B | RESIDENTIAL | 5 | 2103.3 | 42359 |
| Block C | COMMERCIAL | 3 | 1264.5 | 157136 |
| Block C | RESIDENTIAL | 3 | 387.0 | 7912 |

**Explanation:** One row per block and establishment kind; waste_kg and cost_inr are 30-day totals. Read down a block to see which kind dominates, and compare blocks to find the zone's hot spots.

## Q02 - Top 10 wasted foods with share of the zone total

**DBMS concepts:** CTE, window SUM() OVER () and running total, subquery, ORDER BY ... LIMIT

**Purpose in ZoneFood:** Which foods hurt most? The window function divides each food by the zone-wide total (computed over ALL foods, before LIMIT), and the running total shows how concentrated the problem is - it feeds the "Most wasted foods" ranked bars.

```sql
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
```

**Result** (10 row(s) in 15 ms - first 8 shown):

| food | waste_kg | pct_of_zone_total | cumulative_pct | cost_inr |
|---|---|---|---|---|
| Idli | 5164.4 | 9.66 | 9.66 | 361506 |
| Upma | 3754.9 | 7.02 | 16.68 | 281615 |
| Steamed Rice | 3379.5 | 6.32 | 23.00 | 236567 |
| Dal Tadka | 3259.1 | 6.10 | 29.10 | 342205 |
| Chapati | 3116.1 | 5.83 | 34.93 | 249287 |
| Veg Biryani | 3078.6 | 5.76 | 40.69 | 461790 |
| Mixed Veg Curry | 2805.9 | 5.25 | 45.94 | 266558 |
| Onion | 2311.7 | 4.32 | 50.26 | 80909 |

**Explanation:** Each row is a food. pct_of_zone_total is its share of ALL waste (not just of the top 10); cumulative_pct shows how few foods account for most of the problem.

## Q03 - Establishments above their own category's per-capita waste average

**DBMS concepts:** correlated subquery inside HAVING, nested aggregate, multi-table JOIN

**Purpose in ZoneFood:** Fair benchmarking: a hospital kitchen is compared with hospital kitchens, not with a corner cafe. The inner query is re-evaluated for each establishment's category (the correlation on ec.category_id), and only establishments worse than that average over the last 90 days are shown - the "needs attention" list.

```sql
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
```

**Result** (29 row(s) in 1654 ms - first 8 shown):

| name | category_name | kg_per_capita |
|---|---|---|
| Lifeline Care Hospital Kitchen | Hospital Kitchen | 47.581 |
| Rice Bowl Co. | Quick Service | 31.982 |
| Wrap Express | Quick Service | 31.544 |
| Biryani House No. 9 | Casual Dining | 29.152 |
| Spice Route Kitchen | Casual Dining | 28.809 |
| Annapurna Family Restaurant | Casual Dining | 28.407 |
| The Saffron Table | Fine Dining | 18.303 |
| Orchid Terrace | Fine Dining | 18.291 |

**Explanation:** Only establishments worse than their own category's average appear. The larger kg_per_capita, the further above comparable kitchens. The category average comes from the correlated subquery.

## Q04 - Pre- versus post-consumer waste per kind, with a grand total

**DBMS concepts:** GROUP BY ROLLUP, FILTER (WHERE ...), CASE, enum-to-text cast

**Purpose in ZoneFood:** Where in the pipeline is food lost - before it reaches the customer (prep, spoilage, expiry) or after (plates, service leftovers)? Different fixes apply. ROLLUP adds the zone-wide total row without a second query.

```sql
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
```

**Result** (8 row(s) in 30 ms):

| establishment_kind | pre_consumer_kg | post_consumer_kg | total_kg | pre_consumer_pct |
|---|---|---|---|---|
| COMMERCIAL | 5472.0 | 24315.3 | 29787.3 | 18.4 |
| EDUCATIONAL | 11122.5 | 59139.4 | 70261.9 | 15.8 |
| ORGANIZATIONAL | 2623.4 | 9120.8 | 11744.3 | 22.3 |
| RESIDENTIAL | 12740.5 | 5109.1 | 17849.6 | 71.4 |
| RECREATIONAL | 422.0 | 2799.5 | 3221.5 | 13.1 |
| RETAIL_FOOD | 440.6 | 891.8 | 1332.4 | 33.1 |
| HEALTHCARE | 2493.7 | 17277.2 | 19770.9 | 12.6 |
| ALL KINDS | 35314.7 | 118653.2 | 153968.0 | 22.9 |

**Explanation:** One row per kind plus the ALL KINDS total added by ROLLUP. A pre_consumer_pct near 100 means food is lost before service (preparation, spoilage, expiry); a low value means it is lost on plates and counters.

## Q05 - Chronic over-preparers (utilisation below 75% on at least 10 sessions)

**DBMS concepts:** view (v_preparation_efficiency), JOIN, GROUP BY, HAVING COUNT(*)

**Purpose in ZoneFood:** The single most actionable metric: kitchens that habitually cook far more than they serve. The view already joins sessions, batches and consumption, so the query is short; HAVING keeps only repeat offenders, not one bad day.

```sql
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
```

**Result** (32 row(s) in 45 ms - first 8 shown):

| name | category_name | poor_sessions | avg_utilisation_pct | unconsumed_kg |
|---|---|---|---|---|
| Little Oven Bakery | Cafe & Bakery | 103 | 64.8 | 353 |
| The Chai Loft | Cafe & Bakery | 91 | 64.0 | 449 |
| Morning Glory Cafe | Cafe & Bakery | 89 | 64.8 | 478 |
| Brew & Crumb | Cafe & Bakery | 86 | 63.5 | 397 |
| Biryani House No. 9 | Casual Dining | 77 | 61.9 | 2097 |
| Annapurna Family Restaurant | Casual Dining | 75 | 65.2 | 2640 |
| Spice Route Kitchen | Casual Dining | 73 | 65.4 | 2112 |
| Greenfield Academy Canteen | School Canteen | 71 | 61.1 | 10156 |

**Explanation:** Each row is an establishment with at least 10 sessions below 75% utilisation. poor_sessions says how often, unconsumed_kg what that cost in food.

## Q06 - Turnout versus utilisation correlation per establishment

**DBMS concepts:** CORR() statistical aggregate, view, HAVING on sample size

**Purpose in ZoneFood:** If kitchens cooked in proportion to who actually turned up, utilisation would not depend on turnout. A strongly positive correlation means the kitchen's quantities are not following attendance - its forecasts are the problem. Establishments with fewer than 30 sessions are skipped (too little evidence).

```sql
SELECT e.name,
       COUNT(*)                                          AS sessions,
       ROUND(CORR(v.turnout_pct, v.utilisation_pct)::numeric, 3) AS turnout_utilisation_corr,
       ROUND(AVG(v.turnout_pct), 1)                      AS avg_turnout_pct
  FROM v_preparation_efficiency v
  JOIN establishment e ON e.establishment_id = v.establishment_id
 WHERE v.turnout_pct IS NOT NULL AND v.utilisation_pct IS NOT NULL
 GROUP BY e.establishment_id, e.name
HAVING COUNT(*) >= 30
 ORDER BY turnout_utilisation_corr DESC NULLS LAST
 LIMIT 15;
```

**Result** (15 row(s) in 54 ms - first 8 shown):

| name | sessions | turnout_utilisation_corr | avg_turnout_pct |
|---|---|---|---|
| Greenfield Academy Canteen | 108 | 0.960 | 95.5 |
| Dosa Junction | 300 | 0.950 | 97.6 |
| Biryani House No. 9 | 300 | 0.949 | 96.3 |
| Little Oven Bakery | 300 | 0.948 | 96.9 |
| Sunrise Public School Canteen | 108 | 0.944 | 93.6 |
| Brew & Crumb | 300 | 0.943 | 97.8 |
| FreshMart Supermarket | 150 | 0.943 | 97.5 |
| Morning Glory Cafe | 300 | 0.942 | 98.1 |

**Explanation:** A strongly positive turnout_utilisation_corr means utilisation rises and falls with attendance: the kitchen prepares roughly the same amount whoever turns up. A value near 0 means preparation already adapts to attendance.

## Q07 - Day-of-week waste profile

**DBMS concepts:** EXTRACT(DOW), GROUP BY, ORDER BY, derived average per calendar day

**Purpose in ZoneFood:** Restaurants peak on weekends, colleges drop on Sundays. The weekly rhythm tells kitchens which days to prepare less. Averages are per calendar day (total / number of distinct days), so a weekday with more occurrences is not unfairly larger.

```sql
SELECT EXTRACT(DOW FROM occurred_on)::int                    AS dow,
       TRIM(to_char(occurred_on, 'Day'))                     AS weekday,
       COUNT(DISTINCT occurred_on)                           AS days_observed,
       ROUND(SUM(total_waste_kg))                            AS total_kg,
       ROUND(SUM(total_waste_kg) / COUNT(DISTINCT occurred_on)) AS avg_kg_per_day
  FROM v_daily_waste
 WHERE occurred_on >= CURRENT_DATE - 90
 GROUP BY EXTRACT(DOW FROM occurred_on), TRIM(to_char(occurred_on, 'Day'))
 ORDER BY dow;
```

**Result** (7 row(s) in 34 ms):

| dow | weekday | days_observed | total_kg | avg_kg_per_day |
|---|---|---|---|---|
| 0 | Sunday | 13 | 17256 | 1327 |
| 1 | Monday | 13 | 22104 | 1700 |
| 2 | Tuesday | 13 | 23446 | 1804 |
| 3 | Wednesday | 13 | 25039 | 1926 |
| 4 | Thursday | 13 | 22950 | 1765 |
| 5 | Friday | 13 | 24102 | 1854 |
| 6 | Saturday | 12 | 19070 | 1589 |

**Explanation:** avg_kg_per_day puts weekdays on equal footing (dow 0 = Sunday). A day well above the others is where to cut preparation.

## Q08 - Waste on locality-event days versus ordinary days

**DBMS concepts:** recursive CTE (zone ancestors), M:N join through zone_event, generate_series, CASE aggregation

**Purpose in ZoneFood:** Do festivals, exams and holidays change how much food is wasted? Events are attached to a sector or block, while waste is recorded at street level, so a recursive CTE first lists every ancestor of each street. Each day is then classed as an event day or not for that establishment, and the averages are compared.

```sql
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
```

**Result** (6 row(s) in 95 ms):

| day_type | establishment_days | avg_kg_per_establishment_day | avg_kg_per_capita |
|---|---|---|---|
| PUBLIC_HOLIDAY | 36 | 42.83 | 0.2887 |
| FESTIVAL | 165 | 37.82 | 0.1922 |
| EXAM_PERIOD | 1219 | 49.38 | 0.1788 |
| NO EVENT | 3898 | 45.35 | 0.1764 |
| VACATION | 1066 | 26.48 | 0.1652 |
| LOCAL_EVENT | 22 | 38.59 | 0.1232 |

**Explanation:** day_type is the event type active on that street that day, or NO EVENT. Compare avg_kg_per_capita across rows: a type above NO EVENT means that kind of event increases waste (event types that cover few days are based on fewer observations).

## Q09 - Stock expiring soon, ranked by value at risk

**DBMS concepts:** partial index (idx_lot_expiry), computed ORDER BY expression, CASE bucketing, RANK()

**Purpose in ZoneFood:** The morning "use it or lose it" list. Only lots with stock left and expiring within 7 days are scanned (that is exactly what the partial index idx_lot_expiry covers), bucketed into under 24 h / 72 h / 7 days and ranked by the money that would be lost.

```sql
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
```

**Result** (15 row(s) in 5 ms - first 8 shown):

| establishment | food | qty_left | base_unit | value_at_risk_inr | hours_left | urgency | value_rank |
|---|---|---|---|---|---|---|---|
| Northfield Engineering College Mess | Ghee | 33.715 | kg | 21372 | 35 | under 72 h | 1 |
| Northfield Engineering College Mess | Green Peas | 134.096 | kg | 12909 | 60 | under 72 h | 2 |
| Riverside Recreation Club | Sweets (Mithai) | 28.893 | kg | 11717 | 12 | under 24 h | 3 |
| Northfield Engineering College Mess | Onion | 300.380 | kg | 10429 | 59 | under 72 h | 4 |
| The Saffron Table | Sweets (Mithai) | 25.861 | kg | 10009 | 12 | under 24 h | 5 |
| Lakeside Club | Sweets (Mithai) | 27.387 | kg | 9531 | 12 | under 24 h | 6 |
| Biryani House No. 9 | Paneer | 30.180 | kg | 9441 | 35 | under 72 h | 7 |
| Northfield Engineering College Mess | Curd | 123.049 | kg | 8602 | 35 | under 72 h | 8 |

**Explanation:** Rows are the biggest losses about to happen. urgency says how soon, and value_rank is the window RANK() by money at risk.

## Q10 - Rescue funnel - offered, requested, approved, collected

**DBMS concepts:** two aggregating CTEs, LEFT JOIN, conditional aggregates (FILTER), division with NULLIF

**Purpose in ZoneFood:** How much of the food offered for rescue actually reaches people, by establishment kind? Listings and claims are aggregated separately and joined afterwards, so a listing with several claims is never counted several times (the classic join-fan-out bug).

```sql
WITH offered AS (
  SELECT ec.kind, COUNT(*) AS listings, SUM(sl.offered_qty_kg) AS offered_kg
    FROM surplus_listing sl
    JOIN establishment e ON e.establishment_id = sl.establishment_id
    JOIN establishment_category ec ON ec.category_id = e.category_id
   WHERE sl.status <> 'CANCELLED'
   GROUP BY ec.kind
), claimed AS (
  SELECT ec.kind,
         COUNT(*)                                                         AS claims,
         COUNT(*) FILTER (WHERE rc.status IN ('APPROVED', 'COLLECTED'))   AS approved,
         COUNT(*) FILTER (WHERE rc.status = 'COLLECTED')                  AS collected,
         COALESCE(SUM(rc.claimed_qty_kg) FILTER (WHERE rc.status = 'COLLECTED'), 0) AS collected_kg
    FROM redistribution_claim rc
    JOIN surplus_listing sl ON sl.listing_id = rc.listing_id
    JOIN establishment e ON e.establishment_id = sl.establishment_id
    JOIN establishment_category ec ON ec.category_id = e.category_id
   GROUP BY ec.kind
)
SELECT o.kind,
       o.listings,
       ROUND(o.offered_kg)                                   AS offered_kg,
       COALESCE(c.claims, 0)                                 AS claims,
       COALESCE(c.approved, 0)                               AS approved,
       COALESCE(c.collected, 0)                              AS collected,
       ROUND(COALESCE(c.collected_kg, 0))                    AS collected_kg,
       ROUND(100.0 * COALESCE(c.collected_kg, 0) / NULLIF(o.offered_kg, 0), 1) AS rescue_rate_pct
  FROM offered o
  LEFT JOIN claimed c ON c.kind = o.kind
 ORDER BY rescue_rate_pct DESC NULLS LAST;
```

**Result** (5 row(s) in 9 ms):

| kind | listings | offered_kg | claims | approved | collected | collected_kg | rescue_rate_pct |
|---|---|---|---|---|---|---|---|
| RETAIL_FOOD | 88 | 373 | 80 | 74 | 74 | 229 | 61.3 |
| ORGANIZATIONAL | 358 | 5672 | 364 | 334 | 333 | 3433 | 60.5 |
| EDUCATIONAL | 1632 | 37076 | 1548 | 1439 | 1437 | 22251 | 60.0 |
| COMMERCIAL | 1912 | 11964 | 1743 | 1588 | 1588 | 6737 | 56.3 |
| RECREATIONAL | 228 | 1666 | 203 | 188 | 186 | 852 | 51.1 |

**Explanation:** One row per kind, from listings offered down to kilograms actually collected. rescue_rate_pct is collected over offered.

## Q11 - Recipients with idle capacity while surplus expired unclaimed nearby

**DBMS concepts:** NOT EXISTS anti-join, LATERAL subquery, stored function zone_root() (recursive CTE), compatibility predicate

**Purpose in ZoneFood:** A matching failure report. For each recipient with no claim in progress, how many listings in its own locality expired with nobody claiming them - listings it could legally have taken (cooked-food policy respected). A high number means the marketplace is not reaching that organisation.

```sql
SELECT r.org_name,
       r.org_type,
       r.daily_capacity_kg,
       x.expired_listings,
       ROUND(x.lost_kg)  AS unclaimed_kg
  FROM recipient_org r
  JOIN LATERAL (
        SELECT COUNT(*) AS expired_listings, SUM(sl.offered_qty_kg) AS lost_kg
          FROM surplus_listing sl
          JOIN establishment e ON e.establishment_id = sl.establishment_id
         WHERE sl.status = 'EXPIRED'
           AND sl.claimed_qty_kg = 0
           AND sl.expires_at >= now() - interval '30 days'
           AND zone_root(e.zone_id) = zone_root(r.zone_id)
           AND (NOT sl.is_cooked OR r.accepts_cooked)) x ON x.expired_listings > 0
 WHERE NOT EXISTS (SELECT 1 FROM redistribution_claim rc
                    WHERE rc.recipient_id = r.recipient_id AND rc.status IN ('REQUESTED', 'APPROVED'))
 ORDER BY x.lost_kg DESC;
```

**Result** (2 row(s) in 12 ms):

| org_name | org_type | daily_capacity_kg | expired_listings | unclaimed_kg |
|---|---|---|---|---|
| Street Dog Care Trust | ANIMAL_SHELTER | 60.00 | 277 | 3719 |
| Evening Soup Run Volunteers | NGO | 150.00 | 277 | 3719 |

**Explanation:** Each row is a recipient with nothing in progress while compatible surplus in its locality expired unclaimed; unclaimed_kg quantifies the missed opportunity.

## Q12 - Median hours from listing to pickup, per establishment kind

**DBMS concepts:** ordered-set aggregate PERCENTILE_CONT, interval arithmetic, multi-table JOIN

**Purpose in ZoneFood:** Speed of rescue. The median is used instead of the mean because a few listings collected days later would distort an average. A slow kind needs earlier listing or better matching.

```sql
SELECT ec.kind,
       COUNT(*)                                                                        AS pickups,
       ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (rc.collected_at - sl.created_at)) / 3600))::numeric, 2) AS median_hours,
       ROUND((PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (rc.collected_at - sl.created_at)) / 3600))::numeric, 2) AS p90_hours
  FROM redistribution_claim rc
  JOIN surplus_listing sl        ON sl.listing_id = rc.listing_id
  JOIN establishment e           ON e.establishment_id = sl.establishment_id
  JOIN establishment_category ec ON ec.category_id = e.category_id
 WHERE rc.status = 'COLLECTED' AND rc.collected_at IS NOT NULL
 GROUP BY ec.kind
 ORDER BY median_hours;
```

**Result** (5 row(s) in 8 ms):

| kind | pickups | median_hours | p90_hours |
|---|---|---|---|
| RETAIL_FOOD | 74 | 1.55 | 2.24 |
| EDUCATIONAL | 1437 | 1.63 | 2.35 |
| ORGANIZATIONAL | 333 | 1.63 | 2.32 |
| RECREATIONAL | 186 | 1.63 | 2.33 |
| COMMERCIAL | 1588 | 1.65 | 2.30 |

**Explanation:** median_hours is the typical time from listing to pickup; p90_hours shows the slow tail.

## Q13 - Diversion rate by month with month-on-month change

**DBMS concepts:** materialised view (mv_zone_monthly), window function LAG(), derived percentage

**Purpose in ZoneFood:** The sustainability headline: the share of waste kept out of landfill (composted, biogas, animal feed, donated). The monthly roll-up is precomputed in a materialised view, so this reads a few hundred rows instead of scanning every waste event; LAG() turns it into a trend.

```sql
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
```

**Result** (6 row(s) in 4 ms):

| month | waste_kg | diversion_pct | change_vs_prev_month_pts |
|---|---|---|---|
| 2026-06-01 | 55069 | 73.0 | NULL |
| 2026-07-01 | 62039 | 74.4 | 1.5 |
| 2026-08-01 | 53860 | 72.8 | -1.6 |
| 2026-09-01 | 39477 | 73.7 | 0.9 |
| 2026-10-01 | 63391 | 72.8 | -0.9 |
| 2026-11-01 | 5 | 100.0 | 27.2 |

**Explanation:** diversion_pct per month; change_vs_prev_month_pts is the LAG() difference (positive = improving). The first month has no previous value, so it is NULL.

## Q14 - Monetary loss and CO2e per establishment, last full quarter

**DBMS concepts:** SUM over trigger-derived columns, date_trunc on quarters, view reuse, derived ratio

**Purpose in ZoneFood:** Turns kilograms into money and carbon. Cost and CO2e were filled in by database trigger T2 at insert time, so a report re-run next year reproduces today's numbers even if prices change. The quarter boundaries come from date_trunc('quarter', ...), not hard-coded dates.

```sql
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
```

**Result** (15 row(s) in 73 ms - first 8 shown):

| name | waste_kg | cost_lost_inr | co2e_kg | inr_per_kg |
|---|---|---|---|---|
| Northfield Engineering College Mess | 22489 | 1949243 | 43754 | 86.7 |
| City Science College Mess | 16998 | 1515434 | 34279 | 89.2 |
| Metro General Hospital Kitchen | 13442 | 1090372 | 27970 | 81.1 |
| Lakeview Arts College Mess | 12312 | 1040987 | 26434 | 84.6 |
| TechPark Cafeteria A | 5995 | 667629 | 11139 | 111.4 |
| Lifeline Care Hospital Kitchen | 7744 | 628501 | 15468 | 81.2 |
| Scholars Boys Hostel Mess | 6844 | 540612 | 16031 | 79.0 |
| Greenfield Academy Canteen | 5796 | 518506 | 12562 | 89.5 |

**Explanation:** Last complete quarter's losses per establishment; inr_per_kg shows how expensive the wasted food is, not only how much of it there is.

## Q15 - Anomalous waste days (z-score above 2.5 against the trailing 28 days)

**DBMS concepts:** CTE chain, window frame ROWS BETWEEN 28 PRECEDING AND 1 PRECEDING, AVG/STDDEV_SAMP OVER, z-score

**Purpose in ZoneFood:** Detect a bad day without machine learning. Each day is compared with that establishment's own previous four weeks (excluding the day itself); a z-score above 2.5 means "far above normal" - a fridge failure, a cancelled event. It feeds the anomaly list on the analytics page.

```sql
WITH stats AS (
  SELECT establishment_id, name, occurred_on, total_waste_kg AS kg,
         AVG(total_waste_kg)         OVER w AS roll_mean,
         STDDEV_SAMP(total_waste_kg) OVER w AS roll_sd
    FROM v_daily_waste
  WINDOW w AS (PARTITION BY establishment_id ORDER BY occurred_on ROWS BETWEEN 28 PRECEDING AND 1 PRECEDING)
)
SELECT name,
       occurred_on,
       ROUND(kg, 1)                                         AS kg,
       ROUND(roll_mean, 1)                                  AS expected_kg,
       ROUND((kg - roll_mean) / NULLIF(roll_sd, 0), 2)      AS z_score
  FROM stats
 WHERE roll_sd > 0 AND (kg - roll_mean) / roll_sd > 2.5
 ORDER BY z_score DESC
 LIMIT 15;
```

**Result** (15 row(s) in 74 ms - first 8 shown):

| name | occurred_on | kg | expected_kg | z_score |
|---|---|---|---|---|
| Morning Glory Cafe | 2026-09-18 | 114.6 | 7.3 | 39.24 |
| Brew & Crumb | 2026-06-05 | 12.3 | 3.8 | 27.64 |
| Orchid Heights | 2026-06-10 | 22.1 | 10.6 | 27.43 |
| Spice Route Kitchen | 2026-06-07 | 56.7 | 26.9 | 26.32 |
| Morning Glory Cafe | 2026-10-30 | 69.2 | 6.2 | 24.76 |
| Scholars Boys Hostel Mess | 2026-07-14 | 825.6 | 98.0 | 24.38 |
| Maple & Ember | 2026-06-05 | 23.0 | 12.7 | 23.25 |
| Orchid Terrace | 2026-06-06 | 29.1 | 17.3 | 17.25 |

**Explanation:** Each row is one establishment-day far above its own four-week norm (expected_kg); z_score is how many standard deviations above.

## Q16 - Rolling 7-day average waste for one establishment

**DBMS concepts:** AVG() OVER (ORDER BY ... ROWS 6 PRECEDING), window frame, LAG for day-on-day change, generate_series calendar

**Purpose in ZoneFood:** Smooths daily noise so a kitchen can see its trend (the line on the establishment performance chart). A generated calendar guarantees one row per day, so a day with no waste counts as 0 instead of silently shortening the window.

```sql
WITH calendar AS (
  SELECT d::date AS day FROM generate_series(CURRENT_DATE - 27, CURRENT_DATE - 1, interval '1 day') d
), daily AS (
  SELECT c.day, COALESCE(v.total_waste_kg, 0) AS kg
    FROM calendar c
    LEFT JOIN v_daily_waste v ON v.occurred_on = c.day AND v.establishment_id = 1
)
SELECT day,
       ROUND(kg, 1)                                                              AS kg,
       ROUND(AVG(kg) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 1) AS rolling_7d_avg,
       ROUND(kg - LAG(kg) OVER (ORDER BY day), 1)                                AS change_vs_prev_day
  FROM daily
 ORDER BY day DESC
 LIMIT 21;
```

**Result** (21 row(s) in 8 ms - first 8 shown):

| day | kg | rolling_7d_avg | change_vs_prev_day |
|---|---|---|---|
| 2026-10-31 | 0.0 | 19.9 | -21.6 |
| 2026-10-30 | 21.6 | 23.8 | 7.5 |
| 2026-10-29 | 14.1 | 23.8 | -14.5 |
| 2026-10-28 | 28.6 | 23.3 | -13.9 |
| 2026-10-27 | 42.5 | 20.7 | 19.5 |
| 2026-10-26 | 23.0 | 15.3 | 13.2 |
| 2026-10-25 | 9.8 | 13.5 | -17.4 |
| 2026-10-24 | 27.2 | 13.9 | 5.9 |

**Explanation:** Newest day first. rolling_7d_avg smooths the daily kg; change_vs_prev_day shows jumps. The oldest displayed row's change is NULL only if no earlier day exists in the calendar CTE.

## Q17 - Peer rank and percentile within each establishment category

**DBMS concepts:** RANK() and PERCENT_RANK() with PARTITION BY, window over a grouped result, multi-table JOIN

**Purpose in ZoneFood:** "Am I wasting more than comparable kitchens?" Ranking happens inside each category (partition), on kilograms per unit of capacity, so a 40-seat cafe and a 1,200-seat mess are never compared raw. Rank 1 is the worst performer in its category.

```sql
SELECT e.name,
       ec.category_name,
       ROUND(SUM(w.quantity_kg) / e.capacity, 3)                                          AS kg_per_capita,
       RANK() OVER (PARTITION BY ec.category_id ORDER BY SUM(w.quantity_kg) / e.capacity DESC)         AS worst_rank,
       ROUND((PERCENT_RANK() OVER (PARTITION BY ec.category_id ORDER BY SUM(w.quantity_kg) / e.capacity))::numeric, 2) AS percentile
  FROM waste_event w
  JOIN waste_reason wr           ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
  JOIN establishment e           ON e.establishment_id = w.establishment_id
  JOIN establishment_category ec ON ec.category_id = e.category_id
 WHERE w.occurred_on >= CURRENT_DATE - 90
 GROUP BY e.establishment_id, e.name, e.capacity, ec.category_id, ec.category_name
 ORDER BY ec.category_name, worst_rank
 LIMIT 30;
```

**Result** (30 row(s) in 22 ms - first 8 shown):

| name | category_name | kg_per_capita | worst_rank | percentile |
|---|---|---|---|---|
| Lotus Apartments | Apartment Block | 5.520 | 1 | 1.00 |
| Palm Residency | Apartment Block | 5.301 | 2 | 0.92 |
| Marigold Enclave | Apartment Block | 5.238 | 3 | 0.85 |
| Cedar Gardens | Apartment Block | 5.070 | 4 | 0.77 |
| Harmony Heights | Apartment Block | 4.947 | 5 | 0.69 |
| Sunrise Enclave | Apartment Block | 4.862 | 6 | 0.62 |
| Willow Creek Apartments | Apartment Block | 4.663 | 7 | 0.54 |
| Jasmine Court | Apartment Block | 4.645 | 8 | 0.46 |

**Explanation:** worst_rank 1 = highest waste per capita in the category; percentile is PERCENT_RANK (1.00 = worst, 0.00 = best).

## Q18 - Recursive roll-up of waste through the zone hierarchy

**DBMS concepts:** WITH RECURSIVE (tree traversal), LEFT JOIN, GROUP BY on tree depth, self-referencing foreign key

**Purpose in ZoneFood:** The locality is a tree (sector -> block -> street). A recursive CTE walks from the root down to any depth, and the figures of every street roll up to the blocks and sector above it. The same query works if a new level is added; no code change.

```sql
WITH RECURSIVE subtree AS (
  SELECT zone_id, parent_zone_id, zone_name, 0 AS depth, zone_name::text AS path
    FROM zone WHERE parent_zone_id IS NULL
  UNION ALL
  SELECT z.zone_id, z.parent_zone_id, z.zone_name, s.depth + 1, s.path || ' > ' || z.zone_name
    FROM zone z JOIN subtree s ON z.parent_zone_id = s.zone_id
), street_waste AS (
  SELECT e.zone_id, SUM(w.quantity_kg) AS kg, COUNT(DISTINCT e.establishment_id) AS estabs
    FROM establishment e
    JOIN waste_event w ON w.establishment_id = e.establishment_id AND w.occurred_on >= CURRENT_DATE - 30
    JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
   GROUP BY e.zone_id
)
SELECT s.depth,
       repeat('  ', s.depth) || s.zone_name        AS zone,
       COALESCE(SUM(sw.kg) FILTER (WHERE sw.zone_id = s.zone_id), 0)    AS own_kg,
       ROUND((SELECT COALESCE(SUM(sw2.kg), 0)
                FROM street_waste sw2
                JOIN subtree d ON d.zone_id = sw2.zone_id
               WHERE d.path = s.path OR d.path LIKE s.path || ' > %'))   AS rolled_up_kg
  FROM subtree s
  LEFT JOIN street_waste sw ON sw.zone_id = s.zone_id
 GROUP BY s.zone_id, s.zone_name, s.depth, s.path
 ORDER BY s.path;
```

**Result** (31 row(s) in 12 ms - first 8 shown):

| depth | zone | own_kg | rolled_up_kg |
|---|---|---|---|
| 0 | Demo Sector 7 | 0 | 61789 |
| 1 |   Block A | 0 | 13229 |
| 2 |     A1 Street | 1115.618 | 1116 |
| 2 |     A2 Street | 678.925 | 679 |
| 2 |     A3 Street | 9695.509 | 9696 |
| 2 |     A4 Street | 1739.091 | 1739 |
| 1 |   Block B | 0 | 12022 |
| 2 |     B1 Street | 1394.089 | 1394 |

**Explanation:** An indented tree. own_kg is waste recorded directly at that zone (streets only); rolled_up_kg includes every descendant, so the sector row equals the sum of its blocks.

## Q19 - Ingredient-level exposure to wasted dishes

**DBMS concepts:** many-to-many join through dish_ingredient, GROUP BY, HAVING COUNT(DISTINCT), case-insensitive name join

**Purpose in ZoneFood:** Which raw ingredients sit behind the most wasted dishes? A dish is a recipe (M:N with ingredients); joining wasted dish-foods to their recipes shows which staples (rice, oil, onions) a procurement team should look at first.

```sql
SELECT ing.canonical_name                              AS ingredient,
       COUNT(DISTINCT d.dish_name)                     AS wasted_dishes_using_it,
       ROUND(SUM(w.quantity_kg))                       AS wasted_kg_of_those_dishes,
       ROUND(AVG(di.qty_per_portion)::numeric, 3)      AS avg_qty_per_portion
  FROM waste_event w
  JOIN waste_reason wr    ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
  JOIN food_item dish_food ON dish_food.food_id = w.food_id
  JOIN dish d             ON lower(d.dish_name) = lower(dish_food.canonical_name)
                         AND d.establishment_id = w.establishment_id
  JOIN dish_ingredient di ON di.dish_id = d.dish_id
  JOIN food_item ing      ON ing.food_id = di.food_id
 WHERE w.occurred_on >= CURRENT_DATE - 90
 GROUP BY ing.food_id, ing.canonical_name
HAVING COUNT(DISTINCT d.dish_name) >= 3
 ORDER BY wasted_kg_of_those_dishes DESC
 LIMIT 12;
```

**Result** (11 row(s) in 98 ms - first 8 shown):

| ingredient | wasted_dishes_using_it | wasted_kg_of_those_dishes | avg_qty_per_portion |
|---|---|---|---|
| Onion | 13 | 47644 | 0.027 |
| Green Peas | 5 | 26327 | 0.016 |
| Tomato | 10 | 25290 | 0.050 |
| Carrot | 5 | 24505 | 0.023 |
| Ghee | 5 | 23764 | 0.009 |
| Basmati Rice | 4 | 15679 | 0.092 |
| Sona Masoori Rice | 5 | 15632 | 0.083 |
| Wheat Flour (Atta) | 5 | 12054 | 0.053 |

**Explanation:** Ingredients ordered by the wasted kilograms of the dishes they go into; wasted_dishes_using_it is how many distinct wasted dishes contain the ingredient.

## Q20 - Suppliers whose deliveries most often end in spoilage

**DBMS concepts:** multi-hop JOIN (supplier -> procurement -> line -> lot -> waste), conditional SUM, HAVING on volume

**Purpose in ZoneFood:** Traces a spoiled kilogram back to the supplier that delivered it, through the lot it came from. The Part 1 data plants one supplier whose produce spoils about three times as often; this query finds it. HAVING ignores suppliers with too little volume to judge.

```sql
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
```

**Result** (9 row(s) in 987 ms - first 8 shown):

| supplier | supplier_type | received_kg | spoiled_kg | spoilage_rate_pct |
|---|---|---|---|---|
| Greenacre Farms (produce) | FARM | 158961 | 13340 | 8.39 |
| City Wholesale Mandi | WHOLESALE | 166114 | 5030 | 3.03 |
| Ocean Catch Traders | WHOLESALE | 2763 | 32 | 1.16 |
| Meatline Poultry Traders | WHOLESALE | 25112 | 261 | 1.04 |
| Dairy Fresh Distributors | DISTRIBUTOR | 296958 | 2328 | 0.78 |
| Grain Depot Wholesale | WHOLESALE | 390691 | 0 | 0.00 |
| Spice & Oil Merchants | DISTRIBUTOR | 3089 | 0 | 0.00 |
| Packaged Goods Distributors | DISTRIBUTOR | 13422 | 0 | 0.00 |

**Explanation:** spoilage_rate_pct = spoilage kilograms traced to lots from that supplier / kilograms received. An outlier supplier stands out immediately.

## Q21 - Data provenance - how each establishment kind's waste figures were captured

**DBMS concepts:** column added by ALTER TABLE (measurement_source), conditional aggregates, percentage with NULLIF

**Purpose in ZoneFood:** Not all numbers are equally trustworthy. This reports, per kind, what share of waste kilograms was typed in by a person (MANUAL), imported from a field-log document (ETL_IMPORT) or generated by the system (SYSTEM). It replaces the PDF's forecast-accuracy query #21, which needs the forecasting tables that belong to the optional Part 4.

```sql
SELECT ec.kind,
       COUNT(*)                                                                     AS events,
       ROUND(SUM(w.quantity_kg))                                                    AS total_kg,
       ROUND(100.0 * SUM(w.quantity_kg) FILTER (WHERE w.measurement_source = 'MANUAL')     / SUM(w.quantity_kg), 1) AS manual_pct,
       ROUND(100.0 * SUM(w.quantity_kg) FILTER (WHERE w.measurement_source = 'ETL_IMPORT') / SUM(w.quantity_kg), 1) AS etl_import_pct,
       ROUND(100.0 * SUM(w.quantity_kg) FILTER (WHERE w.measurement_source = 'SYSTEM')     / SUM(w.quantity_kg), 1) AS system_pct
  FROM waste_event w
  JOIN waste_reason wr           ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
  JOIN establishment e           ON e.establishment_id = w.establishment_id
  JOIN establishment_category ec ON ec.category_id = e.category_id
 GROUP BY ec.kind
 ORDER BY total_kg DESC;
```

**Result** (7 row(s) in 47 ms):

| kind | events | total_kg | manual_pct | etl_import_pct | system_pct |
|---|---|---|---|---|---|
| EDUCATIONAL | 12181 | 134242 | 99.1 | 0.9 | NULL |
| COMMERCIAL | 25188 | 51038 | 99.4 | 0.6 | NULL |
| HEALTHCARE | 3848 | 33854 | 99.8 | 0.2 | NULL |
| RESIDENTIAL | 3659 | 27325 | 87.4 | 12.6 | NULL |
| ORGANIZATIONAL | 3154 | 19766 | 97.1 | 2.9 | NULL |
| RECREATIONAL | 2163 | 5441 | 97.6 | 2.4 | NULL |
| RETAIL_FOOD | 1721 | 2176 | 96.8 | 3.2 | NULL |

**Explanation:** manual_pct + etl_import_pct + system_pct = 100 for each kind. A high etl_import_pct means that kind's figures come mostly from field-log documents.

## Q22 - Semantic top-5 recipients for a listing (pgvector)

**DBMS concepts:** pgvector cosine distance operator <=> with an HNSW index, LATERAL join, hard filters before ranking, recursive zone_root()

**Purpose in ZoneFood:** Match surplus food to the organisations that can use it. Hard constraints are applied first in WHERE (same locality, cooked-food policy, enough capacity); only the survivors are ordered by meaning (1 - cosine distance between the listing description and the recipient's need profile). Needs embeddings: run `npm run demo:prepare` once.

```sql
SELECT sl.listing_id,
       LEFT(sl.description, 50)                                 AS listing,
       r.org_name,
       ROUND((1 - (r.need_embedding <=> sl.desc_embedding))::numeric, 3) AS similarity,
       r.daily_capacity_kg
  FROM surplus_listing sl
  JOIN establishment e ON e.establishment_id = sl.establishment_id
  CROSS JOIN LATERAL (
        SELECT r2.*
          FROM recipient_org r2
         WHERE zone_root(r2.zone_id) = zone_root(e.zone_id)
           AND (NOT sl.is_cooked OR r2.accepts_cooked)
           AND r2.daily_capacity_kg >= sl.offered_qty_kg * 0.5
           AND r2.need_embedding IS NOT NULL
         ORDER BY r2.need_embedding <=> sl.desc_embedding
         LIMIT 5) r
 WHERE sl.listing_id = (SELECT listing_id FROM surplus_listing WHERE desc_embedding IS NOT NULL ORDER BY listing_id DESC LIMIT 1)
 ORDER BY similarity DESC;
```

**Result** (5 row(s) in 9 ms):

| listing_id | listing | org_name | similarity | daily_capacity_kg |
|---|---|---|---|---|
| 4442 | 10 kg cooked jeera rice and dal tadka, vegeta… | Annapoorna Community Kitchen | 0.569 | 300.00 |
| 4442 | 10 kg cooked jeera rice and dal tadka, vegeta… | Hope Shelter for the Homeless | 0.492 | 120.00 |
| 4442 | 10 kg cooked jeera rice and dal tadka, vegeta… | Elder Care Home Meals | 0.472 | 50.00 |
| 4442 | 10 kg cooked jeera rice and dal tadka, vegeta… | Little Hands Orphanage Kitchen | 0.469 | 90.00 |
| 4442 | 10 kg cooked jeera rice and dal tadka, vegeta… | Evening Soup Run Volunteers | 0.468 | 150.00 |

**Explanation:** The top 5 recipients that pass the hard filters, ordered by cosine similarity between the listing text and their need profile (1 = identical meaning).

## Q23 - INSERT ... SELECT - list near-expiry, still-edible stock as surplus

**DBMS concepts:** INSERT with SELECT source, RETURNING, expression columns, trigger T4 (audit) firing on insert

**Purpose in ZoneFood:** A kitchen can turn stock that is about to expire into a rescue listing in one statement. One new surplus listing is created per qualifying lot (at most 3 here) and the inserted rows are returned. The catalogue always runs this inside a transaction that is ROLLED BACK, so the demo data is never kept.

```sql
INSERT INTO surplus_listing (establishment_id, food_id, description, offered_qty_kg, is_cooked, is_vegetarian, available_from, expires_at)
SELECT l.establishment_id, l.food_id,
       format('%s kg of %s approaching its expiry date - offered before it is wasted', ROUND(l.remaining_qty, 1), fi.canonical_name),
       l.remaining_qty, FALSE, TRUE, now(), LEAST(l.expires_at, now() + interval '48 hours')
  FROM inventory_lot l
  JOIN food_item fi ON fi.food_id = l.food_id
 WHERE l.remaining_qty >= 5 AND fi.is_edible_as_is
   AND l.expires_at > now() + interval '1 hour' AND l.expires_at <= now() + interval '5 days'
 ORDER BY l.expires_at
 LIMIT 3
RETURNING listing_id, establishment_id, offered_qty_kg, status, expires_at;
```

**Result** (3 row(s) in 38 ms - executed in a transaction that was rolled back):

| listing_id | establishment_id | offered_qty_kg | status | expires_at |
|---|---|---|---|---|
| 4449 | 1 | 25.000 | OPEN | 2026-11-01 16:45:00+00:00 |
| 4450 | 19 | 12.250 | OPEN | 2026-11-02 01:03:00+00:00 |
| 4451 | 19 | 5.370 | OPEN | 2026-11-02 01:03:00+00:00 |

**Explanation:** Returns the listings that WOULD be created (the transaction is rolled back afterwards). expires_at is the earlier of the lot's expiry and 48 hours.

## Q24 - UPDATE - mark listings that passed their expiry as EXPIRED

**DBMS concepts:** UPDATE with a WHERE predicate on a partial-index column, RETURNING, enum status, triggers T4 (audit) and T6 (status guard)

**Purpose in ZoneFood:** Housekeeping that keeps the stored status honest: listings still flagged OPEN or PARTIALLY_CLAIMED although their pick-up window has closed are moved to EXPIRED. (The application also derives expiry live, so users never see a stale status; this makes the stored value agree.) Executed inside a rolled-back transaction.

```sql
UPDATE surplus_listing
   SET status = 'EXPIRED'
 WHERE status IN ('OPEN', 'PARTIALLY_CLAIMED')
   AND expires_at < now()
   AND claimed_qty_kg < offered_qty_kg
RETURNING listing_id, establishment_id, offered_qty_kg, claimed_qty_kg, expires_at, status;
```

**Result** (12 row(s) in 14 ms - first 8 shown - executed in a transaction that was rolled back):

| listing_id | establishment_id | offered_qty_kg | claimed_qty_kg | expires_at | status |
|---|---|---|---|---|---|
| 4408 | 5 | 22.112 | 0.000 | 2026-10-31 09:48:56.218963+00:00 | EXPIRED |
| 4409 | 26 | 11.559 | 0.000 | 2026-10-31 08:38:56.218963+00:00 | EXPIRED |
| 4411 | 24 | 13.171 | 0.000 | 2026-10-31 08:33:56.218963+00:00 | EXPIRED |
| 4413 | 5 | 4.442 | 0.000 | 2026-10-31 09:34:56.218963+00:00 | EXPIRED |
| 4414 | 32 | 7.559 | 0.000 | 2026-10-31 09:53:56.218963+00:00 | EXPIRED |
| 4415 | 31 | 18.205 | 0.000 | 2026-10-31 09:19:56.218963+00:00 | EXPIRED |
| 4416 | 23 | 10.000 | 0.000 | 2026-10-31 09:04:56.218963+00:00 | EXPIRED |
| 4417 | 23 | 4.049 | 1.912 | 2026-10-31 09:54:56.218963+00:00 | EXPIRED |

**Explanation:** Returns each stale listing moved to EXPIRED (rolled back afterwards); the row count is how many were out of date.

## Q25 - DELETE with a subquery - purge one imported document's rows so it can be re-synced

**DBMS concepts:** DELETE ... WHERE (scalar subquery), RETURNING, lineage column source_doc_id, trigger T3 restoring stock on delete

**Purpose in ZoneFood:** If a MongoDB field log was corrected after import, its rows can be removed by lineage and the document re-queued. Only rows carrying that document's id are touched. Executed inside a rolled-back transaction, so nothing is actually lost.

```sql
DELETE FROM waste_event
 WHERE source_doc_id = (SELECT source_doc_id FROM waste_event
                         WHERE source_doc_id IS NOT NULL
                         ORDER BY occurred_on DESC, waste_id LIMIT 1)
RETURNING waste_id, establishment_id, occurred_on, quantity_kg, source_doc_id, measurement_source;
```

**Result** (3 row(s) in 52 ms - executed in a transaction that was rolled back):

| waste_id | establishment_id | occurred_on | quantity_kg | source_doc_id | measurement_source |
|---|---|---|---|---|---|
| 55511 | 1 | 2026-10-30 | 0.118 | 6ae4c608000000000000026f | ETL_IMPORT |
| 55512 | 1 | 2026-10-30 | 0.088 | 6ae4c608000000000000026f | ETL_IMPORT |
| 55513 | 1 | 2026-10-30 | 1.000 | 6ae4c608000000000000026f | ETL_IMPORT |

**Explanation:** Returns the rows removed for one document's lineage (rolled back afterwards); stock for any lot-linked row would be restored by trigger T3.

## Q26 - INSERT ... ON CONFLICT (upsert) - teach the name matcher a new alias

**DBMS concepts:** UPSERT (ON CONFLICT DO UPDATE), scalar subquery for the foreign key, EXCLUDED pseudo-table, idempotent write

**Purpose in ZoneFood:** A reviewer confirms that "panneer masala" means Paneer Butter Masala. The statement inserts the alias, or - if the raw name was already queued as unresolved - updates that row instead of failing, so running it twice is harmless. Executed inside a rolled-back transaction.

```sql
INSERT INTO food_alias (raw_name_norm, food_id, confidence, method, status)
VALUES ('panneer masala',
        (SELECT food_id FROM food_item WHERE canonical_name = 'Paneer Butter Masala'),
        1.0, 'MANUAL', 'RESOLVED')
ON CONFLICT (raw_name_norm)
DO UPDATE SET food_id = EXCLUDED.food_id, confidence = EXCLUDED.confidence, method = EXCLUDED.method,
              status = 'RESOLVED', hit_count = food_alias.hit_count + 1, last_seen_at = now()
RETURNING alias_id, raw_name_norm, food_id, method, status, hit_count;
```

**Result** (1 row(s) in 10 ms - executed in a transaction that was rolled back):

| alias_id | raw_name_norm | food_id | method | status | hit_count |
|---|---|---|---|---|---|
| 50 | panneer masala | 58 | MANUAL | RESOLVED | 1 |

**Explanation:** A single row: the alias inserted, or updated if it already existed (hit_count 1 on first insert, incremented on conflict).

## Q27 - Forecast accuracy per model (MAE, RMSE, MAPE) on the held-out test days

**DBMS concepts:** JOIN of forecast_run and forecast_eval_daily, scalar subquery for the latest run, AVG / ABS / SQRT aggregates, NULLIF guard

**Purpose in ZoneFood:** The plan's original Query 21 (forecast accuracy per model), now answerable because the forecasting models exist. Compares the seasonal-naive baseline, Ridge and LightGBM on zone-level daily waste for the test window that no model saw during training or tuning.

```sql
SELECT r.run_id,
       e.model,
       COUNT(*)                                                              AS test_days,
       ROUND(AVG(ABS(e.predicted_kg - e.actual_kg)), 1)                      AS mae_kg,
       ROUND(SQRT(AVG((e.predicted_kg - e.actual_kg) ^ 2))::numeric, 1)      AS rmse_kg,
       ROUND(100 * AVG(ABS(e.predicted_kg - e.actual_kg) / NULLIF(e.actual_kg, 0)), 1) AS mape_pct
  FROM forecast_eval_daily e
  JOIN forecast_run r ON r.run_id = e.run_id
 WHERE r.run_id = (SELECT MAX(run_id) FROM forecast_run)
 GROUP BY r.run_id, e.model
 ORDER BY mae_kg;
```

**Result** (3 row(s) in 7 ms):

| run_id | model | test_days | mae_kg | rmse_kg | mape_pct |
|---|---|---|---|---|---|
| 2 | ridge | 28 | 241.0 | 291.9 | 11.1 |
| 2 | lightgbm | 28 | 253.4 | 332.2 | 11.2 |
| 2 | seasonal_naive | 28 | 336.0 | 418.3 | 15.8 |

**Explanation:** One row per model for the latest forecast run; lower mae_kg / rmse_kg / mape_pct is better. The first row is the best by MAE. The same numbers drive the Forecast page (which ranks by RMSE, so the two orderings can differ when errors are unevenly spread).
