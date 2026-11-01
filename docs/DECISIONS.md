# Decisions, assumptions and open questions

## Decisions made (conservative, documented)

| # | Decision | Why |
|---|---|---|
| D1 | Progress file is `CURRENT_STATUS.md` (the prompt's name), not `PROJECT_STATUS.md` (WORKFLOW.md's name). | The user's explicit instruction wins; only one status file to avoid divergence. |
| D2 | The PDF on disk is `ZoneFood_Master_Plan.pdf` (WORKFLOW.md says `(1).pdf`). It was read in full via text extraction (77 pages). Part C (T4 research) was read only for scope; it is Part 4. | Inspect the real file. |
| D3 | Raw SQL migrations + a small Python runner (`migrate.py`, SHA-256 checksums). No ORM, no migration framework. | PDF §3.1/§16: faculty must read the DDL; ORMs fight triggers/partitions/vectors. Python because the plan's seed/backfill scripts are Python; the Part 2 app will use `pg`. |
| D4 | Host ports 5433 / 27018 bound to 127.0.0.1; hosts written as `127.0.0.1`, not `localhost`. | Avoid clashing with local installs. **Observed:** on this machine `localhost` costs ~8 s per connection (IPv6 first); `127.0.0.1` ~20 ms. |
| D5 | Forecast tables (`forecast_model`, `demand_forecast`), `etl_run_log`, `user_session`, `embedding_model`, cluster tables and all T4 tables are **not** created in Part 1. | WORKFLOW: forecasting is Part 4; the others are Part 2/3 concerns and are additive migrations. |
| D6 | Part 1 includes only triggers T1 (consumption balance) and T2 (cost/CO₂e derivation). T3 (lot deduction), T4 (audit), procedures, views, materialised view, FTS/vector demonstrations and EXPLAIN evidence are Part 3.2. | Phase 1.3 requires integrity; Phase 3.2 owns "advanced features". The seed already keeps lot balances consistent so T3 can be added later. |
| D7 | `recipient_org` is created in migration 003, before `app_user`, so the FK is declared inline (PDF used a later `ALTER`). | Simpler, same result. |
| D8 | Zone levels: sector 1, block 2, street 3 (level 4 reserved). Establishments sit in streets. | PDF's "1=sector 4=street" conflicts with its own 3-level sector→block→street. |
| D9 | RECREATIONAL and RETAIL_FOOD kinds use `commercial_profile`; EDUCATIONAL/ORGANIZATIONAL/HEALTHCARE use `institutional_profile`. | PDF defines three profile tables for seven kinds without a mapping. |
| D10 | `surplus_listing.claimed_qty_kg` = sum of claims in APPROVED or COLLECTED; REQUESTED/REJECTED/NO_SHOW hold no stock. Verified by `verify_db.py`. | PDF's `fn_claim_surplus` inserts APPROVED and increments; the release rule was unspecified. |
| D11 | Seeded `match_score` is NULL and all embedding columns are NULL until the Part 2 backfill. | A score without embeddings would be fabricated. |
| D12 | Seed window is relative to the **database's** `CURRENT_DATE` (default: 150 days ending yesterday); `--end-date` makes it fully reproducible (tested). A few "live" marketplace listings and next-day open sessions are anchored to now on purpose. | Keeps "last 30/90 days" queries non-empty and gives Part 2 an open-session/open-listing demo. |
| D13 | Lookup data (categories, reasons, routes, emission factors) is migration 010; demo data is the seed. Emission factors are labelled illustrative. | Schema needs lookups to function; demo data must be re-creatable. |
| D14 | Demo accounts share the password in `DEMO_USER_PASSWORD` (`.env`, git-ignored; placeholder in `.env.example`); bcrypt cost 12, one hash reused. | No credentials in source. |
| D15 | Mongo: `bin_readings` `metaField` is an object `meta{bin_id, establishment_id, stream}` (PDF: bare `bin_id`); `activity_stream` is capped **without** TTL. | A richer meta field is more useful; MongoDB does not support TTL indexes on capped collections (PDF asks for both). |
| D16 | Dataset scale: 24 residential units (plan: 480), ~54k waste events (plan: 450k), 656 Mongo docs (plan: 60k). | WORKFLOW: manageable on a student laptop; still enough for joins/windows/partition pruning. |
| D17 | ALTER/DROP demonstration migration (Req. 5) is deferred to Phase 3.2 as migration 012+. | WORKFLOW assigns it there. **Must not be forgotten.** |
| D18 | `CHECK (… <= CURRENT_DATE)` constraints (`ck_waste_not_future`, `ck_estab_since`) kept as in the PDF. | They are only evaluated on write, so they work; caveat: a dump/restore re-validates them against a later date. |

## PDF ambiguities resolved (clipped text)

The PDF's code listings are clipped at the page edge in three places. Completions used: `waste_stage` last value
**`POST_CONSUMER_SERVICE`**; `recipient_org.org_type` last value **`COMPOST_UNIT`**; `locality_event.event_type` last value **`LOCAL_EVENT`**.
Also: the PDF's ER sketch says `emission_factor ──1:N── food_category` while its DDL makes it 1:1 (PK = FK); the DDL was followed.
Table counts differ between PDF sections (31 / 38 / 48); the §4.3 DDL plus Part B tiers T1–T2 were used as the scope baseline.

## Issues in the PDF's code to fix when it is used (Part 3), not copied blindly

* `trg_audit`: `COALESCE(NEW.*::text, OLD.*::text)` is not a primary-key extraction and references `NEW` on DELETE.
* §5.7 vector query restricts recipients with `zone_id IN (SELECT … WHERE zone_id = $2)`, i.e. same zone only, not the hierarchy.
* §5.5 claim handler inserts a REDISTRIBUTED waste row even for APPROVED (uncollected) claims; align with D10 when implemented.
* HNSW index on the partitioned `waste_event` (notes embedding) builds per partition; acceptable here, revisit at scale.

## Phase 2.1 decisions (web application)

19. **Next.js 16.4.3** (not 15) - user approved moving to current stable. React 19.3.1, Tailwind 4.3.3, zod 4.6.7, `pg` 8.23.1, `mongodb` 7.8.0.
20. **TypeScript 6.0.x, not 7.0.** `tsc` 7.0.2 type-checks the project, but `typescript-eslint` (bundled with `eslint-config-next`) refuses TS 7, so
    lint would not run. Pinned `~6.0.0`; revisit when typescript-eslint supports TS 7.x.
21. **No ORM; `pg` pool + parameterised SQL** in `src/lib/db/postgres.ts` (`query`, `queryOne`, `withTransaction`). Repositories under
    `src/lib/db/repositories/` hold the SQL for each feature so faculty can read it. Pool/client are cached on `globalThis` (survives dev hot reload).
22. **Same `.env` as Part 1.** The app reads `POSTGRES_*` / `MONGO_*` directly instead of duplicating `DATABASE_URL`/`MONGODB_URI`; a single set of
    credentials cannot drift. The Mongo URI is built in code with percent-encoded credentials.
23. **API envelope** `{ok:true,data}` / `{ok:false,error:{code,message,details?,requestId}}`; every route is wrapped in `route()` (request id, safe
    mapping of AppError/ConfigError/Mongo errors, internals only in server logs). Logger is a small JSON-lines module with secret/URI redaction rather than a dependency.
24. **Design system:** CSS-variable tokens (OKLCH) mapped to Tailwind utilities, light/dark themes, Geist font (npm `geist`, self-hosted - no network at build),
    lucide icons, no component kit yet. Radix primitives will be added only when a dialog/menu is actually needed (not speculatively).
25. **Health endpoints are unauthenticated in 2.1** and return versions/collection counts but never credentials or hostnames. Phase 2.2 must decide whether
    `/api/health` stays public (liveness only) and moves details behind an admin role.
26. `npm audit` reports a moderate `minimatch` advisory reachable only through ESLint dev tooling (not shipped to runtime); the suggested "fix" is a breaking
    downgrade, so it is left and recorded.

## Open questions (status)

_Q1 (Next.js 16) approved. Q2 (git) still open - nothing committed._


1. **Next.js version.** The plan specifies Next.js 15. Current stable on npm is **16.4.3** (React 19.3.1, Tailwind 4.3.3, Recharts 3.10.1,
   TypeScript 7.0.2, `pg` 8.23.1, `mongodb` 7.8.0, `zod` 4.6.7, `jose` 6.2.14, `bcryptjs` 3.0.3 — checked with `npm view` on 2026-10-31).
   Recommendation: Next.js 16 (current, supported; the "no outdated technology" requirement). Choose 15 only if faculty require it literally.
2. **Git.** The repository root is the user's home directory (`C:/Users/ravit`, branch `mai`, one commit); this project folder is untracked
   inside it. Nothing was committed or initialised. Recommendation: `git init` inside `DBMS-MINI-PROJECT` for a clean project repo
   (the PDF also wants per-member commit history) — awaiting your decision.
3. The faculty requirements PDF (the "Req. 1–18" the plan refers to) is not in the repository; traceability uses the plan's §14 mapping and
   cannot be checked against the original brief.

## Part 2 decisions (2.2 - 2.4)

27. **Session = signed JWT holding only the user id.** Role, scope and active flag are reloaded from PostgreSQL per request (deactivation is immediate; no token revocation list needed). Cookie: httpOnly, SameSite=Lax, Secure in production, 8 h.
28. **Permission matrix as data** (`permissions.ts`) shared by API guards, page guards and navigation; scope ("own establishment") is enforced in SQL, never trusted from the client. Other tenants' records answer 404/403, not "exists".
29. **Approving, not requesting, reserves quantity.** Listing row locked, remaining quantity re-checked; lock order listing -> claim avoids deadlocks. Collecting writes the `REDISTRIBUTED`/`DONATION` waste event exactly as the seed models it.
30. **Matching = hard filters in SQL, then score.** Same locality (`zone_root()`), cooked-food policy, capacity >= 50% of the offer, pickup-window overlap; then 0.60 semantic + 0.25 capacity fit + 0.15 proximity (plan B2.9).
31. **Local embeddings** (all-MiniLM-L6-v2, ONNX, 384-d). No external API; weights cached in `.cache/`. Backfill is idempotent; an unavailable model degrades to NULL embeddings (rows still saved) rather than failing requests.
32. **ETL via Mongo lease + PostgreSQL lineage.** `sync_lock` lease prevents double processing; `source_doc_id` makes re-runs duplicate-free; per-document transaction; FAILED + safe error + attempts. Weak fuzzy matches (< 0.60) are used but not cached, and flagged in notes.
33. **Integration tests use a disposable database** built from the real migrations and seed, never the working data.
34. **Charts:** validated categorical palette in fixed slot order, legend always present, table view for the trend chart, 4 px rounded bar ends, tooltips; ranked bars in plain CSS.
35. _(Part 2 note, superseded)_ the Phase-3 items listed here as not built (stored procedures, lot and audit triggers, views, query catalogue, EXPLAIN evidence) were built in Part 3; see decisions 36-48.

## Part 3 decisions

36. **Business rules that must hold for every client live in the database** (functions, procedure, triggers); the app keeps authorisation and presentation. One enforcement point, atomic with the data, tested once. Cost: logic is in SQL, so the repositories became thinner and the SQL files carry the explanations.
37. **Stock is deducted exactly once, by trigger T3.** The app-side `UPDATE inventory_lot` was removed; the seed bypasses T3 with a transaction-local GUC. Tested through every path (API, SQL, bulk load, update, delete) plus a global invariant.
38. **T3 is a BEFORE trigger.** The first version (AFTER INSERT) deadlocked under 10 concurrent write-offs: the foreign-key check takes `FOR KEY SHARE` on the lot, then the trigger's `FOR UPDATE` was a lock upgrade. Taking the exclusive lock first serialises writers. Found by test, fixed in migration 017 before it was ever committed.
39. **Bulk-load switch `zonefood.bulk_load`.** Only `seed.py` sets it (`SET LOCAL`); it bypasses T3 and T4 so the finished historical dataset is not re-deducted or audited. Application sessions never set it (tested).
40. **Error codes are a contract.** Functions raise `P0002` (not found / not yours, 404), `55000` (state conflict, 409), `23514` (rule violated, 422), `42501` (forbidden, 403), `23505` (duplicate, 409). The app maps SQLSTATE to HTTP and shows the function's message, so users see specific reasons.
41. **Data provenance is derived by the database** (`measurement_source` set by T2: ETL rows `ETL_IMPORT`, redistribution rows `SYSTEM`, else `MANUAL`). The ALTER migration is therefore a real feature, not a cosmetic column.
42. **"Waste" excludes redistributed food everywhere** (views, MV, queries, dashboards) so diversion rate and totals are consistent. `v_redistribution_performance` aggregates claims in a LATERAL subquery to avoid join fan-out.
43. **The materialised view is intentionally stale until refreshed**, refreshed `CONCURRENTLY` (needs the unique index) by the zone admin or the seed. Staleness is shown and tested, not hidden.
44. **Q21 replaced** (forecast accuracy -> data provenance) because forecasting is optional Part 4. **ALTER/DROP targets differ** from the plan's suggestion (REQUIREMENTS_TRACEABILITY D1, D2).
45. **DBMS Lab safety model.** Queries are selected by id from `db/queries` (no client SQL); SELECT in a READ ONLY transaction; DML always rolled back; 20 s timeout; 200-row cap; the only write is the MV refresh. Constraint demos run in rolled-back transactions.
46. **`idx_waste_lot` (migration 018)** was added because EXPLAIN showed Q20 scanning `waste_event` once per lot (30 s timeout); with the partial index it runs in under a second. Performance work is driven by plans, not guesses.
47. **Charts always have a table alternative**, a legend for 2+ series, fixed categorical slots, anomaly markers from SQL (z-score) rather than client-side statistics. Insight numbers come from `lib/db/repositories/insights.ts`, which runs the same SQL as the catalogue (an integration test asserts equality).
48. **Git:** the repository root remains the home directory of the user (branch `mai`, one commit). Nothing was initialised, committed or pushed; the per-member commit history in Req. 15 needs your decision.
