"""Versioned SQL migration runner for PostgreSQL.

    python scripts/migrate.py up                 apply pending migrations (default)
    python scripts/migrate.py status             list applied / pending migrations
    python scripts/migrate.py reset --yes        DROP everything in the database, then re-apply all

Migrations are the numbered files in db/migrations/. Each runs in its own transaction and is
recorded in `schema_migrations` with a checksum; editing an already-applied file is rejected.
Use --db NAME to target another database (created if missing), e.g. a throw-away test database.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

import psycopg
from psycopg import sql

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db_config import ROOT, env, pg_dsn  # noqa: E402

MIGRATIONS_DIR = ROOT / "db" / "migrations"


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9]_*.sql"))


def checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ensure_database(dbname: str) -> None:
    """Create `dbname` if it does not exist (connects to the maintenance DB)."""
    with psycopg.connect(pg_dsn("postgres"), autocommit=True) as conn:
        exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (dbname,)).fetchone()
        if not exists:
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(dbname)))
            print(f"created database {dbname}")


def drop_database(dbname: str) -> None:
    with psycopg.connect(pg_dsn("postgres"), autocommit=True) as conn:
        conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(dbname)))


def ensure_tracking_table(conn: psycopg.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    TEXT PRIMARY KEY,
            filename   TEXT NOT NULL,
            checksum   TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    conn.commit()


def applied(conn: psycopg.Connection) -> dict[str, str]:
    return dict(conn.execute("SELECT version, checksum FROM schema_migrations").fetchall())


def run_up(dbname: str) -> int:
    ensure_database(dbname)
    with psycopg.connect(pg_dsn(dbname)) as conn:
        ensure_tracking_table(conn)
        done = applied(conn)
        count = 0
        for path in migration_files():
            version = path.name.split("_", 1)[0]
            digest = checksum(path)
            if version in done:
                if done[version] != digest:
                    sys.exit(f"ERROR: {path.name} was modified after being applied (checksum mismatch).")
                continue
            try:
                conn.execute(path.read_text(encoding="utf-8"))
                conn.execute(
                    "INSERT INTO schema_migrations (version, filename, checksum) VALUES (%s, %s, %s)",
                    (version, path.name, digest),
                )
                conn.commit()
            except Exception as exc:  # roll back this migration only, then stop
                conn.rollback()
                sys.exit(f"ERROR applying {path.name}: {exc}")
            print(f"applied {path.name}")
            count += 1
    print(f"{count} migration(s) applied to '{dbname}'." if count else f"'{dbname}' is up to date.")
    return count


def run_status(dbname: str) -> None:
    ensure_database(dbname)
    with psycopg.connect(pg_dsn(dbname)) as conn:
        ensure_tracking_table(conn)
        done = applied(conn)
    for path in migration_files():
        version = path.name.split("_", 1)[0]
        print(f"{'applied' if version in done else 'PENDING':8} {path.name}")


def run_reset(dbname: str) -> None:
    ensure_database(dbname)
    with psycopg.connect(pg_dsn(dbname), autocommit=True) as conn:
        conn.execute("DROP SCHEMA IF EXISTS public CASCADE")
        conn.execute("CREATE SCHEMA public")
    print(f"dropped all objects in '{dbname}'")
    run_up(dbname)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", nargs="?", default="up", choices=["up", "status", "reset"])
    parser.add_argument("--db", help="target database name (default: POSTGRES_DB from .env)")
    parser.add_argument("--yes", action="store_true", help="confirm destructive 'reset'")
    args = parser.parse_args()
    dbname = args.db or env("POSTGRES_DB")

    if args.command == "up":
        run_up(dbname)
    elif args.command == "status":
        run_status(dbname)
    else:
        if not args.yes:
            sys.exit(f"'reset' destroys ALL data in '{dbname}'. Re-run with --yes to confirm.")
        run_reset(dbname)


if __name__ == "__main__":
    main()
