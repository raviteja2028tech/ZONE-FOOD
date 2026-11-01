# EXPLAIN / EXPLAIN ANALYZE evidence

_Generated 2026-11-01 17:24 by `python scripts/gen_part3_docs.py` against the working database (PostgreSQL 16, ~55 000 waste events - a student-laptop dataset, so absolute times are small; the **plan shapes** are the evidence). Each experiment runs the same statement twice (second run = warm cache) with `EXPLAIN (ANALYZE, BUFFERS)`. "Without" plans are produced by dropping the index **inside a transaction that is rolled back** (PostgreSQL DDL is transactional), so no index is ever lost._

Data volume: waste_event **55,537**, surplus_listing **4,430**, inventory_lot **19,873**.

## 1. Composite index `idx_waste_estab_date (establishment_id, occurred_on DESC)`

Every dashboard filters by establishment and a date window. Without the index PostgreSQL must read every partition in full.

```sql
SELECT sum(quantity_kg) FROM waste_event WHERE establishment_id = 1 AND occurred_on >= CURRENT_DATE - 30
```

| Variant | Execution time |
|---|---|
| Without the index (all three waste indexes dr… | 1.57 ms |
| With the index | 0.27 ms |

Speed-up: **5.9x**.

### Without the index (all three waste indexes dropped in a rolled-back txn)
```
Aggregate  (cost=1502.41..1502.42 rows=1 width=32) (actual time=1.493..1.497 rows=1 loops=1)
  ->  Append  (cost=0.00..1501.56 rows=340 width=7) (actual time=0.018..1.454 rows=314 loops=1)
        Subplans Removed: 12
        ->  Seq Scan on waste_event_2026_10 waste_event_1  (cost=0.00..450.68 rows=311 width=6) (actual time=0.017..1.392 rows=311 loops=1)
              Filter: ((establishment_id = 1) AND (occurred_on >= (CURRENT_DATE - 30)))
              Rows Removed by Filter: 11723
        ->  Seq Scan on waste_event_2026_11 waste_event_2  (cost=0.00..1.06 rows=3 width=6) (actual time=0.011..0.011 rows=3 loops=1)
              Filter: ((establishment_id = 1) AND (occurred_on >= (CURRENT_DATE - 30)))
        ->  Seq Scan on waste_event_2026_12 waste_event_3  (cost=0.00..0.00 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=1)
              Filter: ((establishment_id = 1) AND (occurred_on >= (CURRENT_DATE - 30)))
        ->  Seq Scan on waste_event_2027_01 waste_event_4  (cost=0.00..0.00 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=1)
              Filter: ((establishment_id = 1) AND (occurred_on >= (CURRENT_DATE - 30)))
        ->  Seq Scan on waste_event_2027_02 waste_event_5  (cost=0.00..0.00 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=1)
              Filter: ((establishment_id = 1) AND (occurred_on >= (CURRENT_DATE - 30)))
        ->  Seq Scan on waste_event_2027_03 waste_event_6  (cost=0.00..0.00 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=1)
              Filter: ((establishment_id = 1) AND (occurred_on >= (CURRENT_DATE - 30)))
...
```

### With the index
```
Aggregate  (cost=267.94..267.95 rows=1 width=32) (actual time=0.193..0.195 rows=1 loops=1)
  ->  Append  (cost=0.00..267.09 rows=340 width=7) (actual time=0.036..0.157 rows=314 loops=1)
        Subplans Removed: 12
        ->  Bitmap Heap Scan on waste_event_2026_10 waste_event_1  (cost=7.48..233.92 rows=311 width=6) (actual time=0.036..0.101 rows=311 loops=1)
              Recheck Cond: ((establishment_id = 1) AND (occurred_on >= (CURRENT_DATE - 30)))
              Heap Blocks: exact=22
              ->  Bitmap Index Scan on waste_event_2026_10_establishment_id_occurred_on_idx  (cost=0.00..7.40 rows=311 width=0) (actual time=0.024..0.024 rows=342 loops=1)
                    Index Cond: ((establishment_id = 1) AND (occurred_on >= (CURRENT_DATE - 30)))
        ->  Seq Scan on waste_event_2026_11 waste_event_2  (cost=0.00..1.06 rows=3 width=6) (actual time=0.008..0.009 rows=3 loops=1)
              Filter: ((establishment_id = 1) AND (occurred_on >= (CURRENT_DATE - 30)))
        ->  Seq Scan on waste_event_2026_12 waste_event_3  (cost=0.00..0.00 rows=1 width=16) (actual time=0.002..0.003 rows=0 loops=1)
              Filter: ((establishment_id = 1) AND (occurred_on >= (CURRENT_DATE - 30)))
        ->  Seq Scan on waste_event_2027_01 waste_event_4  (cost=0.00..0.00 rows=1 width=16) (actual time=0.002..0.002 rows=0 loops=1)
              Filter: ((establishment_id = 1) AND (occurred_on >= (CURRENT_DATE - 30)))
        ->  Seq Scan on waste_event_2027_02 waste_event_5  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: ((establishment_id = 1) AND (occurred_on >= (CURRENT_DATE - 30)))
...
```

Reading it: `Seq Scan` over every monthly partition becomes an `Index Scan`/`Bitmap Heap Scan` that touches only the matching rows - far fewer buffers read.

## 2. Partition pruning (`waste_event` PARTITION BY RANGE (occurred_on), monthly)

`waste_event` has **28** child partitions (24+ monthly ones plus a default). A query that filters on the partition key scans only the relevant child; one that does not, scans all of them.

```sql
SELECT sum(quantity_kg) FROM waste_event WHERE occurred_on >= DATE '2026-10-01' AND occurred_on < DATE '2026-11-01'
```

| Query | Partitions scanned | Execution time |
|---|---|---|
| filter on occurred_on (one month) | 1 | 3.35 ms |
| filter on reason_id (not the key) | 27 | 6.95 ms |

### Plan - one month (pruned)
```
Aggregate  (cost=420.60..420.61 rows=1 width=32) (actual time=3.322..3.324 rows=1 loops=1)
  ->  Seq Scan on waste_event_2026_10 waste_event  (cost=0.00..390.51 rows=12034 width=6) (actual time=0.010..2.155 rows=12034 loops=1)
        Filter: ((occurred_on >= '2026-10-01'::date) AND (occurred_on < '2026-11-01'::date))
Execution Time: 3.345 ms
```

Reading it: only `waste_event_2026_10` appears in the plan; the other partitions were pruned at plan time ("partition pruning").

## 3. Partial index `idx_listing_open ... WHERE status IN ('OPEN','PARTIALLY_CLAIMED')`

The marketplace only ever reads live listings - a tiny fraction of the table (most are long finished). A partial index contains only those rows.

```sql
SELECT listing_id FROM surplus_listing WHERE status IN ('OPEN','PARTIALLY_CLAIMED') AND expires_at > now() - interval '1 day'
```

| Variant | Execution time |
|---|---|
| Without the index | 0.43 ms |
| With the partial index | 0.08 ms |

Speed-up: **5.7x**.

### Without the index
```
Seq Scan on surplus_listing  (cost=0.00..219.60 rows=1 width=8) (actual time=0.414..0.421 rows=9 loops=1)
  Filter: ((status = ANY ('{OPEN,PARTIALLY_CLAIMED}'::listing_status[])) AND (expires_at > (now() - '1 day'::interval)))
  Rows Removed by Filter: 4421
Execution Time: 0.430 ms
```

### With the partial index
```
Index Scan using idx_listing_open on surplus_listing  (cost=0.14..8.16 rows=1 width=8) (actual time=0.016..0.024 rows=9 loops=1)
  Index Cond: (expires_at > (now() - '1 day'::interval))
Execution Time: 0.076 ms
```

Reading it: the index is a fraction of the size of a full one and the plan reads only live listings instead of scanning the whole table. `16 kB` for the partial index.

## 4. Index `idx_waste_lot` (migration 018) - found necessary by the query catalogue

Query Q20 traces spoilage back to the supplier through each stock lot, so it looks up waste events by `lot_id` ~20,000 times. Whole of Q20 without the index: **cancelled after the 20 s limit**; with it: **938 ms**.

```sql
SELECT sum(quantity_kg) FROM waste_event WHERE lot_id = 10660
```

| Variant | Execution time |
|---|---|
| Without the index (one lot) | 4.48 ms |
| With the partial index (one lot) | 0.11 ms |

Speed-up: **41.1x**.

### Without the index (one lot)
```
Aggregate  (cost=1567.42..1567.43 rows=1 width=32) (actual time=4.417..4.423 rows=1 loops=1)
  ->  Append  (cost=0.00..1567.35 rows=28 width=14) (actual time=2.380..4.408 rows=1 loops=1)
        ->  Seq Scan on waste_event_2025_10 waste_event_1  (cost=0.00..0.00 rows=1 width=16) (actual time=0.005..0.005 rows=0 loops=1)
              Filter: (lot_id = 10660)
        ->  Seq Scan on waste_event_2025_11 waste_event_2  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: (lot_id = 10660)
        ->  Seq Scan on waste_event_2025_12 waste_event_3  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: (lot_id = 10660)
        ->  Seq Scan on waste_event_2026_01 waste_event_4  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: (lot_id = 10660)
        ->  Seq Scan on waste_event_2026_02 waste_event_5  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: (lot_id = 10660)
        ->  Seq Scan on waste_event_2026_03 waste_event_6  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: (lot_id = 10660)
        ->  Seq Scan on waste_event_2026_04 waste_event_7  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: (lot_id = 10660)
...
```

### With the partial index (one lot)
```
Aggregate  (cost=42.71..42.72 rows=1 width=32) (actual time=0.056..0.058 rows=1 loops=1)
  ->  Append  (cost=0.00..42.64 rows=28 width=14) (actual time=0.029..0.053 rows=1 loops=1)
        ->  Seq Scan on waste_event_2025_10 waste_event_1  (cost=0.00..0.00 rows=1 width=16) (actual time=0.004..0.004 rows=0 loops=1)
              Filter: (lot_id = 10660)
        ->  Seq Scan on waste_event_2025_11 waste_event_2  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: (lot_id = 10660)
        ->  Seq Scan on waste_event_2025_12 waste_event_3  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: (lot_id = 10660)
        ->  Seq Scan on waste_event_2026_01 waste_event_4  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: (lot_id = 10660)
        ->  Seq Scan on waste_event_2026_02 waste_event_5  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: (lot_id = 10660)
        ->  Seq Scan on waste_event_2026_03 waste_event_6  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: (lot_id = 10660)
        ->  Seq Scan on waste_event_2026_04 waste_event_7  (cost=0.00..0.00 rows=1 width=16) (actual time=0.001..0.001 rows=0 loops=1)
              Filter: (lot_id = 10660)
...
```

Reading it: a `Seq Scan` of every partition per lot becomes an index lookup. The index is partial (`WHERE lot_id IS NOT NULL`) because most waste is not tied to a lot.

## 5. GIN trigram index `idx_food_trgm` (typo-tolerant food search)

`fn_search_food` combines full-text (`idx_food_fts`, GIN on a tsvector) with trigram similarity (`%`, GIN `gin_trgm_ops`) so 'panner butter masala' still finds 'Paneer Butter Masala'. With only 81 food items the planner is **right** to choose a sequential scan (cheaper than any index); forcing `enable_seqscan = off` shows the index path it would take at catalogue scale.

```sql
SELECT food_id FROM food_item WHERE canonical_name % 'panner butter masala'
```

| Variant | Execution time |
|---|---|
| Default plan (planner's own choice) | 0.16 ms |
| Forced to use the index (enable_seqscan = off) | 0.06 ms |

Speed-up: **2.9x**.

### Default plan (planner's own choice)
```
Seq Scan on food_item  (cost=0.00..22.01 rows=2 width=4) (actual time=0.071..0.157 rows=2 loops=1)
  Filter: ((canonical_name)::text % 'panner butter masala'::text)
  Rows Removed by Filter: 79
Execution Time: 0.163 ms
```

### Forced to use the index (enable_seqscan = off)
```
Bitmap Heap Scan on food_item  (cost=92.58..98.76 rows=2 width=4) (actual time=0.036..0.048 rows=2 loops=1)
  Recheck Cond: ((canonical_name)::text % 'panner butter masala'::text)
  Rows Removed by Index Recheck: 7
  Heap Blocks: exact=6
  ->  Bitmap Index Scan on idx_food_trgm  (cost=0.00..92.58 rows=2 width=0) (actual time=0.023..0.024 rows=9 loops=1)
        Index Cond: ((canonical_name)::text % 'panner butter masala'::text)
Execution Time: 0.056 ms
```

Reading it: both return the same rows; the index plan is a `Bitmap Index Scan on idx_food_trgm`. We do not claim a speed-up on 81 rows - the evidence is that the index is usable and chosen once the table is large.

## 6. pgvector HNSW index `idx_food_name_vec` (cosine distance `<=>`)

Nearest-neighbour search over 384-dimensional embeddings. HNSW is an approximate index (fast, high recall); without it PostgreSQL computes the distance to every row (exact).

```sql
SELECT food_id FROM food_item WHERE name_embedding IS NOT NULL ORDER BY name_embedding <=> (SELECT name_embedding FROM food_item WHERE food_id = 1) LIMIT 5
```

| Variant | Execution time |
|---|---|
| Default plan | 0.05 ms |
| Forced index plan (enable_seqscan = off) | 0.14 ms |

Speed-up: **0.4x**.

### Default plan
```
Limit  (cost=31.52..31.53 rows=5 width=12) (actual time=0.043..0.044 rows=5 loops=1)
  InitPlan 1 (returns $0)
    ->  Index Scan using food_item_pkey on food_item food_item_1  (cost=0.14..8.16 rows=1 width=1544) (actual time=0.003..0.004 rows=1 loops=1)
          Index Cond: (food_id = 1)
  ->  Sort  (cost=23.36..23.56 rows=81 width=12) (actual time=0.043..0.043 rows=5 loops=1)
        Sort Key: ((food_item.name_embedding <=> $0))
        Sort Method: top-N heapsort  Memory: 25kB
        ->  Seq Scan on food_item  (cost=0.00..22.01 rows=81 width=12) (actual time=0.008..0.034 rows=81 loops=1)
              Filter: (name_embedding IS NOT NULL)
Execution Time: 0.054 ms
```

### Forced index plan (enable_seqscan = off)
```
Limit  (cost=96.77..102.02 rows=5 width=12) (actual time=0.117..0.122 rows=5 loops=1)
  InitPlan 1 (returns $0)
    ->  Index Scan using food_item_pkey on food_item food_item_1  (cost=0.14..8.16 rows=1 width=1544) (actual time=0.007..0.007 rows=1 loops=1)
          Index Cond: (food_id = 1)
  ->  Index Scan using idx_food_name_vec on food_item  (cost=88.61..173.62 rows=81 width=12) (actual time=0.117..0.120 rows=5 loops=1)
        Order By: (name_embedding <=> $0)
        Filter: (name_embedding IS NOT NULL)
Execution Time: 0.140 ms
```

Reading it: `Index Scan using idx_food_name_vec` with `Order By: (name_embedding <=> ...)` replaces sort-all-rows. At 81 rows the exact scan is as fast; the index matters at thousands of listings.

## 7. Query rewrite: correlated subquery (Q03) versus a window function

Q03 is written with a correlated subquery because that is the textbook form (and what examiners ask about): the inner aggregate is recomputed for every establishment. The same answer can be computed once with `AVG() OVER (PARTITION BY category)`.

| Variant | Wall time | Rows |
|---|---|---|
| Q03 as catalogued (correlated subquery) | 1573 ms | 29 |
| Window-function rewrite | 27 ms | 29 |

Results identical: **True**. Speed-up: **58.3x**.

```sql
WITH per_est AS (
  SELECT e.establishment_id, e.name, ec.category_id, ec.category_name,
         SUM(w.quantity_kg) / e.capacity AS kg_per_capita
    FROM waste_event w
    JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
    JOIN establishment e ON e.establishment_id = w.establishment_id
    JOIN establishment_category ec ON ec.category_id = e.category_id
   WHERE w.occurred_on >= CURRENT_DATE - 90
   GROUP BY e.establishment_id, e.name, e.capacity, ec.category_id, ec.category_name
), ranked AS (SELECT *, AVG(kg_per_capita) OVER (PARTITION BY category_id) AS cat_avg FROM per_est)
SELECT name, category_name, ROUND(kg_per_capita, 3) AS kg_per_capita
  FROM ranked WHERE kg_per_capita > cat_avg ORDER BY kg_per_capita DESC
```

Lesson: a correlated subquery is the clearest way to express "above the average of my own group", but PostgreSQL cannot always decorrelate it; when the query is on a hot path, rewrite it with a window function.

## 8. Materialised view `mv_zone_monthly` versus aggregating the base table

The monthly diversion trend (Q13, dashboard) needs a roll-up over every waste event. The materialised view stores it once; refresh with `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_zone_monthly` (the unique index `uq_mv_zone_monthly` is what permits CONCURRENTLY, so readers are never blocked).

```sql
SELECT month, SUM(waste_kg), SUM(diverted_kg) FROM mv_zone_monthly GROUP BY month ORDER BY month
```

| Variant | Execution time |
|---|---|
| Aggregate the base table | 52.88 ms |
| Read the materialised view | 0.07 ms |

Speed-up: **714.6x**.

### Aggregate the base table
```
Finalize GroupAggregate  (cost=2826.84..2869.53 rows=152 width=68) (actual time=45.120..52.759 rows=6 loops=1)
  Group Key: ((date_trunc('month'::text, (w.occurred_on)::timestamp with time zone))::date)
  ->  Gather Merge  (cost=2826.84..2862.31 rows=304 width=68) (actual time=45.108..52.737 rows=9 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        ->  Sort  (cost=1826.81..1827.19 rows=152 width=68) (actual time=21.687..21.710 rows=3 loops=3)
              Sort Key: ((date_trunc('month'::text, (w.occurred_on)::timestamp with time zone))::date)
              Sort Method: quicksort  Memory: 25kB
              Worker 0:  Sort Method: quicksort  Memory: 25kB
              Worker 1:  Sort Method: quicksort  Memory: 25kB
              ->  Partial HashAggregate  (cost=1817.88..1821.30 rows=152 width=68) (actual time=21.624..21.648 rows=3 loops=3)
                    Group Key: (date_trunc('month'::text, (w.occurred_on)::timestamp with time zone))::date
                    Batches: 1  Memory Usage: 40kB
                    Worker 0:  Batches: 1  Memory Usage: 40kB
                    Worker 1:  Batches: 1  Memory Usage: 40kB
                    ->  Hash Join  (cost=2.35..1661.62 rows=20835 width=11) (actual time=0.166..17.398 rows=17305 loops=3)
...
```

### Read the materialised view
```
Sort  (cost=7.69..7.70 rows=6 width=68) (actual time=0.060..0.061 rows=6 loops=1)
  Sort Key: month
  Sort Method: quicksort  Memory: 25kB
  ->  HashAggregate  (cost=7.52..7.61 rows=6 width=68) (actual time=0.055..0.057 rows=6 loops=1)
        Group Key: month
        Batches: 1  Memory Usage: 24kB
        ->  Seq Scan on mv_zone_monthly  (cost=0.00..6.01 rows=201 width=17) (actual time=0.004..0.015 rows=201 loops=1)
Execution Time: 0.074 ms
```

Reading it: the base query scans and aggregates every partition; the view reads a few hundred pre-aggregated rows. Trade-off: the view is stale until refreshed - the DBMS Lab page and `sp`-free `REFRESH` statement do that on demand.

## 9. `SET enable_indexscan = off` comparison - `idx_claim_recipient (recipient_id, status)`

The classic classroom comparison: same query, same data, planner forbidden from using indexes.

```sql
SELECT count(*) FROM redistribution_claim WHERE recipient_id = 1 AND status = 'REQUESTED'
```

| Variant | Execution time |
|---|---|
| Index scans disabled | 0.20 ms |
| Normal planner | 0.02 ms |

Speed-up: **9.3x**.

### Index scans disabled
```
Aggregate  (cost=96.04..96.05 rows=1 width=8) (actual time=0.185..0.186 rows=1 loops=1)
  ->  Seq Scan on redistribution_claim  (cost=0.00..96.04 rows=1 width=0) (actual time=0.183..0.183 rows=2 loops=1)
        Filter: ((recipient_id = 1) AND (status = 'REQUESTED'::claim_status))
        Rows Removed by Filter: 3934
Execution Time: 0.196 ms
```

### Normal planner
```
Aggregate  (cost=8.30..8.31 rows=1 width=8) (actual time=0.011..0.011 rows=1 loops=1)
  ->  Index Only Scan using idx_claim_recipient on redistribution_claim  (cost=0.28..8.30 rows=1 width=0) (actual time=0.008..0.008 rows=2 loops=1)
        Index Cond: ((recipient_id = 1) AND (status = 'REQUESTED'::claim_status))
        Heap Fetches: 2
Execution Time: 0.021 ms
```

Reading it: with indexes disabled PostgreSQL falls back to a sequential scan of the claims table.
