import "server-only";
import { query, queryOne } from "./postgres";
import { getMongoDb } from "./mongo";
import { ConfigError, getEnv } from "@/lib/env/server";
import { scrub } from "@/lib/log/logger";
import { log } from "@/lib/log/logger";
import type { ConfigHealth, MongoHealth, PostgresHealth, SystemHealth } from "@/types/health";

/** Connection errors are summarised for display; raw driver text may contain host details. */
function describeError(err: unknown): string {
  if (err instanceof ConfigError) return err.message;
  const code = (err as { code?: string })?.code;
  const name = err instanceof Error ? err.name : "Error";
  if (code === "ECONNREFUSED") return "Connection refused - is the Docker container running? (docker compose up -d --wait)";
  if (code === "28P01" || code === "28000") return "Authentication failed - check the credentials in .env.";
  if (code === "3D000") return "Database does not exist - run: python scripts/setup_db.py";
  if (name === "MongoServerSelectionError") return "MongoDB is not reachable - is the Docker container running?";
  if (name === "MongoServerError" && /auth/i.test(String((err as Error).message))) {
    return "Authentication failed - check the credentials in .env.";
  }
  const message = err instanceof Error ? scrub(err.message) : "Unknown error";
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}

export function checkConfig(): ConfigHealth {
  try {
    getEnv();
    return { status: "ok", issues: [] };
  } catch (err) {
    if (err instanceof ConfigError) return { status: "invalid", issues: err.issues };
    throw err;
  }
}

export async function checkPostgres(): Promise<PostgresHealth> {
  const started = performance.now();
  try {
    const info = await queryOne<{ version: string; database: string }>(
      "SELECT version() AS version, current_database() AS database",
    );
    const latencyMs = Math.round(performance.now() - started);

    const extensions = await query<{ name: string; version: string }>(
      "SELECT extname AS name, extversion AS version FROM pg_extension WHERE extname = ANY($1::text[]) ORDER BY extname",
      [["vector", "pg_trgm"]],
    );
    const tables = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_class c
         JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition`,
    );
    // schema_migrations is created by Part 1's migration runner; absence means migrations have not been run.
    const migrations = await queryOne<{ n: number }>(
      "SELECT CASE WHEN to_regclass('public.schema_migrations') IS NULL THEN NULL ELSE (SELECT count(*)::int FROM schema_migrations) END AS n",
    );

    return {
      status: "up",
      latencyMs,
      version: /PostgreSQL\s+([\d.]+)/.exec(info?.version ?? "")?.[1],
      database: info?.database,
      extensions,
      tableCount: tables?.n,
      migrationsApplied: migrations?.n ?? 0,
    };
  } catch (err) {
    log.warn("postgres health check failed", { err });
    return { status: "down", latencyMs: Math.round(performance.now() - started), error: describeError(err) };
  }
}

export async function checkMongo(): Promise<MongoHealth> {
  const started = performance.now();
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    const latencyMs = Math.round(performance.now() - started);

    const build = await db.admin().command({ buildInfo: 1 });
    const infos = await db.listCollections({}, { nameOnly: true }).toArray();
    const names = infos.map((c) => c.name).filter((n) => !n.startsWith("system.")).sort();
    const collections = await Promise.all(
      names.map(async (name) => ({ name, documents: await db.collection(name).estimatedDocumentCount() })),
    );

    return { status: "up", latencyMs, version: String(build.version), database: db.databaseName, collections };
  } catch (err) {
    log.warn("mongodb health check failed", { err });
    return { status: "down", latencyMs: Math.round(performance.now() - started), error: describeError(err) };
  }
}

/** Runs all checks. Never throws: failures are reported as data. */
export async function checkSystem(): Promise<SystemHealth> {
  const config = checkConfig();
  if (config.status === "invalid") {
    const down = { status: "down" as const, latencyMs: 0, error: "Not checked - configuration is invalid." };
    return { status: "down", checkedAt: new Date().toISOString(), config, postgres: down, mongo: down };
  }
  const [postgres, mongo] = await Promise.all([checkPostgres(), checkMongo()]);
  const up = [postgres, mongo].filter((d) => d.status === "up").length;
  return {
    status: up === 2 ? "healthy" : up === 0 ? "down" : "degraded",
    checkedAt: new Date().toISOString(),
    config,
    postgres,
    mongo,
  };
}
