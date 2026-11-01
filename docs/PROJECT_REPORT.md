# ZoneFood: A Locality-Scale Food Resource and Waste Intelligence System

**Database Management Systems - Mini-Project Report**

| | |
|---|---|
| Project title | ZoneFood - Locality-Scale Food Resource and Waste Intelligence System |
| Team members | see [TEAM_AND_CONTRIBUTIONS.md](TEAM_AND_CONTRIBUTIONS.md) *(names and IDs to be supplied by the team)* |
| Course / institution | DBMS Level 3, PES University *(as stated in the project plan)* |
| Technologies | PostgreSQL 16 + pgvector 0.8, MongoDB 7, Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Data | entirely synthetic; no real establishment, person or organisation is described |

---

## Abstract

Food is lost at every step between purchase and plate, and each kitchen sees only its own bin. ZoneFood treats waste as a *locality-level system problem*. It records procurement, inventory, preparation, service and waste for heterogeneous establishments (restaurants, college messes, hospitals, supermarkets, households), rolls the figures up a street → block → sector hierarchy, and matches edible surplus with recipient organisations that can use it. The system combines three data technologies, each chosen for what it does best: PostgreSQL for the transactional record and the business rules enforced by constraints, triggers, functions and a stored procedure; MongoDB for field submissions whose shape differs by establishment type; and pgvector for semantic matching. The submission includes a 26-query SQL catalogue, measured EXPLAIN evidence, real concurrency tests, a role-based web application with analytics and a DBMS demonstration laboratory, a forecasting layer (seasonal naive, Ridge and LightGBM trained on the recorded history and compared chronologically), and a suite of automated tests that pass on a disposable database.

## 1. Introduction and problem statement

A zone-level view needs answers that no single kitchen can provide: *where* is food wasted, at which *stage*, with which *cause*, and could the surplus reach someone who needs it before it spoils? These are queries across many establishments over time; they also require writes that must never leave the data inconsistent (stock that goes negative, a listing promised twice). The project is therefore not a CRUD application: its value lies in cross-establishment analytics, rules enforced inside the database, concurrency control and semantic matching.

**Objectives**

1. Model the food lifecycle relationally with integrity enforced declaratively wherever possible.
2. Hold variably shaped field data in a document store and synchronise it safely and idempotently.
3. Demonstrate advanced DBMS concepts on a real schema, with evidence rather than assertion.
4. Provide a secure role-based application on top, with analytics that read from the same SQL as the documentation.

## 2. Choice of database technologies

| Technology | Role | Why it is the right tool |
|---|---|---|
| PostgreSQL 16 | system of record | quantities must balance; CHECK / FK / UNIQUE, triggers, ACID transactions, row locks, partitioning, window functions and recursive CTEs |
| MongoDB 7 | raw submissions, inspections, bin-sensor time series, activity stream | each establishment kind logs different fields; relationally this is ~40 mostly-NULL columns or an EAV table; raw documents must stay untouched for audit and reprocessing |
| pgvector (inside PostgreSQL) | semantic matching and name resolution | vectors live beside the facts they describe, so similarity can be combined with relational filters in one statement |

Detailed reasoning: [DATA_MODEL.md](DATA_MODEL.md) §1, [MONGODB_DESIGN.md](MONGODB_DESIGN.md), [DECISIONS.md](DECISIONS.md).

## 3. System design

* **Relational design:** 31 tables, created by 18 checksummed migrations; self-referencing zone hierarchy, disjoint establishment subtypes, many-to-many tables, and a monthly range-partitioned fact table. The ER diagram and data dictionary are *generated* from the live catalogue ([ER_DIAGRAM.md](ER_DIAGRAM.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md)); the normalisation argument (1NF-3NF and one deliberate denormalisation) is in [DATA_MODEL.md](DATA_MODEL.md) §2.
* **Document design:** five collections with `$jsonSchema` validators, compound/multikey/text indexes, a time-series and a capped collection ([MONGODB_DESIGN.md](MONGODB_DESIGN.md)).
* **Architecture and data flows** (lifecycle, ETL, session close, stock write-off): [ARCHITECTURE.md](ARCHITECTURE.md).
* **Three-layer validation:** schema validation in the API (zod) → declarative constraints → triggers for cross-table rules.

## 4. Implementation of advanced DBMS concepts

| Concept | Implementation | Evidence |
|---|---|---|
| Triggers (6) | consumption balance, cost/CO₂e and provenance derivation, inventory ledger (stock deducted exactly once), audit trail, claim state machine, listing guard | [ADVANCED_DBMS.md](ADVANCED_DBMS.md) §4; Lab demos D01-D12 |
| Stored routines | `fn_claim_surplus`, `fn_transition_claim`, `sp_close_service_session`, `fn_search_food`, `fn_waste_intensity`, `fn_ensure_waste_partitions`, `zone_root` | [DB_OBJECTS.md](DB_OBJECTS.md) |
| Transactions and concurrency | row locks at the decision point; 10-way write-off race (exactly 3 succeed), 8-way approval race, duplicate-claim race, a deadlock found by testing and fixed | [CONCURRENCY_EVIDENCE.md](CONCURRENCY_EVIDENCE.md) |
| Indexing and optimisation | composite, covering, partial, GIN, HNSW, BRIN; plan comparisons with and without each index | [EXPLAIN_EVIDENCE.md](EXPLAIN_EVIDENCE.md) |
| Views and materialised view | three views, one concurrently refreshable materialised view | migration 015 |
| Partitioning | `waste_event` by month; pruning shown by EXPLAIN | [EXPLAIN_EVIDENCE.md](EXPLAIN_EVIDENCE.md) §2 |
| Full-text and vector search | tsvector + trigram; MiniLM embeddings, HNSW, hybrid ranking after hard filters | [ADVANCED_DBMS.md](ADVANCED_DBMS.md) §7-8 |
| DDL lifecycle | CREATE; ALTER (added column + CHECK); DROP (unused index); safe scratch-table demonstration | migration 014, `db/demos/01_*` |
| Query catalogue | 27 queries: joins, GROUP BY/HAVING, correlated and nested subqueries, windows, recursive CTEs, DML | [QUERY_CATALOGUE.md](QUERY_CATALOGUE.md) |

## 5. Application

A Next.js 16 application with five roles (zone administrator, auditor, establishment manager, establishment staff, recipient agent). Authentication uses bcrypt (cost 12) and a signed httpOnly session cookie that carries only the user id; role and active status are re-read from the database on each request. Every API route passes through origin check → session → permission → validation, and tenant scope is enforced in SQL. Screens cover registration, procurement, inventory, service sessions, waste recording, surplus listings with ranked recipients, claims, field logs and inspections (MongoDB), name matching, zone analytics, an audit log and the **DBMS Lab**, which runs the catalogue and twelve constraint demonstrations *by identifier only* (read-only or rolled back). Visual design: Linear/Stripe-inspired light and dark themes, animated figures, interactive charts with a table alternative, reduced-motion support ([UI_DESIGN_DIRECTION.md](UI_DESIGN_DIRECTION.md)).

## 6. Testing

| Suite | Scope | Result (2026-11-01) |
|---|---|---|
| pytest | migrations, constraints, triggers, procedures, views, catalogue, concurrency, demos, forecasting pipeline | 128 / 128 |
| vitest unit | permission matrix, state machine, scoring, name policy, ETL adapters, validation | 46 / 46 |
| vitest integration (disposable DB) | authentication, RBAC, workflows, ETL, concurrency, Lab API, dashboard correctness, forecast API | 83 / 83 |
| type-check, lint, production build | static quality and deployability | clean / clean / pass |

Full per-test list: [TEST_REPORT.md](TEST_REPORT.md), generated by `python scripts/run_all_tests.py`. Browser walkthroughs were run at 1440, 820 and 390 px in light and dark themes. A fresh-clone installation (git-tracked files only, new databases) was also verified; its record is in [CURRENT_STATUS.md](../CURRENT_STATUS.md).

## 7. Results and observations

* Stock integrity: after moving the deduction logic into the database, a single write-off deducts once through every path, and ten simultaneous write-offs of 3 kg against a 10 kg lot yield exactly three successes.
* A query that exceeded its 30 s timeout (supplier spoilage) ran in under a second after a partial index suggested by its EXPLAIN plan.
* Semantic matching: name resolution reached 88 % on 32 deliberately messy names, with abbreviations and one false positive as documented failures; fuzzy matches below 0.60 confidence are never cached.
* Analytical queries surface the planted patterns of the synthetic data (a chronically over-preparing school, a supplier with disproportionate spoilage, monsoon-related spoilage, weekday seasonality, anomalous days).

## 7b. Forecasting

Next-day waste per establishment is forecast with a seasonal-naive baseline, Ridge regression and LightGBM, using shifted history features and known calendar/event features, a chronological train/validation/test split and hyper-parameters chosen on validation only ([FORECASTING.md](FORECASTING.md)). On the 28-day held-out window both learned models beat the baseline: zone-level MAE 241 kg/day (Ridge) and 253 (LightGBM) versus 336, and RMSE 292 / 332 versus 418; LightGBM is best per kitchen (RMSE 33.1 vs 34.5 vs 39.9 kg). The data are synthetic and the test window short, so these figures demonstrate a sound method, not real-world accuracy. Results are stored in four tables and shown on the Forecast page.

## 8. Limitations

* About 55 k waste events (152 days, 56 establishments) rather than the plan's 400 k; the requirements need meaningful results and plan evidence, not row counts, and on small tables the planner correctly prefers sequential scans over GIN/HNSW indexes - see [REQUIREMENTS_AUDIT.md](REQUIREMENTS_AUDIT.md) §3.
* The ALTER/DROP targets differ from the plan's example ([REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md)).
* The embedding model is small and English-only; abbreviations and synonyms are weak.
* Team details and individual commit history are pending ([TEAM_AND_CONTRIBUTIONS.md](TEAM_AND_CONTRIBUTIONS.md)).

## 9. Conclusion

ZoneFood demonstrates that zone-level food-waste intelligence is a database problem: integrity belongs in constraints and triggers, flexible field data in a document store, similarity in a vector index next to the facts, and concurrency in explicit row locks. Each claim in this report is backed by a runnable query, a migration, a test or a generated evidence document.

## Technology references

* PostgreSQL 16 documentation - https://www.postgresql.org/docs/16/
* pgvector - https://github.com/pgvector/pgvector
* MongoDB Manual - https://www.mongodb.com/docs/manual/
* Next.js documentation - https://nextjs.org/docs
* sentence-transformers/all-MiniLM-L6-v2 - https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2

## Appendix: submission package

| Deliverable | File |
|---|---|
| Setup and run instructions | [../README.md](../README.md) |
| Requirement audit and traceability | [REQUIREMENTS_AUDIT.md](REQUIREMENTS_AUDIT.md), [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) |
| ER diagram, data dictionary, models | [ER_DIAGRAM.md](ER_DIAGRAM.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md), [DATA_MODEL.md](DATA_MODEL.md), [MONGODB_DESIGN.md](MONGODB_DESIGN.md) |
| Architecture, decisions | [ARCHITECTURE.md](ARCHITECTURE.md), [DECISIONS.md](DECISIONS.md) |
| SQL catalogue, advanced DBMS, objects | [QUERY_CATALOGUE.md](QUERY_CATALOGUE.md), [ADVANCED_DBMS.md](ADVANCED_DBMS.md), [DB_OBJECTS.md](DB_OBJECTS.md) |
| EXPLAIN and concurrency evidence | [EXPLAIN_EVIDENCE.md](EXPLAIN_EVIDENCE.md), [CONCURRENCY_EVIDENCE.md](CONCURRENCY_EVIDENCE.md) |
| Test report | [TEST_REPORT.md](TEST_REPORT.md) |
| Demo script, viva Q&A | [DEMO_SCRIPT.md](DEMO_SCRIPT.md), [VIVA_QA.md](VIVA_QA.md) |
| Team, screenshots | [TEAM_AND_CONTRIBUTIONS.md](TEAM_AND_CONTRIBUTIONS.md), [screenshots/](screenshots/) |
