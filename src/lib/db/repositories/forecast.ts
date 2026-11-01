import "server-only";
import { query, queryOne } from "@/lib/db/postgres";

export const MODEL_LABEL = { seasonal_naive: "Seasonal naive", ridge: "Ridge regression", lightgbm: "LightGBM" } as const;
export type ModelKey = keyof typeof MODEL_LABEL;
export const MODEL_KEYS = Object.keys(MODEL_LABEL) as ModelKey[];

export interface ModelMetrics {
  mae_estab_day: number; rmse_estab_day: number; mae_zone_day: number; rmse_zone_day: number; wape_zone_pct: number;
  days_better_than_baseline: number; test_days: number;
}

export interface ForecastRun {
  runId: number;
  createdAt: string;
  target: string;
  historyFrom: string; historyTo: string;
  trainFrom: string; trainTo: string; valFrom: string; valTo: string; testFrom: string; testTo: string;
  nSeries: number; nTrain: number; nVal: number; nTest: number;
  features: string[];
  bestModel: ModelKey;
  metrics: Record<ModelKey, ModelMetrics>;
  params: { ridge: { alpha: number }; lightgbm: { num_leaves: number; n_estimators: number } };
  versions: Record<string, string>;
  notes: string | null;
  targetDate: string | null;
}

export interface EvalPoint { date: string; actual: number } // + one numeric column per model
export type EvalSeries = (EvalPoint & Record<ModelKey, number>)[];

const D = (c: string) => `to_char(${c}, 'YYYY-MM-DD')`;

/** The most recent stored run, or null when `python scripts/forecast.py` has never been run on this database. */
export async function latestRun(): Promise<ForecastRun | null> {
  const r = await queryOne<Record<string, unknown>>(
    `SELECT r.run_id, r.created_at::text AS created_at, r.target, ${D("history_from")} AS history_from, ${D("history_to")} AS history_to,
            ${D("train_from")} AS train_from, ${D("train_to")} AS train_to, ${D("val_from")} AS val_from, ${D("val_to")} AS val_to,
            ${D("test_from")} AS test_from, ${D("test_to")} AS test_to, n_series, n_train, n_val, n_test, features, best_model, metrics, params,
            library_versions, notes,
            (SELECT ${D("max(target_date)")} FROM forecast_prediction p WHERE p.run_id = r.run_id) AS target_date
       FROM forecast_run r ORDER BY run_id DESC LIMIT 1`,
  );
  if (!r) return null;
  return {
    runId: r.run_id as number, createdAt: r.created_at as string, target: r.target as string,
    historyFrom: r.history_from as string, historyTo: r.history_to as string, trainFrom: r.train_from as string, trainTo: r.train_to as string,
    valFrom: r.val_from as string, valTo: r.val_to as string, testFrom: r.test_from as string, testTo: r.test_to as string,
    nSeries: r.n_series as number, nTrain: r.n_train as number, nVal: r.n_val as number, nTest: r.n_test as number,
    features: r.features as string[], bestModel: r.best_model as ModelKey, metrics: r.metrics as ForecastRun["metrics"],
    params: r.params as ForecastRun["params"], versions: r.library_versions as Record<string, string>, notes: r.notes as string | null, targetDate: r.target_date as string | null,
  };
}

/** Actual vs predicted zone totals for every held-out test day (the chart's data). */
export async function evalSeries(runId: number): Promise<EvalSeries> {
  const rows = await query<{ d: string; model: ModelKey; actual: string; predicted: string }>(
    `SELECT ${D("eval_date")} AS d, model, actual_kg AS actual, predicted_kg AS predicted FROM forecast_eval_daily WHERE run_id = $1 ORDER BY eval_date`, [runId]);
  const by = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    const row = by.get(r.d) ?? { date: r.d, actual: Number(r.actual) };
    row[r.model] = Number(r.predicted);
    by.set(r.d, row);
  }
  return [...by.values()] as unknown as EvalSeries;
}

export async function importance(runId: number, model: ModelKey, limit = 8) {
  const rows = await query<{ feature: string; v: string }>(
    `SELECT feature, importance AS v FROM forecast_importance WHERE run_id = $1 AND model = $2 ORDER BY importance DESC LIMIT $3`, [runId, model, limit]);
  return rows.map((r) => ({ feature: r.feature, share: Number(r.v) }));
}

/** Next-day totals per model and (for the zone view) the establishments expected to waste the most. */
export async function nextDay(runId: number, establishmentId: number | null, bestModel: ModelKey) {
  const totals = await query<{ model: ModelKey; kg: string }>(
    `SELECT model, SUM(predicted_kg) AS kg FROM forecast_prediction WHERE run_id = $1 AND ($2::int IS NULL OR establishment_id = $2) GROUP BY model`, [runId, establishmentId]);
  const top = await query<{ id: number; name: string; kind: string; kg: string; naive: string; ridge: string; lightgbm: string }>(
    `SELECT e.establishment_id AS id, e.name, ec.kind::text AS kind,
            MAX(CASE WHEN p.model = $2 THEN p.predicted_kg END) AS kg,
            MAX(CASE WHEN p.model = 'seasonal_naive' THEN p.predicted_kg END) AS naive,
            MAX(CASE WHEN p.model = 'ridge' THEN p.predicted_kg END) AS ridge,
            MAX(CASE WHEN p.model = 'lightgbm' THEN p.predicted_kg END) AS lightgbm
       FROM forecast_prediction p JOIN establishment e ON e.establishment_id = p.establishment_id JOIN establishment_category ec ON ec.category_id = e.category_id
      WHERE p.run_id = $1 AND ($3::int IS NULL OR p.establishment_id = $3)
      GROUP BY e.establishment_id, e.name, ec.kind ORDER BY kg DESC NULLS LAST LIMIT 10`, [runId, bestModel, establishmentId]);
  return {
    totals: Object.fromEntries(totals.map((t) => [t.model, Number(t.kg)])) as Partial<Record<ModelKey, number>>,
    top: top.map((t) => ({ id: t.id, name: t.name, kind: t.kind, best: Number(t.kg), seasonal_naive: Number(t.naive), ridge: Number(t.ridge), lightgbm: Number(t.lightgbm) })),
  };
}

/** The establishment's own recent daily waste, for context next to its forecast. */
export async function recentActual(establishmentId: number, days = 14) {
  const rows = await query<{ d: string; kg: string }>(
    `SELECT ${D("w.occurred_on")} AS d, SUM(w.quantity_kg) AS kg FROM waste_event w JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
      WHERE w.establishment_id = $1 AND w.occurred_on > (SELECT max(history_to) FROM forecast_run) - $2::int GROUP BY w.occurred_on ORDER BY w.occurred_on`, [establishmentId, days]);
  return rows.map((r) => ({ date: r.d, kg: Number(r.kg) }));
}
