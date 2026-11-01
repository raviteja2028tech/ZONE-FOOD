import { afterAll, describe, expect, it } from "vitest";
import "./setup-env";
import { closePool, query, queryOne, withTransaction } from "@/lib/db/postgres";
import { closeMongo, getMongoDb } from "@/lib/db/mongo";
import { checkMongo, checkPostgres, checkSystem } from "@/lib/db/health";
import { getDatasetCounts } from "@/lib/db/repositories/overview";
import { GET as healthAll } from "@/app/api/health/route";
import { GET as healthPg } from "@/app/api/health/postgres/route";
import { GET as healthMongo } from "@/app/api/health/mongo/route";

afterAll(async () => {
  await closePool();
  await closeMongo();
});

describe("PostgreSQL layer", () => {
  it("connects to PostgreSQL 16 with pgvector and all Part 1 migrations", async () => {
    const h = await checkPostgres();
    expect(h.status).toBe("up");
    expect(h.version).toMatch(/^16\./);
    expect(h.extensions?.map((e) => e.name)).toContain("vector");
    expect(h.migrationsApplied).toBeGreaterThanOrEqual(11);
    expect(h.tableCount).toBeGreaterThanOrEqual(28);
  });

  it("binds parameters instead of interpolating them (SQL injection is inert)", async () => {
    const payload = "x'; DROP TABLE zone; --";
    const row = await queryOne<{ v: string }>("SELECT $1::text AS v", [payload]);
    expect(row?.v).toBe(payload);
    const zones = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM zone");
    expect(zones?.n).toBeGreaterThan(0);
  });

  it("rolls a transaction back on error and commits on success", async () => {
    await expect(
      withTransaction(async (c) => {
        await c.query("CREATE TABLE zf_tx_probe (id int primary key)");
        await c.query("INSERT INTO zf_tx_probe VALUES (1)");
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");
    expect((await queryOne<{ t: string | null }>("SELECT to_regclass('public.zf_tx_probe')::text AS t"))?.t).toBeNull();

    await withTransaction(async (c) => {
      await c.query("CREATE TABLE zf_tx_probe (id int primary key)");
      await c.query("INSERT INTO zf_tx_probe VALUES (1)");
    });
    expect((await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM zf_tx_probe"))?.n).toBe(1);
    await query("DROP TABLE zf_tx_probe");
  });

  it("returns real, non-empty dataset counts from the seeded schema", async () => {
    const c = await getDatasetCounts();
    for (const [name, value] of Object.entries(c)) expect(value, name).toBeGreaterThan(0);
  });
});

describe("MongoDB layer", () => {
  it("connects and reports the five Part 1 collections", async () => {
    const h = await checkMongo();
    expect(h.status).toBe("up");
    expect(h.version).toMatch(/^7\./);
    expect(h.collections?.map((c) => c.name)).toEqual(
      expect.arrayContaining(["waste_submissions", "inspection_reports", "bin_readings", "establishment_meta", "activity_stream"]),
    );
  });

  it("can read seeded documents through the driver", async () => {
    const db = await getMongoDb();
    const doc = await db.collection("waste_submissions").findOne({});
    expect(doc).not.toBeNull();
  });
});

describe("health API routes", () => {
  const ctx = {};
  it("GET /api/health returns 200 and a healthy envelope with a request id", async () => {
    const res = await healthAll(new Request("http://t/api/health"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("healthy");
  });
  it("GET /api/health/postgres and /mongo return 200", async () => {
    expect((await healthPg(new Request("http://t/api/health/postgres"), ctx)).status).toBe(200);
    expect((await healthMongo(new Request("http://t/api/health/mongo"), ctx)).status).toBe(200);
  });
  it("never leaks credentials in any health response", async () => {
    const text = JSON.stringify(await checkSystem());
    for (const secret of [process.env.POSTGRES_PASSWORD, process.env.MONGO_INITDB_ROOT_PASSWORD]) {
      expect(text).not.toContain(secret as string);
    }
  });
});
