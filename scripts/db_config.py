"""Shared connection settings for the ZoneFood scripts.

Values come from the process environment first, then from `.env` in the project root
(a minimal KEY=VALUE parser, so no extra dependency is needed). Nothing is hardcoded:
a missing variable stops the script with a message telling you what to set.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import quote_plus

ROOT = Path(__file__).resolve().parent.parent


def _load_env_file() -> dict[str, str]:
    values: dict[str, str] = {}
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            values[key.strip()] = val.strip().strip('"').strip("'")
    return values


_FILE_ENV = _load_env_file()


def env(name: str, default: str | None = None, required: bool = True) -> str | None:
    value = os.environ.get(name) or _FILE_ENV.get(name) or default
    if value is None and required:
        sys.exit(f"Missing configuration '{name}'. Copy .env.example to .env and set it.")
    return value


def pg_dsn(dbname: str | None = None) -> str:
    """libpq connection string for PostgreSQL (database overridable, e.g. for tests)."""
    return (
        f"host={env('POSTGRES_HOST', '127.0.0.1')} port={env('POSTGRES_PORT', '5433')} "
        f"user={env('POSTGRES_USER')} password={env('POSTGRES_PASSWORD')} connect_timeout=10 "
        f"dbname={dbname or env('POSTGRES_DB')}"
    )


def mongo_uri() -> str:
    user = quote_plus(env("MONGO_INITDB_ROOT_USERNAME"))
    pwd = quote_plus(env("MONGO_INITDB_ROOT_PASSWORD"))
    return (
        f"mongodb://{user}:{pwd}@{env('MONGO_HOST', '127.0.0.1')}:{env('MONGO_PORT', '27018')}"
        f"/?authSource=admin"
    )


def mongo_db_name(override: str | None = None) -> str:
    return override or env("MONGO_DB", "zonefood")
