# Requirements traceability

Source: `ZoneFood_Master_Plan.pdf` (§ numbers refer to it) and `ZoneFood_WORKFLOW.md`. "Req. n" are the course-requirement numbers as
listed in the plan's §14; the original brief is not in the repo (see DECISIONS Q3).
Status legend: **Verified** = implemented and a command/test proves it · Pending (Pn) = later part · Excluded = Part 4/optional.

## Part 1 — mandatory

| ID | Requirement | Source | Implementation | Verification | Status |
|---|---|---|---|---|---|
| P1.1a | Requirements extracted, mapped, optional separated | WORKFLOW 1.1 | this file, DECISIONS.md, CURRENT_STATUS.md | review | Verified |
| P1.1b | README, ARCHITECTURE, DECISIONS, .gitignore, .env.example | WORKFLOW 1.1 | repo root, `docs/` | files exist; no secrets (`.env` ignored) | Verified |
| P1.2a | `docker compose config` succeeds | WORKFLOW 1.2 | `docker-compose.yml` | `docker compose config -q` | Verified |
| P1.2b | PostgreSQL 16 + pgvector, MongoDB 7 start healthy | §3, 1.2 | compose services + health checks | `docker compose up -d --wait`; `docker compose ps` | Verified |
| P1.2c | Postgres connection; `vector` extension enabled | 1.2 | migration 001 | `verify_db.py`; pgvector 0.8.7; pytest vector test | Verified |
| P1.2d | Restart does not erase data | 1.2 | named volumes | `docker compose down`/`up`: counts identical (54603 waste rows, 656 docs) | Verified |
| P1.3a | Migrations run from empty DB; schema recreatable without manual SQL | 1.3; Req. 5 | `db/migrations/001–011`, `migrate.py` | pytest `test_migrations_apply_from_empty…`, `test_reset_rebuilds…` | Verified |
| P1.3b | PK/FK/UNIQUE/NOT NULL/CHECK, types, indexes | §4.3, §5.1; Req. 5, 12 | migrations 002–008 | 17 negative tests in `tests/test_part1.py` | Verified |
| P1.3c | Disjoint specialisation, self-referencing zone, M:N tables | §4.1 | 002, 005, 007 | `verify_db.py` invariants | Verified |
| P1.3d | Cross-table integrity trigger (T1) and derivation trigger (T2) | §5.4 | migration 009 | tests: trigger rejection + cost/CO₂e derivation | Verified |
| P1.3e | `waste_event` partitioned monthly; pruning | §5.9 | migration 006 | pytest partition routing + `EXPLAIN` pruning | Verified |
| P1.3f | ER diagram matches implemented schema | 1.3 | `docs/ER_DIAGRAM.md` generated from catalog | `gen_docs.py --check`; pytest; Mermaid parsed with mermaid 11.4.1 | Verified |
| P1.3g | Data dictionary (Req. 14) | §4.4 | `docs/DATA_DICTIONARY.md`, migration 011 comments | `gen_docs.py --check` | Verified |
| P1.3h | MongoDB collections with a real use case; PG-vs-Mongo split documented | §2.2, §6, 1.3 | `mongo_init.py`, DATA_MODEL.md | pytest: validator, shapes, indexes, time-series, capped | Verified |
| P1.3i | Normalisation note (Req. 14) | §4.2 | DATA_MODEL.md | review | Verified |
| P1.4a | Synthetic, deterministic, repeatable seed; labelled synthetic | §10, 1.4 | `seed.py`, `seed_catalog.py` | `setup_db.py --reset` run; pytest determinism (fixed `--end-date`) | Verified |
| P1.4b | Valid relationships; non-empty analytics | 1.4 | seed | `verify_db.py` 55/55 (invariants + 7 smoke queries) | Verified |
| P1.4c | Mongo variable-schema examples; messy names; PG↔Mongo cross-links | §10, §6 | seed | `verify_db.py` Mongo section; 15 payload shapes | Verified |
| P1.4d | Planted signals discoverable | §10 rule 4 | seed | pytest `test_planted_signals_exist` | Verified |

## Part 2 - implemented and verified

| ID | Requirement | Plan § | Implemented in | Verified by | Status |
|---|---|---|---|---|---|
| P2.1a-d | App skeleton, DB layers from env, health APIs, error handling, validation | §8 | `src/lib/{db,env,http,log,validation}`, `src/app/api/health` | integration `databases`/`failures`, build | Verified |
| P2.2a | Registration + login/logout, bcrypt hashing | §9; Req. 11 | `api/auth/*`, `lib/auth/password.ts`, `repositories/accounts.ts` | `auth.test.ts` (hash format, generic error, lockout) | Verified |
| P2.2b | Signed httpOnly session, protected routes | §9 | `lib/auth/session.ts`, `guard.ts`, `proxy.ts` | tamper / expiry / deactivation tests; browser walkthrough | Verified |
| P2.2c | Role-based access (5 roles), server-side enforcement, tenant scoping | §9; Req. 12-13 | `lib/auth/permissions.ts`, `lib/http/api.ts`, `lib/http/scope.ts` | unit permission matrix; 403/404 integration tests; browser role checks | Verified |
| P2.3a | Establishment registration/management | §8.1 | `accounts.ts`, `organisations.ts`, `/establishments` | auth + RBAC tests | Verified |
| P2.3b | Food items, procurement, inventory | §5.5, §8 | `catalog.ts`, `inventory.ts`, `/procurement`, `/inventory` | workflow tests (txn rollback, validation, duplicate invoice) | Verified |
| P2.3c | Preparation/consumption records | §4, §5.4 | `kitchen.ts`, `/service` | trigger-refusal + rollback test; browser | Verified |
| P2.3d | Waste recording, categories, history | §8.3 | `waste.ts`, `/waste` | lot deduction, trigger cost/CO2e, validation tests | Verified |
| P2.3e | Surplus listing, recipient org management, discovery, claiming | §5.7, §8.1 | `surplus.ts`, `claims.ts`, `/surplus`, `/feed`, `/claims` | lifecycle, duplicate, over-claim, concurrency tests | Verified |
| P2.3f | Claim approval, status transitions, redistribution record | §5.5 | `domain/claims.ts`, `claims.ts` | unit state machine + integration | Verified |
| P2.3g | Zone analytics and management | §5.8 | `zones.ts`, `analytics.ts`, `/zones`, dashboards | recursive-CTE roll-up test; dashboard equals SQL truth | Verified |
| P2.4a | MongoDB variable-schema submissions + inspections (read and write) | §6 | `documents.ts`, `/submissions`, `/inspections` | `etl-semantic.test.ts` (3 shapes, validator) | Verified |
| P2.4b | ETL Mongo -> PostgreSQL, idempotent, retry, failure handling | §6.4, B2.8 | `etl.ts`, `domain/etl-adapters.ts`, `/etl` | idempotency, crash-recovery, failure/retry, lease tests | Verified |
| P2.4c | pgvector semantic matching (names; surplus<->recipient) | §2.3, §5.7, B2.9 | `embedder.ts`, `name-resolution.ts`, `surplus.ts`, `/matching`, `/feed` | backfill 100%, cascade tests, 88% measured accuracy, hard-filter test | Verified |

## Part 3 - implemented and verified

| ID | Requirement | Plan § | Implemented in | Verified by | Status |
|---|---|---|---|---|---|
| P3.1 | 22-query catalogue + DML (26 queries), each with title, concept, purpose, SQL, explanation | §7; Req. 6 | `db/queries/Q01-Q26`, `docs/QUERY_CATALOGUE.md`, DBMS Lab | `tests/test_catalogue.py` (48), `part3.test.ts` runs every query through the API | Verified |
| P3.2a | Stored functions + stored procedure | §5.3 | migration 016 | `test_part3.py`, Lab demo D10 | Verified |
| P3.2b | Triggers T3-T6 (inventory ledger, audit, claim guard, listing guard) | §5.4 | migration 017 | trigger tests, 10-way write-off race, Lab demos D03-D06, D11 | Verified |
| P3.2c | **Stock deducted exactly once** after moving logic into the DB | WORKFLOW 3.2 | T3; app UPDATE removed; seed bulk-load switch | API once, SQL once, bulk zero, update delta, delete restore; invariant `0 <= remaining <= received` | Verified |
| P3.2d | Views + materialised view (refresh, staleness) | §5.2 | migration 015 | `test_part3.py` (incl. no double counting) | Verified |
| P3.2e | Transactions, savepoints, rollback | §5.5 | `withTransaction`, `db/demos/02_*` | atomicity tests (API + SQL), `test_demos.py` | Verified |
| P3.2f | Indexing + EXPLAIN / EXPLAIN ANALYZE evidence | §5.1 | migrations 008, 018; `docs/EXPLAIN_EVIDENCE.md` | generated from the live DB; Q20 30 s timeout -> under 1 s | Verified |
| P3.2g | Partitioning demo | §5.9 | migration 006 + `fn_ensure_waste_partitions` | pruning plan (1 partition vs 27), function idempotent | Verified |
| P3.2h | Full-text + trigram search | §5.6 | `fn_search_food` | typo / gibberish tests, API test | Verified |
| P3.2i | pgvector documented, semantic beats keyword shown | §5.7; Req. 8 | `docs/ADVANCED_DBMS.md` §8, Q22, `/matching`, `/feed` | Part 2 tests (88 % name resolution, hard-filter test), Q22 test | Verified |
| P3.2j | ALTER + DROP migration | Req. 5 | migration 014, `db/demos/01_*` | `test_part3.py`, `test_demos.py` | Verified (deviation D2) |
| P3.2k | Real concurrency (claims, approvals, write-offs, session close) | §5.5 | row locks in functions / T3 | 4 pytest + 3 API concurrency tests; `CONCURRENCY_EVIDENCE.md` | Verified |
| P3.3 | Premium UI: analytics, DBMS Lab, audit, dashboards, charts from real data, light/dark, responsive, empty/loading/error states | §8.3 | `src/app/(shell)/{analytics,lab,audit}`, charts, KPI cards | browser QA at 1440 / 820 / 390 px, no overflow; analytics = catalogue integration test | Verified |
| P3.4 | Complete test report with real results | §13; Req. 14 | `scripts/run_all_tests.py` -> `docs/TEST_REPORT.md` | generated, not typed | Verified |
| P3.5 | Documentation package | §15; Req. 14 | this folder | review | Verified |

### PDF query list -> catalogue

| PDF # | Query | Catalogue | PDF # | Query | Catalogue |
|---|---|---|---|---|---|
| 1 | Zone waste summary | Q01 | 12 | Median hours to pickup | Q12 |
| 2 | Top 10 wasted foods | Q02 | 13 | Diversion rate trend | Q13 |
| 3 | Above category average (correlated) | Q03 | 14 | Loss + CO2e last quarter | Q14 |
| 4 | Stage split, ROLLUP | Q04 | 15 | Anomalous days (z-score) | Q15 |
| 5 | Chronic over-preparers | Q05 | 16 | Rolling 7-day average | Q16 |
| 6 | Turnout correlation | Q06 | 17 | Peer rank / percentile | Q17 |
| 7 | Day-of-week profile | Q07 | 18 | Recursive zone roll-up | Q18 |
| 8 | Event vs non-event days | Q08 | 19 | Ingredient exposure | Q19 |
| 9 | Expiring lots by value | Q09 | 20 | Supplier spoilage | Q20 |
| 10 | Rescue funnel | Q10 | 21 | Forecast accuracy (MAE/MAPE) | **Q21 replaced** (D1) |
| 11 | Unmet recipient capacity | Q11 | 22 | Semantic top-5 recipients | Q22 |

Plus Q23 INSERT...SELECT, Q24 UPDATE, Q25 DELETE with subquery, Q26 UPSERT - the DML the course requires beyond SELECT.

## Course requirements Req. 1-18 (plan §14)

| Req. | Deliverable | Where it is satisfied | Status |
|---|---|---|---|
| 1 | Unique, non-CRUD problem | README, PROJECT_REPORT.md: locality-scale waste intelligence with analytics, matching and redistribution | Met |
| 2 | Two members, defined responsibilities | **Not verifiable from the repository** - names and roles must be added by the team (PROJECT_REPORT.md has a placeholder section) | Team action |
| 3 | Two database paradigms | PostgreSQL (relational + pgvector) and MongoDB; justification in README, DATA_MODEL.md, MONGODB_DESIGN.md | Met |
| 4 | ER diagram -> relational schema; Mongo model documented | `ER_DIAGRAM.md` (generated from the live catalog), `DATA_DICTIONARY.md`, `MONGODB_DESIGN.md` (shapes, validators, indexes, pipeline) | Met |
| 5 | DDL: CREATE/ALTER/DROP, keys, constraints, indexes, views | migrations 001-018 (CREATE), 014 (ALTER + DROP), 015 (views), 008 / 018 (indexes), `db/demos/01_*` | Met (D2) |
| 6 | DML with JOIN / GROUP BY / HAVING / subqueries | 26 catalogue queries, `QUERY_CATALOGUE.md` | Met |
| 7 | Four advanced concepts | more than nine implemented: `ADVANCED_DBMS.md` | Met |
| 8 | Vector / semantic search explained | `ADVANCED_DBMS.md` §8, Q22, name matching, ranked feed | Met |
| 9 | Next.js interface (forms, tables, search, filters, charts) | `src/app`, 20+ screens | Met |
| 10 | API layer, env vars, no hard-coded credentials | route handlers under `src/app/api`; `src/lib/env`; `.env.example` | Met |
| 11 | Authentication + 2+ roles | 5 roles, bcrypt, signed session | Met |
| 12 | Validation at DB level, integrity | CHECK / FK / UNIQUE + triggers T1-T6, `fn_*` rules | Met |
| 13 | Security practices | parameterised SQL, bcrypt, httpOnly cookie, origin check, lockout, RBAC + tenant scope, Lab read-only / rollback model | Met |
| 14 | Full documentation set | this `docs/` folder, `TEST_REPORT.md` | Met |
| 15 | Git/GitHub, individual commits, README | README done. **Git history not produced**: the repository root is the user home directory with one unrelated commit; nothing was initialised or committed (awaiting your decision) | Pending your decision |
| 16 | Demo covering all items | `DEMO_SCRIPT.md` (12 min) + safe demos in the Lab | Met |
| 17 | Originality | locality framing, heterogeneity by establishment type, planted discoverable signals | Met |
| 18 | Beyond CRUD, justified DB choice | stored logic, analytics, matching, concurrency; justification in README + MONGODB_DESIGN.md | Met |

The original course-requirements PDF is not in the repository (DECISIONS Q3); Req. numbers follow the plan's §14 table.

## Deviations from the plan (all deliberate)

| # | Plan said | Done | Reason |
|---|---|---|---|
| D1 | Query 21 = forecast accuracy (MAE/MAPE) | Q21 = **data provenance by kind** | the forecasting layer is Part 4 (optional, not started); provenance uses the ALTER column and is real. A forecast query on empty tables would be fake |
| D2 | ALTER adds `residential_profile.segregation_compliant`; DROP an unused column | ALTER adds `waste_event.measurement_source`; DROP `idx_wastenote_vec` | the suggested column feeds no feature; the provenance column drives Q21 and the Analytics page. The dropped object is a genuinely unused index (its column is NULL everywhere) |
| D3 | `tr_lot_deduct` trigger | `tr_lot_ledger` (BEFORE insert/update/delete) | a plain AFTER-INSERT trigger deadlocked under concurrency; BEFORE plus restore-on-change/delete is stronger |
| D4 | Materialised view counts all waste | `mv_zone_monthly` excludes `REDISTRIBUTED` | redistributed food is not waste; all views and queries agree |
| D5 | pgvector "similar past incidents" on waste notes | not built; its index dropped | no feature uses it; documented as a limitation |
| D6 | 400k waste rows | ~55k seeded rows | enough for plan-shape evidence on a laptop; stated in EXPLAIN_EVIDENCE.md |

## Excluded (Part 4 / optional — never started without approval)

Forecasting layer (§11, tables I-group) · Part C Tier T4 (food state, shelf life, traceability, interventions) · `user_session`, cluster tables.
