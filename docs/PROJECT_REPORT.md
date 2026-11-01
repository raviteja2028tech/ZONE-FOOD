# ZoneFood - project report

_Locality-scale food resource and waste intelligence system. All data is synthetic._

## 1. Problem

Food is wasted at every stage - purchasing, storage, preparation, service, plate - by very different kinds of places (restaurants, college messes, hostels, hospitals, offices, supermarkets, clubs, households). Each place sees only its own bin. The interesting questions are zone-level: *where is food wasted, at which stage, why, and could the surplus reach someone who needs it before it spoils?* ZoneFood makes those questions database queries and closes the loop: record → normalise → analyse → match → redistribute → evaluate.

It is deliberately not a CRUD application: the value is in cross-establishment analytics, stored business rules, concurrency-safe redistribution and semantic matching.

## 2. Team and responsibilities

_To be completed by the team (Req. 2): member names, university IDs and the split of work. The repository cannot supply this and nothing has been invented._

## 3. Why three database technologies

| Technology | Role | Justification (Req. 3, 18) |
|---|---|---|
| PostgreSQL 16 | system of record | quantities must balance; constraints, triggers, ACID, row locks, partitioning, window functions, recursive CTEs |
| MongoDB 7 | raw, variably shaped submissions; inspections; sensor series; activity stream | shape depends on establishment kind; documents must be kept raw and re-processable |
| pgvector (in PostgreSQL) | semantic matching, name resolution | similarity combined with relational filters in one statement |

## 4. Design

* **Relational schema:** 31 tables in 18 migrations; ER diagram and data dictionary are generated from the live catalog ([ER_DIAGRAM.md](ER_DIAGRAM.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md)); normalisation note in [DATA_MODEL.md](DATA_MODEL.md).
* **MongoDB:** five collections with `$jsonSchema` validators, indexes, a time-series and a capped collection, and a `$facet` aggregation ([MONGODB_DESIGN.md](MONGODB_DESIGN.md)).
* **Architecture and data flows:** [ARCHITECTURE.md](ARCHITECTURE.md).
* **Decisions and their reasons:** [DECISIONS.md](DECISIONS.md) (48 entries).

## 5. Implementation highlights

| Area | What was built | Evidence |
|---|---|---|
| Schema and DDL | CREATE (001-013), ALTER + DROP (014), views (015), indexes (008, 018) | `db/migrations`, `db/demos/01_*` |
| Stored logic | 7 functions and procedures (incl. `zone_root`), 6 triggers, a bulk-load switch | [ADVANCED_DBMS.md](ADVANCED_DBMS.md), [DB_OBJECTS.md](DB_OBJECTS.md) |
| Query catalogue | 26 queries (22 analytic + DML), each with concept, purpose, SQL and explanation | [QUERY_CATALOGUE.md](QUERY_CATALOGUE.md) |
| Performance | measured EXPLAIN ANALYZE evidence, partition pruning, a partial index found by a failing query | [EXPLAIN_EVIDENCE.md](EXPLAIN_EVIDENCE.md) |
| Concurrency | row locks; 10-way write-off race, 8-way approval race, duplicate-claim race, deadlock found and fixed | [CONCURRENCY_EVIDENCE.md](CONCURRENCY_EVIDENCE.md) |
| Application | Next.js 16 app, 5 roles, 20+ screens, 41 API routes, DBMS Lab, audit log, analytics | [UI_DESIGN_DIRECTION.md](UI_DESIGN_DIRECTION.md), screenshots |
| Semantic search | local MiniLM embeddings, hybrid ranking after hard filters | [ADVANCED_DBMS.md](ADVANCED_DBMS.md) §8 |

## 6. Testing

Automated suites (pytest, vitest unit, vitest integration against a disposable database, type-check, lint, production build) are run by `python scripts/run_all_tests.py`, which writes [TEST_REPORT.md](TEST_REPORT.md) from the machine-readable results. The working database is never touched by the suites. Browser QA was done with a headless browser at 1440 / 820 / 390 px.

## 7. Requirements coverage

[REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) maps Req. 1-18, the plan's 22 queries and each deviation (with reasons) to files and tests.

## 8. Limitations and honest notes

* Dataset is ~55k waste rows, not the plan's 400k; index gains on small tables are shown as plan changes, and where an index does not help the evidence says so.
* Query 21 (forecast accuracy) was replaced because forecasting is optional Part 4 and not built.
* The embedding model is small and English-only; abbreviations and synonyms are weak (88 % measured name resolution, one false positive).
* Git history: the repository root is the user's home directory; nothing was initialised or committed. Per-member commits (Req. 15) need a decision.
* The working database holds synthetic seed data plus leftovers from QA walkthroughs; `python scripts/setup_db.py --reset` restores a clean seed.

## 9. Submission package

| Deliverable | File |
|---|---|
| README, setup | [../README.md](../README.md) |
| ER diagram, data dictionary | [ER_DIAGRAM.md](ER_DIAGRAM.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md) |
| PostgreSQL and MongoDB design | [DATA_MODEL.md](DATA_MODEL.md), [MONGODB_DESIGN.md](MONGODB_DESIGN.md) |
| Architecture and data flow | [ARCHITECTURE.md](ARCHITECTURE.md) |
| SQL catalogue | [QUERY_CATALOGUE.md](QUERY_CATALOGUE.md) |
| Advanced DBMS, procedures, triggers | [ADVANCED_DBMS.md](ADVANCED_DBMS.md), [DB_OBJECTS.md](DB_OBJECTS.md) |
| Indexing and EXPLAIN | [EXPLAIN_EVIDENCE.md](EXPLAIN_EVIDENCE.md) |
| Concurrency | [CONCURRENCY_EVIDENCE.md](CONCURRENCY_EVIDENCE.md) |
| Test reports | [TEST_REPORT.md](TEST_REPORT.md) |
| Traceability | [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) |
| Screenshots | [screenshots/](screenshots/) |
| Demo script, viva Q&A | [DEMO_SCRIPT.md](DEMO_SCRIPT.md), [VIVA_QA.md](VIVA_QA.md) |
