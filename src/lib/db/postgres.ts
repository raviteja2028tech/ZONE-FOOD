import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { getEnv } from "@/lib/env/server";
import { log } from "@/lib/log/logger";

/**
 * PostgreSQL access: a single pooled connection set and explicit, parameterised SQL.
 * There is deliberately no ORM; every statement in the app is visible SQL with $1, $2 placeholders.
 * Values are NEVER concatenated into the SQL text.
 */

// BIGINT (OID 20) identifiers - session_id, listing_id, claim_id, waste_id ... - arrive as strings by default.
// Every id and count in this schema is far below 2^53, so parse them as JS numbers. NUMERIC stays a string on
// purpose (exact decimals) and is converted explicitly where it is displayed or summed.
types.setTypeParser(20, (v: string) => Number(v));

// Cached on globalThis so Next.js dev hot-reload does not leak pools.
const globalForPg = globalThis as unknown as { __zonefoodPg?: Pool };

export function getPool(): Pool {
  if (!globalForPg.__zonefoodPg) {
    const env = getEnv();
    const pool = new Pool({
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      database: env.POSTGRES_DB,
      application_name: "zonefood-web",
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 15_000,
    });
    // An idle client erroring (e.g. DB restart) must not crash the process.
    pool.on("error", (err) => log.error("postgres idle client error", { err }));
    globalForPg.__zonefoodPg = pool;
  }
  return globalForPg.__zonefoodPg;
}

export type SqlParams = readonly unknown[];

/** Runs one parameterised statement and returns the rows. */
export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: SqlParams = []): Promise<T[]> {
  const result = await getPool().query<T>(text, params as unknown[]);
  return result.rows;
}

/** Returns the first row or undefined. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: SqlParams = [],
): Promise<T | undefined> {
  return (await query<T>(text, params))[0];
}

/**
 * Runs `fn` in a transaction: COMMIT if it resolves, ROLLBACK if it throws. With `userId`, the transaction is tagged
 * with the acting user (`app.current_user_id`) so the audit trigger records who made each change.
 * Use the supplied client for every statement that must succeed or fail together.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>, opts: { userId?: number } = {}): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Attribute every audited row written in this transaction to the signed-in user (read by trigger T4).
    if (opts.userId) await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(opts.userId)]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      log.error("rollback failed", { err: rollbackErr });
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  const pool = globalForPg.__zonefoodPg;
  globalForPg.__zonefoodPg = undefined;
  await pool?.end();
}
