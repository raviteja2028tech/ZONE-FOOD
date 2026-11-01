# Architecture

## Target architecture (Parts 1-3; from Master Plan §3)

```
Browser ──► Next.js (App Router)  — the only caller of the databases
              ├─ Route Handlers /api/*  ──► node-postgres (raw parameterised SQL) ──► PostgreSQL 16 + pgvector
              │                          └─► mongodb driver ─────────────────────► MongoDB 7
              └─ embeddings computed locally in Node (MiniLM-L6-v2 via ONNX Runtime), written back through the same path
```

Rules that keep it clean: the browser never touches a database; PostgreSQL is the system of record; MongoDB holds raw,
variably shaped submissions at the edge; every credential comes from environment variables; no ORM (raw SQL keeps the DDL and
query craft visible to the faculty reviewer and plays well with triggers, partitions and vector columns).

## Infrastructure (Part 1)

```
┌──────────────────────────── Docker Compose (docker-compose.yml) ────────────────────────────┐
│  postgres  pgvector/pgvector:pg16   127.0.0.1:5433 → 5432   volume zonefood_pgdata           │
│  mongo     mongo:7                  127.0.0.1:27018 → 27017  volume zonefood_mongodata        │
│  both with health checks; ports bound to loopback only; credentials from .env                 │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲                                     ▲
        │ psycopg 3 (parameterised)           │ pymongo
  scripts/migrate.py  db/migrations/*.sql     scripts/mongo_init.py (collections, validators, indexes)
  scripts/seed.py  (COPY bulk load)           scripts/seed.py  (insert_many)
  scripts/verify_db.py · scripts/gen_docs.py · tests/ (pytest, throw-away databases)
```

### Data flow (database scripts)

1. `migrate.py up` applies `db/migrations/NNN_*.sql` in order, each in its own transaction, recording version + SHA-256 in
   `schema_migrations`. Editing an applied file is rejected; schema changes are made by adding a new migration.
2. `seed.py` truncates the demo tables (lookup rows from migration 010 survive), generates all rows in memory from one seeded RNG,
   bulk-loads them with `COPY`, resets sequences, refreshes the materialised view, then rebuilds and fills the Mongo
   collections. It sets `zonefood.bulk_load = 'on'` for its own transaction so the finished history is not re-deducted or re-audited
   by triggers T3/T4 (T1/T2 still run). SYNCED Mongo submissions have matching PostgreSQL rows carrying `source_doc_id`.
3. `verify_db.py` checks schema objects, row counts, relational invariants, smoke queries and the Mongo/Postgres cross-links.
4. `gen_docs.py` derives the ER diagram and data dictionary from `pg_catalog`.

### Source of truth and failure behaviour

* PostgreSQL is authoritative for all facts. Mongo `waste_submissions` is the authoritative *raw* record and is never edited by the ETL
  except to flip `sync_status`.
* The ETL is idempotent: PostgreSQL rows carry `source_doc_id`, so a retry after a partial failure detects already-written documents
  instead of duplicating them; failures set `sync_status = FAILED` with an error rather than being dropped.

## Web application layer (Part 2)

```
Browser (React 19, Tailwind 4, Recharts)
   |  fetch JSON / navigations
   v
proxy.ts  ---- coarse gate: signed-out -> /login (NOT authorisation)
   v
Next.js 16 (Node runtime)
   |-- pages (server components): requirePageUser(permission) -> repositories -> render
   |-- API routes: api(permission, handler)  =  origin check -> session -> permission -> zod -> repository
   |       |-- lib/auth        permissions matrix . bcrypt . jose session . lockout
   |       |-- lib/domain      pure rules: claim state machine . hybrid score . name policy . ETL adapters
   |       |-- lib/db/repositories   explicit parameterised SQL, one module per feature, transactions via withTransaction
   |       |-- lib/embeddings  MiniLM-L6-v2 (ONNX, local) -> 384-d vectors
   |       '-- lib/validation  zod schemas (layer 1 of 3)
   v                                   v
PostgreSQL 16 + pgvector          MongoDB 7
 system of record                  waste_submissions (variable shapes), inspection_reports,
 29+ tables, triggers (layer 3),   activity_stream (audit trail), bin_readings, establishment_meta
 CHECKs (layer 2), zone_root()
```

### Data flow 1 - the redistribution lifecycle (all PostgreSQL, transactional)
`procurement` (+lines+lots, one txn) -> `inventory_lot` -> `service_session`/`preparation_batch`/`consumption_record` (trigger validates; close is one procedure call) -> `waste_event` (T3 deducts the lot; T2 derives cost + CO2e) -> `surplus_listing` (description embedded) -> ranked recipients (SQL hard filters, then 0.60 cosine + 0.25 capacity + 0.15 proximity) -> `redistribution_claim` (`fn_claim_surplus` locks the listing; unique per listing+recipient) -> approve (`fn_transition_claim` reserves quantity, re-checked under lock) -> collect (writes the REDISTRIBUTED/DONATION `waste_event`) or no-show (release).

### Data flow 2 - MongoDB -> PostgreSQL (the ETL)
```
establishment staff -> POST /api/submissions -> validated per establishment kind -> MongoDB waste_submissions {sync_status: PENDING}
admin "Run sync" -> findOneAndUpdate lease (sync_lock) -> adapter by kind -> name resolution cascade
      exact -> food_alias cache -> trigram > 0.45 -> pgvector cosine >= 0.72 -> else UNRESOLVED (review queue)
   -> one PostgreSQL transaction: INSERT waste_event(source_doc_id = Mongo _id) ; trigger fills cost/CO2e and provenance ETL_IMPORT
   -> Mongo: SYNCED + sql_waste_ids          (on error: FAILED + safe sync_error + attempts++)
```
Source of truth: PostgreSQL for validated facts, MongoDB for the raw submission. **Idempotency:** rows carry `source_doc_id`; before writing, the ETL checks for existing rows, so a crash between COMMIT and the Mongo update is repaired by the next run without duplicates. **Retry:** FAILED documents can be retried singly or in bulk (max 5 attempts); each run is logged in `etl_run_log`.

### Why each database
PostgreSQL: relational integrity, transactions, triggers, partitioning, pgvector next to the facts it describes. MongoDB: submissions and inspection checklists whose shape differs by establishment kind or audit round, plus an append-only activity stream. pgvector: surplus-to-need matching and canonical food-name resolution.

## Part 3 - the database-side logic layer

Part 2 kept some business rules in TypeScript. Part 3 moves every rule that must hold **for every client** into PostgreSQL, so the UI, the REST API, the ETL and a psql console are all subject to the same guarantees, and the check-then-write sequences run next to the data under row locks.

```
Route handler (permission + zod)  ->  repository (thin: parameters in, rows out)
                                          |
                                          v
   fn_claim_surplus . fn_transition_claim . sp_close_service_session . fn_search_food . fn_waste_intensity
                                          |
        T1 consumption balance    T2 cost/CO2e + provenance    T3 inventory ledger (lot stock)
        T4 audit (who/what/before/after)   T5 claim state machine   T6 listing guard
                                          |
                    CHECK / FK / UNIQUE   (layer 2)        views v_* + mv_zone_monthly (read models)
```

| Concern | Where it is decided | Why there |
|---|---|---|
| Who may press the button | app permission matrix | about people and sessions, not data |
| Is this claim allowed (open, unexpired, same locality, cooked policy, quantity, capacity) | `fn_claim_surplus` | must be atomic with the insert and the listing row lock |
| Legal claim status moves, reserve / release quantity | `fn_transition_claim` + T5 | function for behaviour, trigger as last line of defence against any writer |
| Stock leaves a lot | T3 (exactly once) | one place; no code path can forget or double it |
| Cost, CO2e, provenance of a waste figure | T2 | the app can never write wrong economics |
| Audit trail | T4 + `app.current_user_id` | cannot be bypassed by a code path that forgets to log |
| Closing a service session | `sp_close_service_session` | one all-or-nothing procedure: consumption, plate waste, auto-listing |
| Dashboards and analytics | SQL views / catalogue queries | one definition of "waste", shared by screens and docs |

### Data flow 3 - closing a service session
Close request -> permission -> zod -> `withTransaction({userId})` sets `app.current_user_id` -> `CALL sp_close_service_session(...)` -> per batch: consumption row (T1 validates) -> session closed -> plate-waste `waste_event` rows (T2 enriches) -> leftover of 2 kg or more becomes a `surplus_listing` (T4 audits), smaller leftovers are recorded as waste -> the app embeds the new listing descriptions afterwards (failure only leaves a NULL embedding) -> the response lists what was created. Any violation anywhere rolls the whole close back.

### Data flow 4 - a stock write-off
Write-off request -> repository inserts one `waste_event` row (no UPDATE of the lot in the app) -> **BEFORE INSERT T3** locks the lot `FOR UPDATE`, checks establishment / food / overdraw, deducts exactly the quantity -> T2 fills cost and CO2e -> row stored. Editing the quantity or deleting the event makes T3 restore the difference. Concurrent write-offs queue on the lot lock (10 simultaneous 3 kg requests on a 10 kg lot: exactly 3 succeed).

### DBMS Lab (demonstration surface)
`/lab` (zone admin and auditor) runs the catalogue and twelve live constraint demonstrations **by id only** (the server looks the SQL up in `db/queries`; client-supplied SQL is never executed). SELECTs run in a READ ONLY transaction, DML is always rolled back, with a 20 s statement timeout and a 200-row cap; EXPLAIN ANALYZE wraps the same statement. The one write the Lab can perform is the materialised-view refresh, for the zone admin.

### Generated evidence
`scripts/gen_part3_docs.py` regenerates `QUERY_CATALOGUE.md`, `EXPLAIN_EVIDENCE.md`, `CONCURRENCY_EVIDENCE.md`, `DB_OBJECTS.md` and `MONGODB_DESIGN.md` from the live databases, and `scripts/gen_docs.py` the ER diagram and data dictionary. Nothing in them is typed by hand.

## Not built (by design)

Part 4 (forecasting layer, similar-incident search on waste notes, traceability tier T4) - optional and never started without explicit approval.
