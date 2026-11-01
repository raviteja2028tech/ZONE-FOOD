import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, queryOne } from "@/lib/db/postgres";
import { closeMongo } from "@/lib/db/mongo";
import { GET as forecastGet } from "@/app/api/forecast/route";
import { call, sessionFor } from "./helpers";

type Session = Awaited<ReturnType<typeof sessionFor>>;
let admin: Session, auditor: Session, mgr: Session, recipient: Session;

beforeAll(async () => {
  admin = await sessionFor("ZONE_ADMIN");
  auditor = await sessionFor("AUDITOR");
  mgr = await sessionFor("ESTAB_MANAGER");
  recipient = await sessionFor("RECIPIENT_AGENT");
});
afterAll(async () => {
  await closePool();
  await closeMongo();
});

describe("forecast API and data", () => {
  it("requires a session and the forecast:view permission", async () => {
    expect((await call(forecastGet, { url: "/api/forecast" })).status).toBe(401);
    expect((await call(forecastGet, { url: "/api/forecast", cookie: recipient.cookie })).status).toBe(403);
  });

  it("zone roles receive the real run: three models, chronological windows, evaluation for every test day", async () => {
    const r = await call(forecastGet, { url: "/api/forecast", cookie: admin.cookie });
    expect(r.status).toBe(200);
    const { run, evaluation, nextDay } = r.body.data;
    expect(Object.keys(run.metrics).sort()).toEqual(["lightgbm", "ridge", "seasonal_naive"]);
    expect(run.trainTo < run.valFrom && run.valTo < run.testFrom).toBe(true);
    expect(evaluation.length).toBe(run.metrics.ridge.test_days);
    expect(evaluation[0].date >= run.testFrom && evaluation.at(-1).date <= run.testTo).toBe(true);
    expect(nextDay.top.length).toBeGreaterThan(1);
    const bestRmse = Math.min(...Object.values<any>(run.metrics).map((m) => m.rmse_zone_day));
    expect(run.metrics[run.bestModel].rmse_zone_day).toBe(bestRmse);
    expect((await call(forecastGet, { url: "/api/forecast", cookie: auditor.cookie })).status).toBe(200);
  });

  it("actual values in the evaluation series equal the real waste totals in the database", async () => {
    const r = await call(forecastGet, { url: "/api/forecast", cookie: admin.cookie });
    const point = r.body.data.evaluation[3];
    const real = await queryOne<{ kg: string }>(
      `SELECT SUM(w.quantity_kg) AS kg FROM waste_event w JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED' WHERE w.occurred_on = $1`, [point.date]);
    expect(Math.abs(Number(real!.kg) - point.actual)).toBeLessThan(0.05);
  });

  it("an establishment sees only its own forecast, never zone evaluation or other kitchens", async () => {
    const r = await call(forecastGet, { url: "/api/forecast", cookie: mgr.cookie });
    expect(r.status).toBe(200);
    expect(r.body.data.evaluation).toEqual([]);
    expect(r.body.data.nextDay.top.map((t: any) => t.id)).toEqual([mgr.establishmentId]);
  });
});
