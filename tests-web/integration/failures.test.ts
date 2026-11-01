import { afterEach, describe, expect, it, vi } from "vitest";
import "./setup-env";

/** Each test boots fresh modules with a deliberately broken environment. */
const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.resetModules();
});

describe("failure handling", () => {
  it("reports a clear setup error when required variables are missing (HTTP 503, names only)", async () => {
    delete process.env.POSTGRES_PASSWORD;
    delete process.env.MONGO_INITDB_ROOT_PASSWORD;
    vi.resetModules();
    const { GET } = await import("@/app/api/health/postgres/route");
    const res = await GET(new Request("http://t/api/health/postgres"), {});
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("CONFIG_ERROR");
    expect(body.error.message).toContain("POSTGRES_PASSWORD");
    expect(body.error.message).toContain(".env.example");
  });

  it("reports PostgreSQL as down (not a crash) when it is unreachable", async () => {
    process.env.POSTGRES_PORT = "1";
    vi.resetModules();
    const { checkPostgres } = await import("@/lib/db/health");
    const h = await checkPostgres();
    expect(h.status).toBe("down");
    expect(h.error).toMatch(/refused|docker|connect/i);
    const { closePool } = await import("@/lib/db/postgres");
    await closePool();
  });

  it("reports MongoDB as down when it is unreachable", async () => {
    process.env.MONGO_PORT = "1";
    vi.resetModules();
    const { checkMongo } = await import("@/lib/db/health");
    const h = await checkMongo();
    expect(h.status).toBe("down");
    expect(h.error).toBeTruthy();
    const { closeMongo } = await import("@/lib/db/mongo");
    await closeMongo().catch(() => undefined);
  }, 20000);

  it("overall status is 'degraded' with 503 when one database is down", async () => {
    process.env.MONGO_PORT = "1";
    vi.resetModules();
    const { GET } = await import("@/app/api/health/route");
    const res = await GET(new Request("http://t/api/health"), {});
    expect(res.status).toBe(503);
    expect((await res.json()).data.status).toBe("degraded");
    const { closePool } = await import("@/lib/db/postgres");
    await closePool();
  }, 20000);
});
