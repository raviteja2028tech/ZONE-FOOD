"""One-command database setup: migrate (optionally from scratch), seed, verify, regenerate docs.

    python scripts/setup_db.py            migrate pending, seed demo data, verify
    python scripts/setup_db.py --reset    DROP everything first (PostgreSQL schema + Mongo collections), then the same

Requires the containers to be running (`docker compose up -d --wait`) and a configured `.env`.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def run(*args: str) -> None:
    print(f"\n$ python {' '.join(args)}", flush=True)
    result = subprocess.run([sys.executable, *args], cwd=ROOT)
    if result.returncode != 0:
        sys.exit(f"step failed: python {' '.join(args)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--reset", action="store_true", help="destroy existing PostgreSQL/MongoDB data first")
    ap.add_argument("--no-seed", action="store_true", help="stop after migrations")
    ap.add_argument("--docs", action="store_true", help="also regenerate docs/ER_DIAGRAM.md and DATA_DICTIONARY.md")
    args = ap.parse_args()

    if args.reset:
        run("scripts/migrate.py", "reset", "--yes")
        run("scripts/mongo_init.py", "--drop")
    else:
        run("scripts/migrate.py", "up")
        run("scripts/mongo_init.py")
    if not args.no_seed:
        run("scripts/seed.py")
        run("scripts/verify_db.py")
    if args.docs:
        run("scripts/gen_docs.py")
    print("\nDatabase ready.")


if __name__ == "__main__":
    main()
