# ZoneFood - setup guide (clone to running app)

Everything runs locally; nothing is sent to the internet except the one-time download of a ~23 MB embedding model. All data is synthetic. Written for **Windows 10/11 (PowerShell)**; macOS/Linux differences are noted.

## 0. Install once

| Tool | Version | Check |
|---|---|---|
| Git | any recent | `git --version` |
| Docker Desktop (running) | any recent, Compose v2 | `docker compose version` |
| Python | 3.11 or newer | `python --version` |
| Node.js | 20.9 or newer (tested on 24) | `node -v` |

Make sure ports **5433** (PostgreSQL), **27018** (MongoDB) and **3000** (app) are free, or change them in `.env` (step 2).

## 1. Get the code

```powershell
git clone <REPOSITORY-URL> zonefood
cd zonefood
```

## 2. Create your private configuration

```powershell
Copy-Item .env.example .env
notepad .env
```

Change these values (they are local-only; pick anything):

| Variable | What to put |
|---|---|
| `POSTGRES_PASSWORD` | any password |
| `MONGO_INITDB_ROOT_PASSWORD` | any password |
| `DEMO_USER_PASSWORD` | the password you will type to log in to every demo account |
| `SESSION_SECRET` | at least 32 random characters. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

Never commit `.env` (it is git-ignored). Leave the other lines as they are.

## 3. Start the databases

```powershell
docker compose up -d --wait
```

Wait until it prints both services as healthy (`docker compose ps`). The first start downloads two images.

## 4. Python environment and database setup

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python scripts\setup_db.py
```

(macOS/Linux: `.venv/bin/python` instead of `.\.venv\Scripts\python`.) `setup_db.py` applies migrations 001-019, seeds ~150 days of synthetic data (about 10-30 s), loads MongoDB and runs 55 verification checks - the last line should read `55/55 checks passed`. It is safe to re-run; add `--reset` for a clean rebuild.

## 5. Web application

```powershell
npm install
npm run demo:prepare      # embeds food names and creates a few live demo listings (first run downloads the model)
```

## 6. Train the forecasting models (one command)

```powershell
.\.venv\Scripts\python scripts\forecast.py
```

It prints a comparison table of the three models and stores the run; the **Forecast** page is empty until this has been run once.

## 7. Run

```powershell
npm run dev               # http://localhost:3000
```

For a production-style run: `npm run build` then `npm start`.

## 8. Log in

Open http://localhost:3000/login. The page lists the demo accounts; the password for all of them is the `DEMO_USER_PASSWORD` you set in step 2.

| Role | Email |
|---|---|
| Zone administrator | `admin@zonefood.example` |
| Auditor (read-only) | `auditor@zonefood.example` |
| Establishment manager | `manager.greenfield.academy.canteen@zonefood.example` |
| Recipient organisation | `agent.annapoorna.community.kitchen@zonefood.example` |

Suggested tour (12-14 minutes, exact steps): `docs/DEMO_SCRIPT.md`. Good first stops: **Overview** (animated KPIs, Zone pulse), **Analytics**, **Forecast**, **DBMS Lab** (run catalogue queries, EXPLAIN, constraint demonstrations).

## 9. Check that everything works (optional, ~5 minutes)

```powershell
.\.venv\Scripts\python scripts\run_all_tests.py        # all suites, writes docs\TEST_REPORT.md
```

It uses throw-away databases (`zonefood_webtest`, temporary `zf_test_*`) and never touches your data.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing configuration 'POSTGRES_PASSWORD'` | `.env` missing or not filled in (step 2). |
| Port already in use | Change `POSTGRES_PORT`, `MONGO_PORT` in `.env`, run `docker compose up -d --wait` again; for the app use `npm run dev -- -p 3001`. |
| Docker "container name already in use" | Another ZoneFood stack is running. Stop it (`docker compose down`) or run this copy under another project name: set `COMPOSE_PROJECT_NAME=zonefood2` (PowerShell: `$env:COMPOSE_PROJECT_NAME="zonefood2"`) **and** different ports in `.env`. |
| Login says invalid credentials | The password is the `DEMO_USER_PASSWORD` that was in `.env` **when the seed ran**. Change it later → run `setup_db.py --reset`. |
| "Too many attempts" at login | 5 failures lock that account/IP for 15 min; restart `npm run dev` to clear. |
| Forecast page is empty | Run step 6. After new data, run it again to refresh. |
| Embedding model download fails (offline) | Run `npm run demo:prepare` once with internet; the app otherwise works with semantic matching degraded to NULL embeddings. |
| Empty dashboards | `scripts\verify_db.py` then `scripts\setup_db.py --reset`. |
| Slow first page load in dev | Turbopack compiles on demand; use `npm run build; npm start` for a snappy demo. |
| Reset everything including volumes | `docker compose down -v` (**destroys all local data**), then repeat steps 3-6. |

## What not to commit

`.env`, `node_modules/`, `.venv/`, `.next/`, `.cache/`, `reports/`, database volumes - all already in `.gitignore`.
