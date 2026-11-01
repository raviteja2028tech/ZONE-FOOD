# ZoneFood — Locality-Scale Food Resource & Waste Intelligence System

A DBMS mini-project (PES University, DBMS Level 3). ZoneFood tracks food across a whole urban zone —
procurement → inventory → preparation → service → waste → surplus redistribution — for heterogeneous
establishments (restaurants, college messes, hostels, hospitals, offices, supermarkets, clubs and
residential blocks), so zone-level questions such as *where is food wasted, why, and could the surplus
reach someone who needs it* become database queries.

> **All data in this repository is synthetic.** Names, people, suppliers, NGOs, quantities and
> emission factors are invented for demonstration. Nothing here describes a real business, institution,
> locality, or food-safety record.

**Project status:** Parts 1-3 are built and verified (database, application, advanced DBMS features, analytics UI, tests,
submission documents), and the forecasting extension (Part 4, requested explicitly) is implemented with real models on the real history. See [CURRENT_STATUS.md](CURRENT_STATUS.md) for the authoritative, test-backed status.

## Why three database technologies

| Store | Holds | Why |
|---|---|---|
| **PostgreSQL 16** (system of record) | entities, the food lifecycle, quantities, claims | Quantities must balance (`prepared ≥ served + leftover`, `claimed ≤ offered`): declarative CHECKs, foreign keys, triggers and ACID transactions. Hosts the vector columns too. |
| **MongoDB 7** | raw field submissions, inspection reports, bin sensor readings, flexible metadata | Different establishment types log differently shaped data (per-dish plate waste vs household bin weights vs SKU markdowns). Relationally that is 40 nullable columns or an EAV anti-pattern. |
| **pgvector** (inside PostgreSQL) | `vector(384)` columns + HNSW indexes | Semantic matching of surplus to recipients and food-name normalisation. |

Details: [docs/DATA_MODEL.md](docs/DATA_MODEL.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DECISIONS.md](docs/DECISIONS.md)

## Quick start

Prerequisites: Docker Desktop (running), Python 3.11+.

```powershell
# 1. configuration (the real .env is git-ignored; edit the placeholder passwords)
Copy-Item .env.example .env

# 2. Python environment for the database scripts
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt          # Linux/macOS: .venv/bin/python

# 3. start PostgreSQL 16 (+pgvector) and MongoDB 7 and wait until healthy
docker compose up -d --wait

# 4. create schema, seed synthetic data, verify  (add --reset to wipe and rebuild)
.\.venv\Scripts\python scripts\setup_db.py
```

Everything below uses the venv interpreter; on Linux/macOS replace `.\.venv\Scripts\python` with `.venv/bin/python`.

### Day-to-day commands

| Task | Command |
|---|---|
| Start databases | `docker compose up -d --wait` |
| Stop (data kept) | `docker compose down` |
| Status / health | `docker compose ps` |
| Logs | `docker compose logs -f postgres` (or `mongo`) |
| PostgreSQL shell | `docker exec -it zonefood-postgres psql -U zonefood -d zonefood` |
| MongoDB shell | `docker exec -it zonefood-mongo mongosh -u zonefood -p <MONGO password> --authenticationDatabase admin zonefood` |
| Apply pending migrations | `python scripts/migrate.py up` · list: `python scripts/migrate.py status` |
| **Full reset + reseed** | `python scripts/setup_db.py --reset` |
| Seed only (re-runnable) | `python scripts/seed.py` (`--end-date 2026-10-30 --rng-seed 42` for a reproducible dataset) |
| Verify integrity | `python scripts/verify_db.py` |
| Regenerate ER diagram + data dictionary | `python scripts/gen_docs.py` (`--check` to prove they match the live schema) |
| Run the test-suite | `python -m pytest -v` |
| **Destroy all data incl. volumes** | `docker compose down -v` |

Host ports default to **5433** (PostgreSQL) and **27018** (MongoDB) so they do not collide with a local
install; change them in `.env`. Hosts are `127.0.0.1` rather than `localhost` — on some Windows setups
`localhost` resolves to IPv6 first and every connection stalls ~8 s before falling back.

## Web application (Part 2)

Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind CSS 4 + Recharts, with `motion` for page/card/navigation animation and `gsap` for the sign-in sequence only (all animation respects reduced-motion). Node >= 20.9 (tested on Node 24).
PostgreSQL via raw parameterised SQL (`pg`); MongoDB via the official driver; no ORM. Local embeddings (MiniLM-L6-v2 through ONNX Runtime) - no API key.

```powershell
docker compose up -d --wait         # PostgreSQL 16 + pgvector, MongoDB 7
python scripts/setup_db.py          # migrations 001-019 + seed (add --reset for a clean rebuild)
npm install
python scripts/forecast.py          # train + store the forecasting models (Forecast page)
npm run demo:prepare                # embeddings + live synthetic listings (first run downloads a ~23 MB model into .cache/)
npm run dev                         # http://localhost:3000
npm run build ; npm start           # production
```

| Task | Command |
|---|---|
| Type-check / lint | `npm run typecheck` / `npm run lint` |
| Unit tests (no DB) | `npm test` |
| Integration tests (builds and drops its own `zonefood_webtest` DB + Mongo DB) | `npm run test:integration` |
| Fill NULL embeddings / publish live demo listings | `npm run demo:prepare` (or the Data sync page, admin) |

**Screens by role** - *Zone admin / auditor:* dashboard with KPIs, waste-trend and zone-comparison charts, establishments, recipients, zones roll-up, waste, surplus, claims, field logs, inspections, food catalogue, name matching, data sync, system status (auditor is read-only). *Establishment manager / staff:* own dashboard with expiry alerts, procurement, inventory, service sessions, waste, surplus listings with ranked recipients, claims (managers approve), field logs, inspections. *Recipient:* dashboard, ranked feed of feasible surplus, claims, organisation profile.
Every number on a screen is computed live from the databases. Missing `.env` values give a clear setup error naming the variable.

**Security summary:** bcrypt (cost 12) hashes only; signed httpOnly SameSite=Lax session cookie carrying only the user id; role and active status re-read from the database on every request; permission check on every API route and page (`src/lib/auth/permissions.ts`); tenant scoping in SQL; zod validation -> CHECK constraints -> triggers; login lockout; same-origin check on mutations; secrets only in `.env`.

## Demo accounts (synthetic, local only)

`scripts/seed.py` creates 80 users. All share the password you set as `DEMO_USER_PASSWORD` in `.env`
(stored only as bcrypt hashes in the database).

| Role | Example email |
|---|---|
| Zone administrator | `admin@zonefood.example` |
| Auditor (read-only role) | `auditor@zonefood.example` |
| Establishment manager / staff | `manager.<name>@zonefood.example`, `staff.<name>@zonefood.example` — e.g. `manager.greenfield.academy.canteen@zonefood.example` |
| Recipient agent | `agent.<org>@zonefood.example` — e.g. `agent.annapoorna.community.kitchen@zonefood.example` |

Find any email with `SELECT email, role FROM app_user ORDER BY user_id;`. Sign in on the login page; the shared password is `DEMO_USER_PASSWORD` from your `.env`.

## What the seeded dataset contains

~150 days of history ending yesterday: 1 sector → 6 blocks → 24 streets; 32 food-service establishments
+ 24 residential units; 81 food items and 264 dishes; ~9.5k service sessions, ~22k preparation batches,
~7.9k procurements → ~19.9k inventory lots; ~54.6k waste events; ~4.4k surplus listings with ~3.9k claims;
and in MongoDB ~650 differently shaped waste submissions, inspection reports, a bin-sensor time series,
establishment metadata and an activity stream. It includes planted, discoverable patterns (a chronic
over-preparing school, a supplier whose produce spoils ~3× more, monsoon spoilage, weekly and event
seasonality, anomalous days) — see the header of `scripts/seed.py`.

## Advanced DBMS features (Part 3)

All of this runs on the real database and is demonstrable from the **DBMS Lab** page (zone admin / auditor). Details, with what / why / where / how-to-demo for each, are in [docs/ADVANCED_DBMS.md](docs/ADVANCED_DBMS.md).

| Feature | Where |
|---|---|
| 26-query SQL catalogue (joins, GROUP BY/HAVING, nested + correlated subqueries, window functions, recursive CTEs, DML) | `db/queries/`, [docs/QUERY_CATALOGUE.md](docs/QUERY_CATALOGUE.md) |
| Stored functions + procedure (`fn_claim_surplus`, `fn_transition_claim`, `sp_close_service_session`, …) | migration 016 |
| Triggers T1-T6 (consumption balance, cost/CO2e + provenance, **inventory ledger: stock deducted exactly once**, audit, claim state machine, listing guard) | migrations 009, 014, 017 |
| Views + materialised view | migration 015 |
| Indexes, partitioning, EXPLAIN ANALYZE evidence | migrations 006, 008, 018, [docs/EXPLAIN_EVIDENCE.md](docs/EXPLAIN_EVIDENCE.md) |
| Transactions, savepoints, rollback, real concurrency tests | [docs/CONCURRENCY_EVIDENCE.md](docs/CONCURRENCY_EVIDENCE.md), `db/demos/` |
| Full-text + trigram search, pgvector semantic matching | `fn_search_food`, `/matching`, `/feed` |
| ALTER / DROP DDL | migration 014, `db/demos/01_ddl_lifecycle.sql` |
| Audit trail attributed to the real user | trigger T4, `/audit` |

New screens: **Analytics** (`/analytics`: anomaly-marked trend, weekday profile, diversion rate, peer ranking, rescue funnel, supplier spoilage, data provenance - each chart has a table view), **DBMS Lab** (`/lab`: run any catalogue query, EXPLAIN ANALYZE it, run 12 live constraint demonstrations that are rolled back, browse every database object, refresh the materialised view), **Audit log** (`/audit`), and a command palette (Ctrl+K).

## Waste forecasting

`python scripts/forecast.py` trains three models on the recorded history (seasonal naive baseline, Ridge regression, LightGBM) with a chronological train / validation / test split and leak-free features, scores them (MAE, RMSE, WAPE at kitchen and zone level), stores the run in PostgreSQL (migration 019) and the **Forecast** page shows actual-vs-predicted, the model comparison, feature importance and tomorrow's expected waste per establishment. Method, results and limitations (synthetic data, 28-day test window): [docs/FORECASTING.md](docs/FORECASTING.md).

## Testing

```powershell
python scripts/run_all_tests.py      # everything (about 5 minutes) -> writes docs/TEST_REPORT.md from the real results
python scripts/run_all_tests.py --skip-build
python -m pytest -q                  # database layer: migrations, constraints, triggers, catalogue, concurrency
npm test                             # unit tests
npm run test:integration             # API, RBAC, workflows, ETL, concurrency (disposable zonefood_webtest database)
```

Results: [docs/TEST_REPORT.md](docs/TEST_REPORT.md). The working database is never touched by the suites.

## Documentation index

| Document | Content |
|---|---|
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | everything that is implemented, with evidence |
| [FRIEND_SETUP_GUIDE.md](FRIEND_SETUP_GUIDE.md) | exact clone-to-run instructions |
| [docs/FORECASTING.md](docs/FORECASTING.md) | forecasting method, leakage prevention, results, limitations |
| [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md) | overview of the whole submission |
| [docs/ER_DIAGRAM.md](docs/ER_DIAGRAM.md) · [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | generated from the live catalog |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) · [docs/MONGODB_DESIGN.md](docs/MONGODB_DESIGN.md) | PostgreSQL and MongoDB design, normalisation |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | components and data flows |
| [docs/QUERY_CATALOGUE.md](docs/QUERY_CATALOGUE.md) | 26 queries with SQL, concept, purpose, real results |
| [docs/ADVANCED_DBMS.md](docs/ADVANCED_DBMS.md) · [docs/DB_OBJECTS.md](docs/DB_OBJECTS.md) | procedures, triggers, views, indexes, partitioning, search, vectors, DDL |
| [docs/EXPLAIN_EVIDENCE.md](docs/EXPLAIN_EVIDENCE.md) · [docs/CONCURRENCY_EVIDENCE.md](docs/CONCURRENCY_EVIDENCE.md) | measured plans; race-condition evidence |
| [docs/TEST_REPORT.md](docs/TEST_REPORT.md) | unit and system/integration test results |
| [docs/REQUIREMENTS_AUDIT.md](docs/REQUIREMENTS_AUDIT.md) | independent Req. 1-18 audit, data-volume assessment, open items |
| [docs/REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md) | Req. 1-18, query map, deviations |
| [docs/TEAM_AND_CONTRIBUTIONS.md](docs/TEAM_AND_CONTRIBUTIONS.md) | team members and responsibilities (to be completed by the team) |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) · [docs/VIVA_QA.md](docs/VIVA_QA.md) | 12-minute demo; viva questions with answers |
| [docs/DECISIONS.md](docs/DECISIONS.md) · [docs/UI_DESIGN_DIRECTION.md](docs/UI_DESIGN_DIRECTION.md) | design decisions; UI direction |
| [docs/screenshots/](docs/screenshots/) | screenshots of the running application |

Regenerate the generated documents from the live databases: `python scripts/gen_docs.py` (ER, dictionary) and `python scripts/gen_part3_docs.py` (catalogue, EXPLAIN, concurrency, objects, MongoDB).

## Version control

Git is initialised **inside this project folder** (not in any parent directory). Nothing has been pushed. To publish when you decide to: `git remote add origin <url>` then `git push -u origin main`. `.env`, `node_modules`, `.venv`, database volumes and the model cache are git-ignored; `.gitattributes` keeps SQL files LF so migration checksums match on every machine.

## Repository layout

```
docker-compose.yml        PostgreSQL 16 + pgvector, MongoDB 7 (volumes, health checks)
.env.example              configuration template (copy to .env; .env is git-ignored)
db/migrations/            numbered, checksummed SQL migrations 001-019  (the schema's source of truth)
db/queries/               Q01-Q26 catalogue queries (one file each: title, concepts, purpose, SQL)
db/demos/                 safe DDL / transaction / race demonstrations (always rolled back)
src/                      Next.js app: app/ (pages + 41 API routes), components/, lib/{auth,db,domain,embeddings,env,http,log,validation}, proxy.ts
tests-web/                vitest unit + integration tests for the web app
scripts-web/              prepare-demo.ts (embeddings + live demo listings)
scripts/                  migrate.py, mongo_init.py, seed.py (+seed_catalog.py), verify_db.py, setup_db.py, catalogue.py,
                          gen_docs.py, gen_part3_docs.py, run_all_tests.py
tests/                    pytest suite (throw-away databases; never touches your working data)
docs/                     the submission documents listed above
CURRENT_STATUS.md         single source of truth for progress
ZoneFood_Master_Plan.pdf  project specification        ZoneFood_WORKFLOW.md  build workflow
```

## Scope

| Part | Content | State |
|---|---|---|
| 1 | Database foundation: environment, schema, migrations, seed data | Done & verified (approved) |
| 2 | Next.js application, auth/roles, lifecycle workflows, MongoDB integration + ETL, embeddings | Done & verified (approved) |
| 3 | Query catalogue, advanced DBMS features, dashboard UI, testing, submission package | Done & verified (approved) |
| 5 | Final audit, premium UI layer, Git set-up, fresh-clone verification | **Done; open items (team details, GitHub remote) listed in CURRENT_STATUS.md** |
| 4 | Forecasting (requested explicitly) | Done: Seasonal naive vs Ridge vs LightGBM, stored runs, `/forecast` dashboard. Further research extensions: not started |
