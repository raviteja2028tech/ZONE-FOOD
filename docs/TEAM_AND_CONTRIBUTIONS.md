# Team and individual responsibilities (Req. 2, Req. 15)

> **INFORMATION REQUEST - this page cannot be completed from the repository.** Nothing below has been invented. Please supply the names, university IDs and the real division of work; every `⟦ ⟧` marker must be replaced before submission.

## Members

| # | Name | University ID | Role |
|---|---|---|---|
| 1 | ⟦ to be supplied ⟧ | ⟦ ⟧ | ⟦ ⟧ |
| 2 | ⟦ to be supplied ⟧ | ⟦ ⟧ | ⟦ ⟧ |

## Responsibility matrix (assign each row to a member, or both)

The work packages below are the real components of the repository; the "Owner" and "Evidence of contribution" columns are for you to complete.

| Work package | Main artefacts | Owner | Evidence of contribution (commits / files) |
|---|---|---|---|
| Problem definition, requirements, plan | `ZoneFood_Master_Plan.pdf`, `docs/REQUIREMENTS_*.md` | ⟦ ⟧ | ⟦ ⟧ |
| Relational schema, ER diagram, normalisation | `db/migrations/001-013`, `docs/ER_DIAGRAM.md`, `DATA_MODEL.md` | ⟦ ⟧ | ⟦ ⟧ |
| MongoDB design and ETL | `scripts/mongo_init.py`, `docs/MONGODB_DESIGN.md`, `src/lib/db/repositories/etl.ts` | ⟦ ⟧ | ⟦ ⟧ |
| Synthetic data generator | `scripts/seed.py`, `seed_catalog.py` | ⟦ ⟧ | ⟦ ⟧ |
| SQL query catalogue | `db/queries/`, `docs/QUERY_CATALOGUE.md` | ⟦ ⟧ | ⟦ ⟧ |
| Stored functions, procedure, triggers, views | `db/migrations/014-018` | ⟦ ⟧ | ⟦ ⟧ |
| Indexing, EXPLAIN, concurrency evidence | `docs/EXPLAIN_EVIDENCE.md`, `CONCURRENCY_EVIDENCE.md` | ⟦ ⟧ | ⟦ ⟧ |
| Backend API, authentication, RBAC, security | `src/app/api`, `src/lib/auth` | ⟦ ⟧ | ⟦ ⟧ |
| Embeddings and semantic matching | `src/lib/embeddings`, `src/lib/domain/matching.ts` | ⟦ ⟧ | ⟦ ⟧ |
| Frontend, dashboards, DBMS Lab, UI design | `src/components`, `src/app/(shell)` | ⟦ ⟧ | ⟦ ⟧ |
| Testing and quality | `tests/`, `tests-web/`, `docs/TEST_REPORT.md` | ⟦ ⟧ | ⟦ ⟧ |
| Documentation, demo, viva preparation | `README.md`, `docs/` | ⟦ ⟧ | ⟦ ⟧ |

## Version-control status (Req. 15)

* The repository is initialised **inside the project folder** (`DBMS-MINI-PROJECT/.git`); the home-directory repository was not modified.
* History currently contains component commits authored under the single Git identity configured on this machine. Assistant-assisted commits carry a `Co-Authored-By` trailer. **No contribution has been attributed to any person who did not make it.**
* **Not done, needs your decision:** create the GitHub repository, add the remote and push. Do not rewrite history to simulate two contributors; instead each member should commit their future work (documentation fixes, rehearsal changes, bug fixes) under their own account so `git log --author` shows genuine individual contributions.

```powershell
git remote add origin <your repository URL>     # only when you decide to publish
git push -u origin main
git shortlog -sn --all                           # evidence of contributors for the viva
```
