# Requirements audit (final)

Independent re-verification of the whole project against `ZoneFood_Master_Plan.pdf` §14 (Req. 1-18), §7 (query catalogue), §5 (advanced features), §13 (testing) and `ZoneFood_WORKFLOW.md`. Earlier completion claims were **not** trusted: each row below was re-checked against the source tree, the live database or a fresh test run on 2026-11-01. The original course-requirements PDF is not in the repository; Req. numbers follow the plan's §14 table.

Legend: **COMPLETE** = implemented and evidenced · **PARTIAL** = implemented but something outstanding · **NOT STARTED** · **N/A**.

## 1. Req. 1-18

| Req. | Requirement | Current implementation | Status | Evidence | Action required |
|---|---|---|---|---|---|
| 1 | Unique, non-CRUD problem statement | Locality-scale food-waste intelligence: cross-establishment analytics, stored business rules, concurrency-safe redistribution, semantic matching | COMPLETE | `README.md`, `docs/PROJECT_REPORT.md` §1 | none |
| 2 | Two members, defined responsibilities | Responsibility table prepared, **names and roles not supplied** | **PARTIAL** | `docs/TEAM_AND_CONTRIBUTIONS.md` (marked placeholders) | **You must supply member names, IDs and the actual split** |
| 3 | Two database paradigms | PostgreSQL 16 (relational + pgvector) and MongoDB 7 (documents, time-series, capped) | COMPLETE | `docker-compose.yml`, `docs/DATA_MODEL.md` §1, `docs/MONGODB_DESIGN.md`; pytest Mongo tests | none |
| 4 | ER diagram → relational schema; Mongo model documented | ER diagram and data dictionary generated from the live catalog; Mongo shapes, validators, indexes, aggregation documented | COMPLETE | `docs/ER_DIAGRAM.md`, `DATA_DICTIONARY.md`, `MONGODB_DESIGN.md`; `gen_docs.py --check` passes | none |
| 5 | DDL: CREATE / ALTER / DROP, keys, constraints, indexes, views | 18 checksummed migrations; ALTER + DROP in 014; views 015; indexes 008/018 | COMPLETE (deviation D2) | `db/migrations/`, `tests/test_part3.py`, `db/demos/01_*` | none |
| 6 | DML with JOIN / GROUP BY / HAVING / subqueries | 26 catalogue queries (22 analytic + 4 DML), all return non-empty results on the working database (re-run today: 2-32 rows each; DML 1-12 rows, rolled back) | COMPLETE (deviation D1) | `db/queries/`, `docs/QUERY_CATALOGUE.md`, `tests/test_catalogue.py` (48) | none |
| 7 | Four advanced concepts | 14 listed in `ADVANCED_DBMS.md`: indexing, views + MV, procedures/functions, 6 triggers, transactions, concurrency, FTS, vectors, windows/CTEs, partitioning, DDL, state machine, audit, provenance | COMPLETE | `docs/ADVANCED_DBMS.md`; `tests/test_part3.py` (31) | none |
| 8 | Vector / semantic search explained | Local MiniLM embeddings, HNSW cosine, hybrid ranking after SQL hard filters; measured name resolution 88 % with honest limits | COMPLETE | `ADVANCED_DBMS.md` §8, Q22, `/matching`, `/feed`, `etl-semantic.test.ts` | none |
| 9 | Next.js interface (forms, tables, search, filters, charts) | Next.js 16 / React 19 / Tailwind 4; 20+ screens, 41 API routes; premium visual layer added this round | COMPLETE | `src/app`, screenshots `p3-*`, `p5-*`; production build passes | none |
| 10 | API layer, env vars, no hard-coded credentials | Route handlers behind `api(permission, handler)`; zod-validated env; secret scan of all tracked files for each `.env` value found 0 occurrences | COMPLETE | `src/lib/env`, `.env.example`, git-tracked-file scan | none |
| 11 | Authentication + 2 or more roles | 5 roles; bcrypt cost 12; signed httpOnly session; lockout | COMPLETE | `tests-web/integration/auth.test.ts` (17), permission matrix unit tests | none |
| 12 | Validation at DB level, integrity | CHECK / FK / UNIQUE, triggers T1-T6, `fn_*` rules; refusal demonstrated in the Lab (D01-D12) | COMPLETE | `tests/test_part1.py`, `test_part3.py`, Lab demos | none |
| 13 | Security practices | Parameterised SQL only; Lab executes catalogue ids, never client SQL; RBAC + tenant scoping in SQL; origin check; no secrets in Git | COMPLETE | `docs/ADVANCED_DBMS.md`, VIVA_QA 34-37, integration tests | none |
| 14 | Full documentation set | 19 documents in `docs/`, generated evidence regenerated from live DBs | COMPLETE | `docs/` index in README | none |
| 15 | Git/GitHub, individual commits, README | Git repository **initialised inside the project folder only** (7 commits by component, authored with your configured identity). **No remote; nothing pushed.** Individual member commits do not exist and were not fabricated | **PARTIAL** | `git log`; `.gitignore`; `.gitattributes` | **Your decision: create the GitHub remote and push; each member commits under their own account from now on** |
| 16 | Demo covering all items | 12-minute script with exact steps, accounts, backup demos and recovery notes | COMPLETE | `docs/DEMO_SCRIPT.md` | rehearse once on the demo machine |
| 17 | Originality | Locality framing, kind-specific heterogeneity, planted discoverable signals, provenance | COMPLETE | `README.md`, `PROJECT_REPORT.md` | none |
| 18 | Beyond CRUD, justified DB choice | Stored logic, analytics, matching, concurrency control; justification per store | COMPLETE | `README.md`, `MONGODB_DESIGN.md`, `ARCHITECTURE.md` | none |

**Result: 16 of 18 COMPLETE; Req. 2 and Req. 15 PARTIAL, both waiting on information or a decision from you.** The project is therefore **not** declared 100 % complete.

## 2. The plan's 22 queries

All 22 are present as Q01-Q22 (Q21 substituted, see D1). Results re-checked on the working database today; none is empty. Mapping table: `docs/REQUIREMENTS_TRACEABILITY.md`.

## 3. Data volume: is ~55k enough?

| Fact | Value (live database, 2026-11-01) |
|---|---|
| `waste_event` | 55,537 rows over 152 days (2026-06-03 to 2026-11-01), 28 partitions (monthly plus default) |
| `inventory_lot` / `procurement` | 19,873 / 7,895 |
| `service_session` / `preparation_batch` / `consumption_record` | 9,510 / 21,986 / 21,975 |
| `surplus_listing` / `redistribution_claim` | 4,430 / 3,938 |
| Establishments / food items | 56 / 81 |
| Database size | 44 MB; MongoDB ~657 submissions |

**Assessment.** The plan's 400k figure came from a ~540-establishment, multi-year scenario. The DBMS requirements do not depend on the count: they need (a) every query to return meaningful, discoverable results (verified: all 26 do), (b) planted patterns to be detectable (verified by `test_planted_signals_exist`), (c) evidence that indexing, partitioning and the materialised view change plans (verified in `EXPLAIN_EVIDENCE.md`; the Q20 index took a query from a 30 s timeout to under a second at this size), and (d) comfortable laptop performance (the seed completes in about 10 s on this machine; the full test suite runs in under 4 minutes). Generating more rows would lengthen setup and tests without adding evidence, so **no extra data was generated**. The honest limitation: at this scale the planner sometimes (correctly) prefers a sequential scan to GIN/HNSW indexes, and the evidence documents say so rather than claiming a speed-up.

## 4. Other findings of this audit

| # | Finding | Resolution |
|---|---|---|
| A1 | Git was not initialised in the project (root was the home directory) | `git init` run **inside the project folder only**; home repository untouched (still one commit, `5a322cb`) |
| A2 | Line-ending warnings on Windows would change migration file bytes (checksums) between machines | `.gitattributes` forces LF |
| A3 | UI was functional but visually plain | Premium layer added (see CURRENT_STATUS, UI section) |
| A4 | Team section was a bare placeholder | Full responsibility table with clearly marked blanks in `TEAM_AND_CONTRIBUTIONS.md` |
| A5 | No finding of a missing mandatory feature | none |
