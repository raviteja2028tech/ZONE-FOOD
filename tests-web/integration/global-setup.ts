import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Builds a throw-away PostgreSQL + MongoDB pair (`zonefood_webtest`) with the real migrations and the Part 1 seed,
 * so integration tests exercise the true schema, triggers and data without touching the working database.
 */
export const TEST_DB = "zonefood_webtest";

const root = process.cwd();
const venvPython = [path.join(root, ".venv", "Scripts", "python.exe"), path.join(root, ".venv", "bin", "python")].find(existsSync);
const python = venvPython ?? "python";

function run(...args: string[]) {
  const r = spawnSync(python, args, { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONUTF8: "1" } });
  if (r.status !== 0) throw new Error(`python ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
}

export async function setup() {
  run("scripts/migrate.py", "reset", "--yes", "--db", TEST_DB);
  run("scripts/mongo_init.py", "--db", TEST_DB, "--drop");
  run("scripts/seed.py", "--db", TEST_DB, "--mongo-db", TEST_DB, "--days", "45", "--end-date", new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
}

export async function teardown() {
  const code = `
import sys; sys.path.insert(0, 'scripts')
from migrate import drop_database
from pymongo import MongoClient
from db_config import mongo_uri
drop_database('${TEST_DB}')
MongoClient(mongo_uri()).drop_database('${TEST_DB}')
`;
  spawnSync(python, ["-c", code], { cwd: root, encoding: "utf8" });
}
