# Viva questions and answers

Answers describe what this repository actually does. Where a figure is quoted it comes from `EXPLAIN_EVIDENCE.md`, `CONCURRENCY_EVIDENCE.md` or `TEST_REPORT.md`, which are generated from runs.

## Design and choice of databases

**1. Why three data technologies for one project?**
PostgreSQL is the system of record because every figure is a quantity that must balance (prepared ≥ served + leftover, claimed ≤ offered) and every reference must resolve: that needs CHECKs, foreign keys, triggers and ACID transactions. MongoDB holds raw field submissions whose shape differs by establishment kind (restaurants log per-dish plate waste, households log bin weights, supermarkets log SKU markdowns); relationally that is ~40 mostly-NULL columns or an EAV table. pgvector sits *inside* PostgreSQL so a similarity search can be combined with relational filters in one query.

**2. Why not put everything in MongoDB?** Claiming a listing is a read-check-write on a shared quantity under concurrency. Multi-document transactions exist, but the relational model gives declarative constraints and row locks directly, and the analytics (window functions, recursive CTEs, ROLLUP) are SQL's strength.

**3. Why not put everything in PostgreSQL (JSONB)?** It could store the documents, but the raw submissions are an audit record that must never be mutated by processing, their indexes are different (multikey on nested arrays, text), and the time-series bin readings use a native time-series collection. Keeping the raw side separate also makes the ETL (and its idempotency) a real problem rather than a column.

**4. Is the schema normalised?** Yes, to 3NF (see `DATA_MODEL.md` §2): items flattened (1NF), establishment attributes moved out of the event (2NF), category and emission factor moved to food item/category (3NF). One deliberate denormalisation: `cost_estimate` and `co2e_estimate` are stored although derivable, because prices and factors drift and a past month's report must reproduce that month's numbers; trigger T2 guarantees they are consistent at write time.

**5. Why is `zone` self-referencing?** Sector > block > street (and reserved deeper levels). A recursive CTE rolls up to any depth (Q18) without hard-coding three columns; the function `zone_root()` defines "same locality" for matching.

**6. Why subtype tables (`commercial_profile`, …)?** Disjoint specialisation: attributes differ by establishment type; PK = FK gives 1:1, `verify_db.py` checks exactly one profile per establishment.

## Stored logic

**7. Why did you move logic into the database?** The rules must hold for every client (UI, API, ETL, psql). Check-then-write sequences (claim, approve, write-off) must be atomic with a row lock next to the data. The app keeps only authorisation and presentation.

**8. How do you guarantee stock is deducted exactly once?** Only trigger T3 touches `inventory_lot.remaining_qty`; the application's former UPDATE was removed. The seed loads history with a transaction-local switch (`zonefood.bulk_load`) that bypasses T3. Tests assert exactly one deduction for each path (API, SQL, bulk load), a delta on update, restoration on delete, and the invariant `0 ≤ remaining ≤ received` over the whole table.

**9. What deadlock did you meet?** The first T3 was AFTER INSERT. With ten concurrent write-offs PostgreSQL reported a deadlock: the foreign key check on `waste_event.lot_id` takes `FOR KEY SHARE` on the lot, then the trigger tried `FOR UPDATE` — a lock *upgrade* while others hold the shared lock. Making T3 a BEFORE trigger takes the exclusive lock first, so writers queue instead of deadlocking. Result: 10 requests × 3 kg on a 10 kg lot → exactly 3 succeed.

**10. Function vs procedure?** `sp_close_service_session` is a PROCEDURE (called with `CALL`, has INOUT outputs, does a multi-step write); the others are functions because they return a value/rows and are used in expressions or `SELECT`. In PostgreSQL both run inside the caller's transaction; procedures may also control transactions (not needed here).

**11. How do errors reach the user with a useful message?** The functions `RAISE` with chosen SQLSTATEs (`P0002` → 404, `55000` → 409, `23514` → 422, `42501` → 403). The app maps SQLSTATE → HTTP and shows the message ("Only 4.0 kg are still unreserved; this claim needs 6.0 kg.").

**12. Why a BEFORE trigger for the claim state machine (T5)?** `fn_transition_claim` already applies the legal moves, but T5 refuses illegal ones from *any* writer (a manual UPDATE in psql). Defence in depth: the function is the behaviour, the trigger is the invariant.

**13. How does the audit trigger know the user?** `withTransaction` runs `set_config('app.current_user_id', id, true)` (transaction-local); T4 reads `current_setting('app.current_user_id', true)`. If no user is set (a psql session) `changed_by` is NULL.

## Transactions and concurrency

**14. What isolation level do you use?** Default READ COMMITTED. Correctness under concurrency comes from explicit row locks (`SELECT … FOR UPDATE`) at the point of decision, not from raising the isolation level; lock order is always listing → claim to avoid deadlocks.

**15. Demonstrate the claim race.** `db/demos/03_two_terminal_race.md`, or `CONCURRENCY_EVIDENCE.md` which has the timestamped timeline: session B blocks ≈3 s on the listing row, then fails with 'Only 4.0 kg are still unreserved'.

**16. What if the server crashes mid-ETL?** Each document is processed in one PostgreSQL transaction; the Mongo status flip happens after commit. If the crash falls between them, the next run finds the existing rows by `source_doc_id` and only repairs the Mongo status — no duplicates (tested).

## Indexing and performance

**17. Which indexes did you create and why?** See `ADVANCED_DBMS.md` §1 and `DB_OBJECTS.md`. Composite (`establishment_id`, `occurred_on DESC`) for dashboards, covering index for stage breakdowns, *partial* indexes for open listings and lots with stock, GIN for FTS and trigrams, HNSW for vectors, BRIN for the append-only audit table.

**18. Prove an index helps.** `EXPLAIN_EVIDENCE.md`: composite index about 6×, partial listing index 6-25×, `idx_waste_lot` about 40×, materialised view hundreds of times faster than aggregating the base table, window-function rewrite of the correlated subquery 50-80× (identical results); exact figures vary slightly per run and are in the document. Measured with `EXPLAIN (ANALYZE, BUFFERS)` with and without the index (dropped in a rolled-back transaction).

**19. Did you ever find an index does *not* help?** Yes: on 81 food rows PostgreSQL prefers a sequential scan over the GIN/HNSW indexes, and the document says so. At that size the index is a design choice for growth, not a measured win.

**20. How did you find the slow query?** Q20 (supplier spoilage) hit the 30 s timeout; EXPLAIN showed a sequential scan of `waste_event` per lot. The partial index `idx_waste_lot (lot_id) WHERE lot_id IS NOT NULL` (migration 018) brought it under a second.

**21. Why partition `waste_event`?** Time-ordered, append-heavy fact table; almost every query has a date filter. Partition pruning scans 1 partition (versus 27 without the key) for a month filter. Old months can be detached/archived. Note: the primary key must include the partition key (`waste_id, occurred_on`).

**22. View vs materialised view?** A view is a stored query (always current). The materialised view `mv_zone_monthly` stores the result: fast but stale until `REFRESH MATERIALIZED VIEW CONCURRENTLY` (possible because of a unique index, so readers are not blocked). The app shows the refresh button to the zone admin.

## Vector search

**23. What is pgvector doing in your project?** Two things: food-name resolution (ETL cascade: exact → alias cache → trigram > 0.45 → vector similarity ≥ 0.72) and ranking surplus↔recipient matches. Embeddings are 384-d from MiniLM-L6-v2, computed locally (no API key), compared with cosine distance `<=>`, indexed with HNSW.

**24. Why not rank purely by similarity?** Because text similarity ignores feasibility: it would send 40 kg of chicken biryani to a vegetarian shelter with 5 kg capacity. SQL hard filters (locality, cooked-food policy, capacity ≥ 50 % of the offer, pickup window) decide *who is eligible*; then the 0.60 semantic + 0.25 capacity + 0.15 proximity score only *orders* those.

**25. Show a case where keyword search fails and semantic succeeds.** A listing "warm cooked rice and lentils, ready tonight" vs a recipient profile "we serve hot dinner to night-shift workers": no shared keyword, high cosine similarity. `LIKE '%rice%'` finds neither.

**26. How accurate is the name matching, honestly?** 28 of 32 messy names (88 %) on the seed catalogue. Misses: abbreviations and synonyms (`PBM`, `Roti`, `Chappathi`) and one false positive (`Cumin Rice → Curd Rice`). Therefore fuzzy matches below confidence 0.60 are never cached and are flagged in the imported row's notes.

## SQL features

**27. Explain your correlated subquery.** Q03: establishments whose 90-day per-capita waste exceeds their *own category's* average. The subquery in HAVING references the outer row's `category_id` (the correlation) and averages the per-establishment figures of that category. The catalogue also gives the window-function rewrite and the speed difference.

**28. Where do you use a recursive CTE?** Q18 (roll-up of waste through the zone tree), Q08 (ancestor expansion so area-level events join street-level waste) and the function `zone_root()`.

**29. Show a window frame.** Q15: `AVG(x) OVER (… ROWS BETWEEN 28 PRECEDING AND 1 PRECEDING)` — the *previous* 28 days excluding today, so today's spike does not inflate its own baseline; z-score above 2.5 is flagged.

**30. How did you avoid double counting in `v_redistribution_performance`?** Claims are aggregated per listing in a `LATERAL` subquery before joining, so a listing with three claims is counted once. A test compares the view's offered kg with the base table.

**31. What are Q23–Q26?** The DML catalogue: INSERT…SELECT, UPDATE with RETURNING, DELETE with a subquery (trigger T3 restores stock), UPSERT `ON CONFLICT DO UPDATE`. In the DBMS Lab they always run inside a rolled-back transaction.

## DDL

**32. Show ALTER and DROP.** Migration `014_alter_drop_ddl.sql`: ALTER adds `waste_event.measurement_source` (constant default, so no table rewrite) plus a CHECK, back-fills, and the T2 function derives it; DROP removes `idx_wastenote_vec`, an HNSW index on a column that is NULL in every row and queried by nothing. `db/demos/01_ddl_lifecycle.sql` runs CREATE → ALTER → DROP on a scratch table, rolled back (DDL is transactional in PostgreSQL).

**33. How is the schema versioned?** Numbered SQL files, each applied in its own transaction and recorded with a SHA-256 in `schema_migrations`. Editing an applied file is rejected; changes are new migrations.

## Security and application

**34. How are passwords and sessions handled?** bcrypt cost 12, only hashes stored; signed httpOnly SameSite=Lax cookie (HS256 JWT holding only the user id); role and active status are re-read from the database on each request, so deactivation is immediate; 5 failed logins lock that key for 15 minutes; same-origin check on mutations.

**35. How do you prevent one establishment seeing another's data?** Tenant scoping in SQL (`WHERE establishment_id = $user.establishment`), never trusted from the client; other tenants' records answer 404/403, not "exists". Integration tests request other tenants' ids and assert the refusal.

**36. SQL injection?** All SQL is parameterised (`pg` with `$1…`). The DBMS Lab never executes client-supplied SQL: it looks queries up *by id* from `db/queries`.

**37. Is the DBMS Lab dangerous?** SELECTs run in a READ ONLY transaction; DML is always rolled back; 20 s timeout; 200-row cap; only admin/auditor may open it; the only write it can perform is the materialised-view refresh (admin).

## Honest limitations

**38. What is not done / not perfect?** (a) ~55k seeded waste rows rather than the plan's 400k, so some index gains are plan-shape evidence rather than seconds. (b) Query 21 differs from the plan (forecasting is Part 4). (c) The ALTER/DROP targets differ from the plan's suggestion (reason in the traceability matrix). (d) The embedding model is small and English-only; abbreviations are weak. (e) Team member names/roles and the per-member Git history are for the team to provide; Git was not initialised (the repository root is a home directory). (f) The working database contains synthetic data plus some QA debris from walkthroughs — a `setup_db.py --reset` returns it to a clean seed.
