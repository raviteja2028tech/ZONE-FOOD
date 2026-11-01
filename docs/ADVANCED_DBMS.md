# Advanced DBMS concepts in ZoneFood

Everything here is implemented, tested and demonstrable on the running system. For each feature: **what** it does, **why** ZoneFood needs it, **where** it lives, **how** it works, and **how to demonstrate it** to faculty. The PDF requires four advanced concepts (Req. 7); ZoneFood implements the nine it lists, plus a state-machine guard, an audit trail and provenance tracking.

| # | Concept | Implemented in | PDF § | Proof |
|---|---|---|---|---|
| 1 | Indexing (B-tree, composite, partial, covering, GIN, HNSW, BRIN) | `008_indexes.sql`, `018_lot_lookup_index.sql` | 5.1 | `EXPLAIN_EVIDENCE.md` §1, 3, 4, 5, 6 |
| 2 | Views and a materialised view | `015_views.sql` | 5.2 | queries Q05, Q06, Q13, Q14; DBMS Lab; `EXPLAIN_EVIDENCE.md` §8 |
| 3 | Stored functions and a stored procedure | `016_functions_procedures.sql` | 5.3 | `tests/test_part3.py`; Lab demo D10 |
| 4 | Triggers T1-T6 | `009_integrity_triggers.sql`, `014`, `017_triggers.sql` | 5.4 | Lab demos D01-D06, D11, D12 |
| 5 | Transactions, savepoints, rollback | app `withTransaction`, `db/demos/02_*.sql` | 5.5 | `tests/test_part3.py::test_transaction_rolls_back…` |
| 6 | Concurrency control (row locks) | `fn_claim_surplus`, `fn_transition_claim`, `trg_lot_ledger` | 5.5 | `CONCURRENCY_EVIDENCE.md`, 4 concurrency tests |
| 7 | Full-text + trigram search | `fn_search_food`, `idx_food_fts`, `idx_food_trgm` | 5.6 | Food catalogue search, Lab, `EXPLAIN_EVIDENCE.md` §5 |
| 8 | Vector similarity search (pgvector) | `name_embedding`, `desc_embedding`, `need_embedding`, HNSW | 5.7 | Name matching page, Marketplace ranking, Q22 |
| 9 | Window functions, CTEs, recursive CTE | catalogue Q02, Q08, Q09, Q13-Q18 | 5.8 | `QUERY_CATALOGUE.md` |
| 10 | Partitioning (RANGE by month) | `006_waste_and_redistribution.sql`, `fn_ensure_waste_partitions` | 5.9 | `EXPLAIN_EVIDENCE.md` §2 |
| 11 | DDL: CREATE / ALTER / DROP | `014_alter_drop_ddl.sql`, `db/demos/01_*.sql` | Req. 5 | `tests/test_part3.py`, `test_demos.py` |
| 12 | State-machine integrity (claims, listings) | T5/T6 + `fn_transition_claim` | 5.4 | Lab demos D05, D06 |
| 13 | Audit trail with session context | T4 + `app.current_user_id` | 5.4 | Audit log page, Lab demo D11 |
| 14 | Data provenance (derived by trigger) | `014` + T2 | - | Query Q21, Analytics "Where the numbers come from" |

Run `python scripts/gen_part3_docs.py` to regenerate the evidence documents from the live database; open **DBMS Lab** in the app to see the objects (`Database objects` tab) and run the queries and demonstrations yourself.

---

## 1. Indexing and query optimisation

**What.** Eleven kinds of access path chosen per query pattern, each with a recorded reason (`docs/DB_OBJECTS.md` lists all 30+ with sizes).

| Index | Type | Why it exists |
|---|---|---|
| `idx_waste_estab_date (establishment_id, occurred_on DESC)` | B-tree, composite | every dashboard filters by establishment + date window |
| `idx_waste_stage_cover (occurred_on, stage) INCLUDE (quantity_kg, establishment_id)` | covering | stage breakdowns answered from the index alone |
| `idx_listing_open (expires_at) WHERE status IN ('OPEN','PARTIALLY_CLAIMED')` | **partial** | the marketplace reads only live listings (a small fraction) |
| `idx_lot_expiry (establishment_id, expires_at) WHERE remaining_qty > 0` | partial | the "expiring soon" list scans only stock that exists |
| `idx_waste_lot (lot_id) WHERE lot_id IS NOT NULL` | partial | **added in Part 3** - Q20 traces spoilage to suppliers via lots |
| `idx_food_fts` | GIN on `tsvector` | full-text search |
| `idx_food_trgm` | GIN `gin_trgm_ops` | typo-tolerant food names |
| `idx_food_name_vec`, `idx_listing_vec`, `idx_recipient_vec` | HNSW `vector_cosine_ops` | nearest-neighbour search |
| `idx_audit_brin` | BRIN | `audit_log` is append-only and time-ordered: a tiny index |
| `uq_mv_zone_monthly` | unique | required for `REFRESH MATERIALIZED VIEW CONCURRENTLY` |

**Why / how - measured, not claimed.** `EXPLAIN_EVIDENCE.md` is generated from the live database: each experiment runs `EXPLAIN (ANALYZE, BUFFERS)` with and without the index (the index is dropped *inside a rolled-back transaction*, so nothing is lost). Typical results (exact timings vary a little on every regeneration; the document holds the figures of its last run): the composite index is roughly 6×, the partial listing index 6-25×, `idx_waste_lot` about 40× (and the whole of Q20 went from a 30-second timeout to under a second), materialised view hundreds of times faster than aggregating the base table, and a correlated subquery rewritten as a window function 50-80× faster with identical results. The document is honest where an index does *not* help: on 81 food rows PostgreSQL correctly prefers a sequential scan, and the GIN/HNSW sections say so while showing the index path is usable.

**An optimisation found by testing.** The first catalogue run of Q20 exceeded its 30 s timeout; `EXPLAIN` showed a sequential scan of `waste_event` for each of ~20,000 lots. Migration 018 adds `idx_waste_lot`. A later migration was *driven by evidence*, which is the point of the exercise.

**Demonstrate.** DBMS Lab → SQL catalogue → Q09 or Q20 → **Run with EXPLAIN ANALYZE**; or `python scripts/gen_part3_docs.py --only explain`.

## 2. Views and the materialised view

**What.** `v_daily_waste` (per establishment per day: total, edible, diverted, cost, CO₂e, per-capita), `v_preparation_efficiency` (prepared vs served, utilisation %, turnout % per closed session), `v_redistribution_performance` (offered / reserved / collected, rescue rate, hours to pickup), and materialised `mv_zone_monthly` (street × kind × month).

**Why.** The same joins would otherwise be repeated in a dozen queries and in the application; views give one definition of "waste". "Waste" **excludes redistributed food** (reason `REDISTRIBUTED`) everywhere - views, queries and dashboards agree. `v_redistribution_performance` aggregates collected quantity per listing in a `LATERAL` subquery first, which avoids the classic join fan-out that double-counts a listing with several claims (tested: offered kg equals the base table exactly).

**Materialised view.** The zone/month roll-up scans every waste event, so it is stored. It is **stale until refreshed** by design; refresh with `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_zone_monthly` (the unique index allows concurrent refresh, so readers are never blocked) - one click in the DBMS Lab for the zone admin (`POST /api/lab/refresh`), and the seed script refreshes it after loading. `tests/test_part3.py` proves both the staleness and the refresh.

**Demonstrate.** Lab → Q13 shows the diversion trend read from the view; click **Refresh the materialised view**.

## 3. Stored functions and the stored procedure

| Object | Kind | Does |
|---|---|---|
| `fn_waste_intensity(est, from, to)` | function | kg wasted per kg served (feeds the establishment dashboard + page) |
| `fn_search_food(q, limit)` | function | full-text rank + trigram + substring, best first (the food pickers use it) |
| `fn_claim_surplus(listing, recipient, qty, score)` | function | **locks the listing row `FOR UPDATE`**, validates every hard rule (open, not expired, same locality via `zone_root()`, cooked-food policy, quantity, capacity), inserts a `REQUESTED` claim |
| `fn_transition_claim(claim, action, estab, recipient)` | function | approve / reject / collect / no-show; reserves or releases listing quantity under lock; writes the redistribution record on collection |
| `sp_close_service_session(...)` | **procedure** (`CALL`) | the core write: records consumption for every batch, closes the session, writes plate-waste events, auto-lists edible leftovers ≥ 2 kg as surplus, records smaller leftovers as waste - all-or-nothing |
| `fn_ensure_waste_partitions(n)` | function | idempotently pre-creates the next *n* monthly partitions |
| `zone_root(zone)` | function (recursive CTE) | top-level ancestor of a zone; the "same locality" rule |

**Why in the database.** The rules hold for *every* client - the app, a SQL console, a future mobile app - and the check-then-write sequence runs next to the data under one lock, which is what makes it concurrency-safe. The application keeps only what is about *people* (who is allowed to press approve, via the permission matrix).

**Error convention.** Procedures raise purpose-chosen SQLSTATEs the app maps to HTTP: `P0002` → 404 ("not yours / not found"), `55000` → 409 (expired, closed, illegal move), `23514` → 422 (rule violated), `42501` → 403. So users get *specific* messages ("Only 4.0 kg are still unreserved; this claim needs 6.0 kg.") instead of a generic failure.

**Demonstrate.** Marketplace → claim → approve (the whole thing is `fn_claim_surplus` + `fn_transition_claim`); Service → close a session and watch the *"Created automatically"* card (that is `sp_close_service_session`); Lab demo D10.

## 4. Triggers

| Trigger | On | Timing | Purpose |
|---|---|---|---|
| **T1** `tr_consumption_balance` | `consumption_record` | BEFORE INSERT/UPDATE | served + leftover ≤ prepared, plate waste ≤ served - a cross-table rule a CHECK cannot express |
| **T2** `tr_waste_enrich` | `waste_event` | BEFORE INSERT | derives cost and CO₂e from the food item **and the provenance** (`measurement_source`): rows with a Mongo lineage → `ETL_IMPORT`, redistribution records → `SYSTEM`. The app can never write wrong economics |
| **T3** `tr_lot_ledger_ins/upd/del` | `waste_event` | **BEFORE** INSERT / UPDATE / DELETE | the inventory ledger: deducts exactly the written-off quantity from the lot under a row lock; refuses overdraw, a lot of another establishment, a mismatching food; restores stock when an event is corrected or deleted |
| **T4** `tr_audit_*` | listing, claim, establishment, recipient | AFTER I/U/D | who changed what, with before/after images (embeddings stripped), attributed through `app.current_user_id` |
| **T5** `tr_claim_guard` | `redistribution_claim` | BEFORE UPDATE | only REQUESTED→APPROVED/REJECTED and APPROVED→COLLECTED/NO_SHOW; claim identity (listing, recipient, quantity) is immutable |
| **T6** `tr_listing_guard` | `surplus_listing` | BEFORE UPDATE OF status | a cancelled listing can never be reopened |

**The audit session variable.** `withTransaction(fn, {userId})` runs `SELECT set_config('app.current_user_id', $1, true)` first; trigger T4 reads it with `current_setting('app.current_user_id', true)`. Rows are attributed to real users without threading an id through every statement. The *Audit log* page (zone admin / auditor) shows who did what, with field-level diffs.

**Bulk-load switch.** The Part 1 seed loads a finished, consistent history with `COPY`. It runs `SET LOCAL zonefood.bulk_load = 'on'` so T3 and T4 do not re-apply or flood that history; application sessions never set it (tested both ways).

**Demonstrate.** DBMS Lab → *Live constraint demos*: each card runs one attempt inside a transaction that is rolled back and shows the database's own refusal with its SQLSTATE and constraint name (D01 T1, D03 T3, D05 T5, D06 T6, D11 T4, D12 T2).

## 5. Transactions, savepoints and rollback

- **Application transactions** (`withTransaction`): BEGIN … COMMIT, or ROLLBACK on any error. Used for registration (establishment + profile + account), procurement (header + lines + lots), session close, claim create/transition, listing create/cancel.
- **Atomicity proven**: a delivery with one bad line writes nothing (integration test); closing a session whose second batch violates T1 leaves the session open and **no** consumption rows (pytest, integration, and visibly in the UI); a registration whose last step fails leaves no orphan establishment.
- **Savepoints**: `db/demos/02_transactions_and_rollback.sql` - write-off succeeds, an overdraw is refused and undone with `ROLLBACK TO SAVEPOINT`, then the whole transaction is rolled back and stock returns to its starting value.

**Demonstrate.** `docker exec -i zonefood-postgres psql -U zonefood -d zonefood < db/demos/02_transactions_and_rollback.sql`, or Service → close a session with leftover that is too big.

## 6. Concurrency and stock consistency

**The migration (the critical point).** In Part 2 the application deducted stock itself (`UPDATE inventory_lot …` in `recordWaste`). Part 3 moves that into trigger **T3**. To guarantee *exactly once*:

1. the application's `UPDATE` was **removed** (it keeps only a read-side pre-check for friendly field errors);
2. T3 deducts, so the UI, the API, the ETL and a SQL console all behave identically;
3. the seed bypasses T3 with `zonefood.bulk_load` so loading history does not deduct twice;
4. tests assert the deduction by *every* path - API (once, not twice), direct SQL (once), bulk-load (zero), update (delta), delete (restore) - plus the invariant `0 ≤ remaining ≤ received` after the seed and after all tests.

**Concurrency tests (real simultaneous connections).** Ten sessions writing off 3 kg from a 10 kg lot → **exactly 3 succeed**, 1 kg remains. Eight recipients' claims (4 kg each) approved at once against a 10 kg listing → **exactly 2 approved**, 8 kg reserved, the rest get 409. Six identical claims by one organisation → **exactly 1** claim. Five concurrent closes of one session → one close, one auto-listing. Also at API level (`part3.test.ts`) and as a timestamped two-session race (`CONCURRENCY_EVIDENCE.md`: session B visibly *blocks* ~3 s on the row lock, then is refused).

**A deadlock the tests caught.** The first T3 was an `AFTER INSERT` trigger and the 10-way test failed with `DeadlockDetected`. Cause: the foreign key from `waste_event.lot_id` is checked by an AFTER trigger that first takes a *shared* `FOR KEY SHARE` lock on the lot; each session held that lock and then asked for `FOR UPDATE` - a lock **upgrade** deadlock. Making T3 a **BEFORE** trigger takes the exclusive lock first, so writers queue. (Migration 017 documents this.) This is a good viva story: it was found by testing, not by reading.

## 7. Full-text and fuzzy search

`fn_search_food` combines `ts_rank` over a generated `tsvector` column (`idx_food_fts`), trigram similarity `%` (`idx_food_trgm`) and substring, ordering exact names first. "panner butter" finds *Paneer Butter Masala*; "biriyani" finds the Biryani dishes; gibberish returns nothing (tests). It backs the food pickers and the Food catalogue page. The PDF's "keyword search fails but semantic succeeds" point is covered in §8.

## 8. pgvector semantic search

**Embeddings.** `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions) executed **locally** through ONNX Runtime in Node (`@huggingface/transformers`, int8-quantised, ~23 MB cached in `.cache/`). No API key, no network at query time. Stored in `vector(384)` columns next to the facts they describe: `food_item.name_embedding`, `recipient_org.need_embedding`, `surplus_listing.desc_embedding`. Metric: cosine (`<=>`), `similarity = 1 − distance`; HNSW indexes.

**Two uses.**
1. **Food-name resolution** (ETL): exact → alias cache → trigram > 0.45 → vector ≥ 0.72 → else *unresolved* (queued for review). Measured on the seed's 32 messy names: **28 / 32 = 88 %**. Honest limits: abbreviations and synonyms (`PBM`, `Roti`) are unresolved, and `Cumin Rice → Curd Rice` was a **false positive** - so fuzzy matches below confidence 0.60 are never cached and are flagged in the imported row's notes.
2. **Surplus ↔ recipient matching**: SQL **hard filters first** (same locality, cooked-food policy, capacity ≥ 50 % of the offer, pickup-window overlap), *then* order the survivors by `0.60 × cosine + 0.25 × capacity fit + 0.15 × proximity`. Pure vector ranking would happily send 40 kg of chicken biryani to a vegetarian shelter with 5 kg capacity, because the text is semantically perfect; similarity only *orders* what is already feasible.

**Semantic beats keyword (the case to show).** A listing "*warm cooked rice and lentils, ready tonight*" matches a recipient whose need profile says "*we serve hot dinner to night-shift workers*" with a similarity far above unrelated profiles, although they share **no keyword**. A `LIKE '%rice%'` search finds neither. Try it: Name matching page, or publish that listing and open **Matches**. The page shows the three score components separately - visible proof the vector layer contributes.

**Limitations (stated, not hidden).** A small general-purpose English model; weak on abbreviations/synonyms and on domain jargon; embeddings are computed on first use (a one-off model download) and backfilled idempotently; `waste_event.notes_embedding` and the "similar past incidents" feature were **not built**, so its HNSW index was dropped (§11).

## 9. Window functions, CTEs, recursive CTEs

Catalogue queries: running totals and shares (**Q02**), `RANK` over money (**Q09**), `LAG` month-on-month (**Q13**), z-score over `ROWS BETWEEN 28 PRECEDING AND 1 PRECEDING` (**Q15**), rolling 7-day mean with a generated calendar (**Q16**), `RANK()`/`PERCENT_RANK()` partitioned by category (**Q17**), `ROLLUP` and `FILTER` (**Q04**), `PERCENTILE_CONT` (**Q12**), `CORR` (**Q06**). **Recursive CTEs**: the locality tree roll-up to any depth (**Q18**), the ancestor expansion that joins area-level events to street-level waste (**Q08**), and the stored function `zone_root()` used by matching.

## 10. Partitioning

`waste_event` is `PARTITION BY RANGE (occurred_on)`, one child per month plus a default. A query on one month scans **1** partition; a query on a non-key column scans **27** (`EXPLAIN_EVIDENCE.md` §2). `fn_ensure_waste_partitions(12)` pre-creates the next twelve months idempotently (tested: second call creates 0). **Why partition here:** the table is the fact table, time-ordered and append-heavy; old months can be detached/archived cheaply, and dashboards almost always filter by date. (The PDF's 400k-row scale would make the gain larger; at 55k rows the *plan shape* is the evidence.) Primary keys on partitioned tables must include the partition key, hence `PRIMARY KEY (waste_id, occurred_on)`.

## 11. DDL: CREATE, ALTER, DROP (Req. 5)

- **CREATE**: 18 versioned, checksummed migrations (`db/migrations/`), tamper-detected, re-runnable.
- **ALTER (migration 014)**: `ALTER TABLE waste_event ADD COLUMN measurement_source … DEFAULT 'MANUAL'` (constant default → no table rewrite), `ADD CONSTRAINT ck_waste_measurement_source CHECK (…)`, back-filled for existing rows, and the T2 function replaced so provenance is *derived by the database*. **Motivation:** dashboards and audits must distinguish typed-in, imported and system-generated figures (query Q21, Analytics page).
- **DROP (migration 014)**: `DROP INDEX idx_wastenote_vec` - an HNSW index on `notes_embedding`, a column that is `NULL` in every row and queried by nothing. Evidence is in the migration header and asserted in tests (`count(notes_embedding) = 0`; the three genuinely used vector indexes remain). It can be recreated with one statement.
- **Safe demonstration**: `db/demos/01_ddl_lifecycle.sql` runs the full CREATE → ALTER (add column, add constraint, change type, rename, create index) → DROP lifecycle on a scratch table inside a transaction that is rolled back; DDL is transactional in PostgreSQL. Never run at start-up.

## 12. Putting it together: one request, every layer

*A recipient claims 5 kg:* browser → `proxy.ts` (session present?) → `POST /api/claims` → origin check → session → **permission** `claim:create` → zod validation → `fn_claim_surplus` (row lock, hard rules, unique constraint) → trigger **T4** writes the audit row attributed to the user → the manager's **Claims** page offers *Approve* (permission `claim:review`) → `fn_transition_claim` reserves the quantity under lock → trigger **T5** re-validates the status move → on pickup the function writes the REDISTRIBUTED waste event → **T2** marks it `SYSTEM` and fills cost/CO₂e → the dashboard KPI "Food redistributed" (a SQL aggregate) rises. Three validation layers (zod → CHECK → triggers) refuse bad input at different depths; the same bad input is refused identically from the UI, the API and psql.
