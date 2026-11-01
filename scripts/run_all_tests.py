"""Run EVERY test suite and render docs/TEST_REPORT.md from the real results (nothing typed by hand).

    python scripts/run_all_tests.py              run everything (~4-5 minutes) and write the report
    python scripts/run_all_tests.py --skip-build skip the production build step

Suites: pytest (database layer: Part 1 + Part 3), TypeScript type-check, ESLint, vitest unit, vitest integration
(against a disposable database), Next.js production build. Raw outputs are kept in reports/ (git-ignored).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import platform
import re
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db_config import ROOT, pg_dsn  # noqa: E402

REPORTS = ROOT / "reports"
NPM = shutil.which("npm") or "npm"
NPX = shutil.which("npx") or "npx"


def run(cmd: list[str], label: str) -> tuple[int, float, str]:
    print(f"\n=== {label}: {' '.join(cmd)}", flush=True)
    t0 = time.time()
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    secs = time.time() - t0
    out = (p.stdout or "") + (p.stderr or "")
    print(out[-1500:] if p.returncode else "\n".join(out.splitlines()[-6:]), flush=True)
    print(f"--- exit {p.returncode} in {secs:.0f}s", flush=True)
    return p.returncode, secs, out


def junit(path: Path):
    root = ET.parse(path).getroot()
    suite = root if root.tag == "testsuite" else root.find("testsuite")
    cases = []
    for tc in suite.iter("testcase"):
        status = "passed"
        detail = ""
        for tag in ("failure", "error", "skipped"):
            el = tc.find(tag)
            if el is not None:
                status = "failed" if tag in ("failure", "error") else "skipped"
                detail = (el.get("message") or "")[:300]
        cases.append((tc.get("classname", "").replace("tests.", ""), tc.get("name", ""), status, detail))
    return cases


def vitest(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    cases = []
    for f in data["testResults"]:
        name = Path(f["name"]).name
        for a in f["assertionResults"]:
            cases.append((name, a["fullName"], a["status"], "; ".join(a.get("failureMessages", []))[:300]))
    return cases


def table(rows: list[tuple]) -> str:
    return "\n".join(["| " + " | ".join(rows[0]) + " |", "|" + "|".join("---" for _ in rows[0]) + "|"] + ["| " + " | ".join(str(c).replace("|", "\\|") for c in r) + " |" for r in rows[1:]])


def listing(cases: list[tuple]) -> str:
    out = []
    by_file: dict[str, list] = {}
    for f, n, s, d in cases:
        by_file.setdefault(f, []).append((n, s, d))
    for f, items in by_file.items():
        ok = sum(1 for _, s, _ in items if s == "passed")
        out.append(f"<details><summary><code>{f}</code> - {ok}/{len(items)} passed</summary>\n")
        for n, s, d in items:
            out.append(f"- {'✅' if s == 'passed' else '❌' if s == 'failed' else '⏭'} {n}" + (f" - `{d}`" if d and s != "passed" else ""))
        out.append("\n</details>\n")
    return "\n".join(out)


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")  # build output contains box-drawing characters
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--skip-build", action="store_true")
    args = ap.parse_args()
    REPORTS.mkdir(exist_ok=True)
    started = dt.datetime.now()

    results: list[dict] = []

    code, secs, _ = run([sys.executable, "-m", "pytest", "-q", f"--junitxml={REPORTS / 'pytest.xml'}"], "pytest")
    py = junit(REPORTS / "pytest.xml")
    results.append(dict(name="Database layer (pytest)", cmd="python -m pytest -q", cases=py, secs=secs, code=code))

    code, secs, _ = run([NPM, "run", "typecheck"], "typecheck")
    results.append(dict(name="TypeScript type-check", cmd="npm run typecheck", cases=None, secs=secs, code=code))
    code, secs, _ = run([NPM, "run", "lint"], "lint")
    results.append(dict(name="ESLint", cmd="npm run lint", cases=None, secs=secs, code=code))

    code, secs, _ = run([NPX, "vitest", "run", "--reporter=json", f"--outputFile={REPORTS / 'vitest-unit.json'}"], "unit")
    results.append(dict(name="Unit tests (vitest)", cmd="npm test", cases=vitest(REPORTS / "vitest-unit.json"), secs=secs, code=code))

    code, secs, _ = run([NPX, "vitest", "run", "--config", "vitest.integration.config.ts", "--reporter=json", f"--outputFile={REPORTS / 'vitest-integration.json'}"], "integration")
    results.append(dict(name="Integration tests (vitest, disposable DB)", cmd="npm run test:integration", cases=vitest(REPORTS / "vitest-integration.json"), secs=secs, code=code))

    build_note = ""
    if not args.skip_build:
        code, secs, out = run([NPM, "run", "build"], "build")
        routes = len(re.findall(r"^[├└┌] [ƒ○]", out, flags=re.M))
        build_note = f"{routes} routes compiled"
        results.append(dict(name="Production build (Next.js)", cmd="npm run build", cases=None, secs=secs, code=code, note=build_note))

    with psycopg.connect(pg_dsn()) as c:
        pg = c.execute("SELECT version()").fetchone()[0].split(" on ")[0]
        mig = c.execute("SELECT count(*) FROM schema_migrations").fetchone()[0]
    node = subprocess.run(["node", "-v"], capture_output=True, text=True).stdout.strip()

    rows = [("Suite", "Command", "Passed", "Failed", "Time", "Result")]
    total = passed = 0
    for r in results:
        if r["cases"] is not None:
            n = len(r["cases"]); p = sum(1 for c in r["cases"] if c[2] == "passed"); f = sum(1 for c in r["cases"] if c[2] == "failed")
            total += n; passed += p
            rows.append((r["name"], f"`{r['cmd']}`", f"{p}/{n}", f, f"{r['secs']:.0f}s", "PASS" if r["code"] == 0 else "FAIL"))
        else:
            rows.append((r["name"], f"`{r['cmd']}`", r.get("note", "clean" if r["code"] == 0 else "errors"), "-", f"{r['secs']:.0f}s", "PASS" if r["code"] == 0 else "FAIL"))
    ok = all(r["code"] == 0 for r in results)

    md = [
        "# Test report", "",
        f"_Generated {started:%Y-%m-%d %H:%M} by `python scripts/run_all_tests.py`. Every figure below was produced by running the suites in this repository; the per-test lists are parsed from their machine-readable reports (`reports/`)._", "",
        f"**Overall: {'ALL SUITES PASSED' if ok else 'FAILURES - see below'} - {passed} of {total} automated tests passed**, plus type-check, lint and a production build.", "",
        "## Environment", "",
        f"- {pg}; migrations applied: {mig}; MongoDB 7 (Docker); pgvector 0.8",
        f"- Node {node}, Python {platform.python_version()}, Windows {platform.release()}",
        "- Integration tests run against a **disposable database** (`zonefood_webtest`) built from the real migrations and seed; pytest uses its own throw-away databases. The working database is never touched by the suites.", "",
        "## Summary", "", table(rows), "",
        "## How to reproduce", "",
        "```powershell", "docker compose up -d --wait", "python scripts/run_all_tests.py      # everything + this report", "# or individually:",
        "python -m pytest -q                  # database layer", "npm test                             # unit", "npm run test:integration            # API + workflows + Mongo + ETL + concurrency", "npm run build", "```", "",
        "## What each suite proves", "",
        "| Suite | Covers |", "|---|---|",
        "| pytest `test_part1.py` | migrations from empty, idempotent re-run, checksum tamper rejection, constraints (PK/FK/UNIQUE/CHECK), triggers T1/T2, partition pruning, seed determinism, MongoDB shapes/validators/indexes, docs match schema |",
        "| pytest `test_part3.py` | ALTER/DROP DDL, views, materialised view refresh, stored functions/procedure, triggers T3-T6, stock consistency, transactions & rollback, partition function, **real multi-connection concurrency** |",
        "| pytest `test_catalogue.py` | all 26 catalogue queries execute on a clean seeded database and their results are semantically correct; DML leaves data untouched |",
        "| pytest `test_demos.py` | the safe DDL/transaction demonstration scripts run and leave no trace |",
        "| vitest unit | permission matrix, claim state machine, scoring maths, name-matching policy, ETL adapters, rate limiter, validation schemas, env |",
        "| vitest integration | authentication, sessions, RBAC (403/404), registration atomicity, every lifecycle workflow, API validation, concurrency (claims, approvals, write-offs), session-close procedure, audit attribution, DBMS Lab API (all queries + demos), MongoDB submissions, ETL idempotency/retry/lease, pgvector name matching, analytics = catalogue, dashboard correctness |", "",
        "## Detailed results", "",
    ]
    for r in results:
        if r["cases"] is not None:
            md += [f"### {r['name']}", "", listing(r["cases"]), ""]
    failed = [(r["name"], c) for r in results if r["cases"] for c in r["cases"] if c[2] == "failed"]
    if failed:
        md += ["## Failures", ""] + [f"- **{n}** `{c[1]}`: {c[3]}" for n, c in failed]
    (ROOT / "docs" / "TEST_REPORT.md").write_text("\n".join(md), encoding="utf-8")
    print(f"\nwrote docs/TEST_REPORT.md - {passed}/{total} passed; overall {'OK' if ok else 'FAILED'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
