# CURRENT STATUS - ZoneFood

_Single source of truth. Last updated 2026-11-01 after the finalisation round (IMPLEMENTATION.md, forecasting, GitHub readiness)._

## Overall readiness

**Parts 1-3 and the forecasting extension are implemented and verified.** Requirements audit: 16 of 18 COMPLETE, **Req. 2 (team names/roles) and Req. 15 (GitHub remote / individual commits) PARTIAL** - they need information or action from you (below). So the project is **not claimed 100 % complete**. Nothing has been pushed or published.

## Phase status

| Part | State |
|---|---|
| 1 Database foundation · 2 Application · 3 Catalogue / advanced DBMS / UI polish / tests / docs | complete, approved |
| Audit + premium UI + Git set-up (previous round) | complete |
| **This round:** `IMPLEMENTATION.md` · audit/fixes · **real ML forecasting** · forecasting dashboard · `FRIEND_SETUP_GUIDE.md` · isolated fresh-clone test | complete (see details) |
| Part 4 beyond forecasting (similar-incident search, traceability tier, multi-day horizon) | not started |

## Completed this round

1. **`IMPLEMENTATION.md`** (repo root): architecture, stack, schema and 19 migrations, advanced DBMS features, 27-query catalogue, MongoDB/ETL, auth and roles, workflows, frontend, forecasting, tests, folder structure, decisions, limitations - every statement taken from source, migrations, the live catalogue or test runs.
2. **Audit / fixes**
   * Repository audit: tracked files = 351; no `.env`, `node_modules`, `.venv`, `.next`, `.cache`, reports, logs or volumes tracked; none of the four secret values from `.env` occurs in any tracked file (re-scanned with `git grep`). Largest tracked files are screenshots (< 1 MB each); `.git` is 16 MB.
   * `docker-compose.yml`: container names now derive from `COMPOSE_PROJECT_NAME` (default `zonefood`, so existing setups are unchanged) - enables isolated clones.
   * **React `use()` message:** found once in the Next.js dev log (`.next/dev/logs/next-development.log`: "This library called use() to suspend in a previous render but did not call use() when it finished", shortly after a successful sign-in sequence). The application source contains **no** `use()` call. It could **not be reproduced**: 3 scripted browser sessions against the running dev server (8 logins with failed attempts, invalid form submits, modal open/submit/close, rapid sidebar navigation, 35 pages) produced no such error. Because the log pattern pointed at `router.replace()` + `router.refresh()` firing back-to-back (and refreshes after a modal form unmounts), those calls are now wrapped in `startTransition` (`login-form`, `register-forms`, `useSubmit`). **This is hardening, not a verified fix**; if the message appears again please send the component stack.
   * Fixed two defects found by my own tests: a hard-coded "last 5 migrations" assertion, and the forecast tables' rendering (nested table rows).
3. **Forecasting** (details and results: `docs/FORECASTING.md`)
   * `scripts/forecast.py`: next-day waste per establishment; seasonal naive vs Ridge vs LightGBM; lag / rolling / calendar / event / size features; chronological train / validation / test (28 + 28 days); leakage tests; MAE, RMSE, WAPE at kitchen and zone level; stored in migration 019 tables.
   * `/forecast` + `/api/forecast` (`forecast:view`; zone view for admin/auditor, own-establishment view for managers/staff, recipients refused), loading skeleton, empty state, error boundary, interactive actual-vs-predicted chart (legend toggles, tooltip with % error, table view), animated KPI cards, model comparison bars, scores table, importance bars, method and limitations panel; light/dark; checked at 1440 and 390 px.
   * Plan query 21 is now real: **Q27** (forecast accuracy per model), closing deviation D1.
4. **`FRIEND_SETUP_GUIDE.md`**: exact clone-to-run steps (Windows PowerShell), accounts, troubleshooting.

## ML model comparison (stored run on the working database)

History 3 Jun - 30 Oct 2026 (150 days, 56 establishments); test 3 - 30 Oct (28 days, 1,568 establishment-days). Lower is better; kg.

| Model | MAE est-day | RMSE est-day | MAE zone-day | RMSE zone-day | zone WAPE |
|---|---|---|---|---|---|
| Seasonal naive (baseline) | 18.86 | 39.91 | 336.0 | 418.3 | 15.7 % |
| Ridge (alpha 1000) | 16.89 | 34.50 | **241.0** | **291.9** | **11.3 %** |
| LightGBM (31 leaves, 101 trees) | **15.99** | **33.09** | 253.4 | 332.2 | 11.8 % |

Both learned models beat the baseline (Ridge: zone MAE 28 % lower); LightGBM is best per kitchen, Ridge on the zone total (stored "best" = lowest zone RMSE, rule fixed in advance). On a freshly seeded database in the isolated clone: baseline zone MAE 287 vs Ridge 240 vs LightGBM 257. **Limits:** synthetic data with built-in weekly/event structure, 28-day test window, one-day horizon, offline training.

## Tests actually executed (2026-11-01)

| Run | Result |
|---|---|
| `python scripts/run_all_tests.py` on the working tree | **257 / 257** - pytest 128, vitest unit 46, vitest integration 83 (disposable DB, includes the forecast API); type-check clean; ESLint clean; production build pass (70 routes) |
| Same command in an **isolated fresh clone** (`git clone` of the repository; own Compose project `zfiso`, own Docker volumes, ports 5544/27055, new passwords, new databases) | `docker compose up --wait` healthy; `setup_db.py` 55/55; `npm ci`; `demo:prepare` (81/81 foods, 8/8 recipients embedded); `forecast.py` ran (ridge best); **257 / 257**, type-check, lint, build pass; app started; browser smoke of 35 pages for admin / manager / recipient: HTTP 200, 0 console errors, 0 overflow |
| `verify_db.py` on the working database (now with the 4 forecast tables) | 55 / 55; the working database was only migrated forward (019) and a forecast run stored, never reset |
| Cleanup | clone folder, its containers, volumes, network and databases removed; the original `zonefood` containers and volume were untouched (checked) |

Failures and resolutions this round: see item 2 above. One of my repro scripts accidentally created 3 REQUESTED claims (ids 3939-3941) in the working database; they were deleted (claims back to 3,938) and four `audit_log` rows remain as QA debris.

## Git

Repository root: `DBMS-MINI-PROJECT/.git` (branch `main`); the home-directory repository is untouched. History preserved (11 commits, latest: forecasting). Author identity = your configured Git identity; assistant commits carry `Co-Authored-By`. No remote; **nothing pushed**.

## Files safe / unsafe to push

* **Safe (tracked, 351 files):** `src/`, `db/`, `scripts/`, `scripts-web/`, `tests/`, `tests-web/`, `docs/` (incl. screenshots), config files (`package.json`, `package-lock.json`, `tsconfig*.json`, `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`, `vitest*.ts`, `pytest.ini`, `requirements.txt`, `docker-compose.yml`), `.env.example`, `.gitignore`, `.gitattributes`, `README.md`, `IMPLEMENTATION.md`, `FRIEND_SETUP_GUIDE.md`, `CURRENT_STATUS.md`, `AGENTS.md`, `ZoneFood_Master_Plan.pdf`, `ZoneFood_WORKFLOW.md`.
* **Never push (all git-ignored and untracked):** `.env`, `node_modules/`, `.venv/`, `.next/`, `.cache/` (model weights), `reports/`, `.pytest_cache/`, `__pycache__/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`, Docker volumes (live outside the folder).
* The two PDFs/markdown specs are the project brief; remove them from the repository if your course forbids publishing them.

## Remaining information / decisions required from you

1. **Team member names, university IDs and the split of work** → `docs/TEAM_AND_CONTRIBUTIONS.md` (every `⟦ ⟧`) and the title block of `docs/PROJECT_REPORT.md`.
2. **GitHub**: create the repository, add the remote, push (steps below); each member should commit under their own account for genuine individual history.
3. If the `use()` message appears again, the browser console stack.

## Exact GitHub push preparation

```powershell
cd C:\Users\ravit\OneDrive\Desktop\DBMS-MINI-PROJECT
git status                         # should be clean
git ls-files | Select-String "\.env$"   # must print nothing
git log --oneline                  # history is preserved
# on github.com: create an EMPTY repository (no README / .gitignore / licence), then:
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main            # only when you are ready
```

## Environment note

The browser-automation helper stopped finding Chromium after the CodeGPT extension updated (it asked for `chromium-1248`). I added a directory junction `%LOCALAPPDATA%\ms-playwright\chromium-1248` → `chromium-1243`; it is outside the project and can be deleted safely.

## Run commands

```powershell
docker compose up -d --wait
python scripts/setup_db.py            # add --reset for a clean rebuild (use .\.venv\Scripts\python)
npm install
python scripts/forecast.py            # train + store the forecast (Forecast page)
npm run demo:prepare
npm run dev                           # http://localhost:3000
python scripts/run_all_tests.py       # everything + docs/TEST_REPORT.md
```
