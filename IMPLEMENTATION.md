# ZoneFood - what has actually been implemented

This document describes the implementation as it exists in the repository and the running databases (Parts 1-3 and the forecasting extension). Every statement was taken from the source tree, the migrations, the live catalogue or a test run; nothing here is aspirational. Companion documents: `README.md` (how to run), `docs/` (generated evidence), `CURRENT_STATUS.md` (state and test results).

## 1. Purpose and architecture

ZoneFood tracks food across a whole urban zone - procurement → inventory → preparation → service → waste → surplus redistribution - for heterogeneous establishments (restaurants, college messes, hospitals, supermarkets, households…), so questions such as *where is food wasted, why, could the surplus reach someone who needs it, and how much will be wasted tomorrow* become database queries. All data is synthetic.

```
Browser (React 19, Tailwind 4, Recharts, motion, gsap on sign-in only)
   │  HTTPS-style JSON / navigations
   ▼
src/proxy.ts   coarse gate (signed-out → /login)
   ▼
Next.js 16 (App Router, Turbopack, Node runtime)
   ├─ server components (pages)  requirePageUser(permission) → repositories → render
   ├─ 42 route handlers          api(permission, handler): origin check → session → permission → zod → repository
   ├─ lib/auth        permission matrix · bcrypt · jose session · login lockout
   ├─ lib/domain      pure rules (claim state machine, hybrid score, name policy, ETL adapters)
   ├─ lib/db          raw parameterised SQL (pg), one repository per feature, withTransaction
   ├─ lib/embeddings  MiniLM-L6-v2 through ONNX Runtime (local, 384-d)
   ▼                                   ▼
PostgreSQL 16 + pgvector 0.8       MongoDB 7
   system of record                 raw variable-shape submissions, inspections,
   35 tables · 6 triggers ·         bin-sensor time series, activity stream
   7 routines · 3 views + 1 MV
Offline Python:  scripts/ (migrate, seed, verify, catalogue docs, forecast.py) · tests/ (pytest)
```

| Layer | Technology (versions from `package.json` / `requirements.txt`) |
|---|---|
| Web | Next.js 16.4, React 19.3, TypeScript 6, Tailwind CSS 4.3, Recharts 3.10, sonner, lucide-react, `motion` 14.9, `gsap` 3.15 (sign-in hero only) |
| API / auth | route handlers, zod 4 validation, jose (HS256 session), bcryptjs (cost 12) |
| Databases | PostgreSQL 16 + pgvector + pg_trgm (Docker), MongoDB 7 (Docker); `pg` 8 and `mongodb` 7 drivers, no ORM |
| Embeddings | `@huggingface/transformers` (all-MiniLM-L6-v2, int8 ONNX, cached in `.cache/`) |
| Database tooling | Python 3.11+ (psycopg 3, pymongo, bcrypt), versioned SQL migrations with SHA-256 checksums |
| Forecasting | pandas, NumPy, scikit-learn (Ridge), LightGBM |
| Tests | pytest, vitest 5 (unit + integration), ESLint, `tsc` |

## 2. PostgreSQL schema

Nineteen migrations (`db/migrations/001-019`), each applied in its own transaction and recorded in `schema_migrations` with a checksum (editing an applied file is rejected).

| Migration | Content |
|---|---|
| 001 | extensions (`vector`, `pg_trgm`), enums |
| 002 | zone hierarchy (self-referencing), establishment categories, `establishment` supertype + 3 disjoint subtype tables |
| 003 | `recipient_org`, `app_user` (`ck_user_scope` ties role to tenant), |
| 004 | food categories, emission factors, `food_item`, `supplier`, `procurement`, `procurement_line`, `inventory_lot` |
| 005 | `dish`, `dish_ingredient` (M:N), `service_session`, `preparation_batch`, `consumption_record` |
| 006 | `waste_reason`, `disposal_route`, **`waste_event` (RANGE-partitioned by month, 28 partitions)**, `surplus_listing`, `redistribution_claim` |
| 007 | `locality_event`, `zone_event` (M:N), `audit_log` |
| 008 | 23 indexes (composite, covering, partial, GIN FTS + trigram, HNSW vectors, BRIN) |
| 009 | triggers T1 (consumption balance) and T2 (cost/CO₂e derivation) |
| 010-011 | reference data; column/table comments (feeds the data dictionary) |
| 012 | `food_alias`, `etl_run_log`, index on `waste_event.source_doc_id` |
| 013 | `zone_root()` recursive function |
| 014 | **ALTER** (`waste_event.measurement_source` + CHECK, back-fill), T2 redefined for provenance, **DROP** of the unused index `idx_wastenote_vec` |
| 015 | views `v_daily_waste`, `v_preparation_efficiency`, `v_redistribution_performance`; materialised view `mv_zone_monthly` |
| 016 | functions `fn_waste_intensity`, `fn_search_food`, `fn_claim_surplus`, `fn_transition_claim`, `fn_ensure_waste_partitions`; procedure `sp_close_service_session` |
| 017 | triggers T3 `tr_lot_ledger`, T4 `tr_audit`, T5 `tr_claim_guard`, T6 `tr_listing_guard` |
| 018 | partial index `idx_waste_lot` |
| 019 | forecasting tables `forecast_run`, `forecast_eval_daily`, `forecast_prediction`, `forecast_importance` |

Live row counts on the working database: `waste_event` 55,537 · `inventory_lot` 19,873 · `procurement` 7,895 · `service_session` 9,510 · `preparation_batch` 21,986 · `consumption_record` 21,975 · `surplus_listing` 4,430 · `redistribution_claim` 3,938 · 56 establishments · 81 food items. The full ER diagram and data dictionary are generated from the catalogue: `docs/ER_DIAGRAM.md`, `docs/DATA_DICTIONARY.md`; normalisation (1NF-3NF and the deliberate denormalisation of `cost_estimate`/`co2e_estimate`) is in `docs/DATA_MODEL.md`.

**Integrity in layers:** zod at the API → CHECK / FK / UNIQUE / enum → triggers and functions for cross-table rules. Examples: `ck_listing_balance` (claimed ≤ offered), `ck_lot_balance`, `ck_user_scope`, `ck_closed_has_actuals`, one claim per (listing, recipient), `ON DELETE RESTRICT` on zones with establishments.

## 3. Advanced DBMS features (all exercised by tests)

| Feature | Implementation |
|---|---|
| **Triggers** | T1 `tr_consumption_balance` (served + leftover ≤ prepared); T2 `tr_waste_enrich` (cost, CO₂e and provenance derived by the database); **T3 `tr_lot_ledger`** BEFORE insert/update/delete on `waste_event` - the only code that changes lot stock, deducts exactly once under a row lock, refuses overdraw, restores on edit/delete; T4 `tr_audit` (before/after images, user from `app.current_user_id`); T5 `tr_claim_guard` (legal status moves, immutable claim identity); T6 `tr_listing_guard` (cancelled stays cancelled). Bulk-load switch `zonefood.bulk_load` is set only by the seed. |
| **Stored routines** | `fn_claim_surplus` (locks the listing `FOR UPDATE`, applies every hard rule, inserts a REQUESTED claim), `fn_transition_claim` (approve / reject / collect / no-show; reserves and releases quantity under lock; collection writes the REDISTRIBUTED waste row), `sp_close_service_session` (procedure with INOUT outputs: consumption, plate waste, automatic surplus listings ≥ 2 kg), `fn_search_food`, `fn_waste_intensity`, `fn_ensure_waste_partitions`, `zone_root`. Error SQLSTATEs map to HTTP: `P0002`→404, `55000`→409, `23514`→422, `42501`→403, `23505`→409. |
| **Views / materialised view** | three views plus `mv_zone_monthly` (unique index → `REFRESH … CONCURRENTLY`; refresh button for the zone admin). "Waste" excludes REDISTRIBUTED everywhere. |
| **Indexes and plans** | composite, covering, partial (`idx_listing_open`, `idx_lot_expiry`, `idx_waste_lot`), GIN (FTS, trigram), HNSW (vectors), BRIN (audit). Measured with EXPLAIN (ANALYZE, BUFFERS) in `docs/EXPLAIN_EVIDENCE.md`. |
| **Partitioning** | `waste_event` by month; pruning shown (1 vs 27 partitions scanned); `fn_ensure_waste_partitions(n)` pre-creates future months. |
| **Transactions and concurrency** | `withTransaction` (BEGIN/COMMIT/ROLLBACK, sets the audit user); atomic delivery, session close, registration. Real concurrent tests: 10 simultaneous write-offs on a 10 kg lot → exactly 3 succeed; 8 concurrent approvals → 2; 6 duplicate claims → 1. A deadlock found in testing (AFTER trigger + FK `KEY SHARE`) was fixed by making T3 a BEFORE trigger. Evidence: `docs/CONCURRENCY_EVIDENCE.md`. |
| **Full-text and vector search** | `fn_search_food` (tsvector + trigram + substring); pgvector cosine/HNSW. Matching = SQL hard filters (locality via `zone_root`, cooked-food policy, capacity ≥ 50 % of offer, pickup window), then 0.60 cosine + 0.25 capacity + 0.15 proximity. Name resolution cascade: exact → alias cache → trigram > 0.45 → vector ≥ 0.72 → review queue (88 % measured on 32 messy names). |
| **DDL lifecycle** | CREATE (001-013), ALTER + DROP (014), safe scratch-table demo `db/demos/01_ddl_lifecycle.sql`, transaction/savepoint demo, two-terminal race guide. |

## 4. SQL query catalogue

`db/queries/Q01-Q26`, each file carrying title, concepts, purpose, SQL and a reading guide; rendered with live results in `docs/QUERY_CATALOGUE.md`. Q01-Q20 follow the plan (joins, GROUP BY/HAVING, correlated subquery Q03, ROLLUP/FILTER Q04, CORR Q06, recursive CTEs Q08/Q18, partial index Q09, anti-join Q11, PERCENTILE_CONT Q12, materialised view + LAG Q13, z-score window frame Q15, rolling average Q16, RANK/PERCENT_RANK Q17, multi-hop join Q20); Q21 is data provenance (replaces forecast accuracy, see traceability D1); Q22 pgvector LATERAL; Q23-Q26 are DML (INSERT…SELECT, UPDATE, DELETE with subquery, UPSERT). All 26 return rows on the working database and are executed by `tests/test_catalogue.py`.

## 5. MongoDB integration

Five collections created by `scripts/mongo_init.py`: `waste_submissions` (envelope validated by `$jsonSchema`, payload free-form per establishment kind; 15 distinct shapes in the seed), `inspection_reports`, `bin_readings` (time-series), `establishment_meta`, `activity_stream` (capped). The ETL (`src/lib/db/repositories/etl.ts`): lease in `sync_lock`, adapter by kind, name-resolution cascade, one PostgreSQL transaction per document with `source_doc_id` for idempotency, FAILED + safe error + retry (max 5 attempts), run log in `etl_run_log`. Design and a live `$facet` aggregation: `docs/MONGODB_DESIGN.md`.

## 6. Authentication and roles

Five roles - `ZONE_ADMIN`, `AUDITOR` (read-only), `ESTAB_MANAGER`, `ESTAB_STAFF`, `RECIPIENT_AGENT`. Registration of an establishment or a recipient organisation is one transaction. Login: bcrypt cost 12, signed httpOnly SameSite=Lax cookie carrying only the user id (8 h), role/active flag re-read from the database each request, lockout after 5 failures in 15 min, same-origin check on mutations. The permission matrix (`src/lib/auth/permissions.ts`) drives API guards, page guards and navigation; scope ("own establishment") is applied in SQL.

## 7. Application workflows (all through real routes, covered by integration tests)

Procurement → inventory lots with expiry · open service session → add batches → close (procedure) → consumption, plate waste, automatic surplus listing · waste recording with stock deduction by trigger · surplus listing with ranked recipients · recipient claim → manager approve/reject → handover / collected / no-show → redistribution record · field logs and inspections into MongoDB → ETL → PostgreSQL · zone and establishment dashboards · analytics · forecast · audit log · DBMS Lab.

## 8. Frontend

Pages (`src/app`): public `login`, `register`; shell `Overview` (role-specific KPIs, Zone pulse rings, redistribution pipeline), `analytics`, **`forecast`**, `establishments(+[id])`, `recipients(+[id])`, `zones`, `procurement`, `inventory`, `service(+[id])`, `waste`, `surplus`, `feed`, `claims`, `submissions`, `inspections`, `food`, `matching`, `etl`, **`lab`**, `audit`, `system`, `access-denied`. Components: layout shell with command palette (Ctrl+K), light/dark themes, KPI cards with spotlight, count-up numbers, sparklines, accessible tables, native-`<dialog>` modals, chart components with a table alternative. Animation (`motion`; `gsap` only for the sign-in hero) respects `prefers-reduced-motion`.

The **DBMS Lab** (`/lab`, admin/auditor) runs the 26 catalogue queries and 12 constraint demonstrations *by id only* (no client SQL): SELECT in a READ ONLY transaction, DML always rolled back, 20 s timeout, 200-row cap; it also lists every table, index, view, function and trigger from the live catalogue. The **forecast page** is described in `docs/FORECASTING.md`.

## 9. Forecasting (`scripts/forecast.py`)

Next-day waste per establishment from 150 days of recorded history; models: seasonal naive, Ridge, LightGBM; chronological train/validation/test; shifted features; hyper-parameters chosen on validation only; stored in migration-019 tables; shown on `/forecast`. Stored run: Ridge zone RMSE 292 kg/day vs baseline 418 (LightGBM 332); LightGBM best per kitchen. Full method, results and limitations: `docs/FORECASTING.md`. Tests: `tests/test_forecast.py` (6) and `tests-web/integration/forecast.test.ts` (4).

## 10. Testing performed

Run by `python scripts/run_all_tests.py` (parses machine-readable output into `docs/TEST_REPORT.md`; final numbers are in `CURRENT_STATUS.md` and that report):

| Suite | Scope |
|---|---|
| pytest (`tests/`) | migrations from empty, checksum tampering, constraints, triggers T1-T6, procedures, views, partitions, stock-once invariants, 26 catalogue queries, demos, real multi-connection concurrency, forecasting pipeline |
| vitest unit | permission matrix, claim state machine, scoring, name policy, ETL adapters, rate limiter, zod schemas, env |
| vitest integration (disposable `zonefood_webtest` DB + Mongo) | auth, sessions, RBAC (403/404), registration atomicity, lifecycle workflows, validation, concurrency, ETL idempotency/retry/lease, pgvector, Lab API, dashboard correctness, audit attribution, forecast API |
| static / build | `tsc --noEmit`, ESLint, `next build` |
| browser (headless Chromium) | every screen per role, light/dark, 390/820/1440 px, zero console errors / overflow, modals |

## 11. Repository layout

```
docker-compose.yml     PostgreSQL 16 + pgvector and MongoDB 7 (loopback ports, named volumes, health checks)
.env.example           configuration template (real .env is git-ignored)
db/migrations/         001-019 SQL migrations (schema source of truth)
db/queries/            Q01-Q26 catalogue          db/demos/   safe DDL / transaction / race demonstrations
scripts/               migrate.py mongo_init.py seed.py seed_catalog.py verify_db.py setup_db.py forecast.py
                       catalogue.py gen_docs.py gen_part3_docs.py run_all_tests.py db_config.py
tests/                 pytest suites          tests-web/{unit,integration}/   vitest suites
src/app/               pages and 42 API route handlers      src/components/   ui, layout, charts, forms, dashboard, auth, lab, motion
src/lib/               auth, db (+repositories), domain, embeddings, http, validation, lab.ts, dashboard.ts
scripts-web/           prepare-demo.ts (embeddings + live demo listings)
docs/                  generated + hand-written documentation, screenshots/
README.md  IMPLEMENTATION.md  FRIEND_SETUP_GUIDE.md  CURRENT_STATUS.md  AGENTS.md  ZoneFood_Master_Plan.pdf  ZoneFood_WORKFLOW.md
```

## 12. Important decisions

Rules that must hold for every client live in the database; stock is deducted by trigger exactly once; the seed bypasses T3/T4 through a transaction-local setting; error SQLSTATEs are a contract; the Lab accepts ids not SQL; "waste" excludes redistributed food everywhere; local embeddings (no API key); forecasts are trained offline and stored so every dashboard figure is traceable to a run. The full list (48+ entries) is `docs/DECISIONS.md`.

## 13. Limitations (honest)

* ~55k waste rows (152 days, 56 establishments) rather than the plan's 400k; plan-shape evidence rather than large timings (see `docs/REQUIREMENTS_AUDIT.md`).
* Q21 is data provenance, not forecast accuracy; the ALTER/DROP targets differ from the plan's example (traceability D1-D2).
* The embedding model is small and English-only (88 % name resolution; one false positive).
* Forecasts: synthetic data, 28-day test window, one-day horizon, training is an offline command.
* Team names and individual commit history must be supplied by the team (`docs/TEAM_AND_CONTRIBUTIONS.md`).
* A React message "use() … conditional" was reported once in the Next.js dev log; it could not be reproduced in scripted browser tests (see `CURRENT_STATUS.md`) and defensive changes were made.
