import { CalendarRange, Cpu, Info, LineChart, Target, TrendingDown, Trophy } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Stagger } from "@/components/motion/motion";
import { RankedBars } from "@/components/charts/ranked-bars";
import { ActualVsPredicted, ErrorBars } from "@/components/charts/forecast-charts";
import { TBody, Td, THead, Th, Tr } from "@/components/ui/table";
import { requirePageUser } from "@/lib/auth/guard";
import { isEstablishmentRole } from "@/lib/auth/permissions";
import { MODEL_KEYS, MODEL_LABEL, evalSeries, importance, latestRun, nextDay, recentActual } from "@/lib/db/repositories/forecast";
import { fmtDate, fmtDateTime, fmtNum, humanize } from "@/lib/format";

export const metadata = { title: "Forecast" };

const FEATURE_LABEL: Record<string, string> = {
  lag_1: "Yesterday", lag_2: "2 days ago", lag_3: "3 days ago", lag_7: "Same weekday last week", lag_14: "Same weekday 2 weeks ago",
  roll_mean_7: "7-day average", roll_std_7: "7-day variability", roll_mean_28: "28-day average", momentum: "Recent vs 28-day trend",
  same_dow_mean_4w: "Same-weekday average (4 weeks)", is_weekend: "Weekend", day_of_month: "Day of month", event_impact: "Event impact (schedule)",
  log_capacity: "Establishment size", ev_exam_period: "Exam period", ev_festival: "Festival", ev_vacation: "Vacation", ev_public_holiday: "Public holiday", ev_local_event: "Local event",
};
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const label = (f: string): string => FEATURE_LABEL[f] ?? (f.startsWith("dow_") ? `${DAYS[Number(f.slice(4))] ?? f}` : f.startsWith("kind_") ? `Kind: ${humanize(f.slice(5))}` : f);

export default async function ForecastPage() {
  const user = await requirePageUser("forecast:view");
  const own = isEstablishmentRole(user.role);
  const run = await latestRun();

  if (!run) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Overview" title="Forecast" description="Next-day waste forecasts learned from this system's own history." />
        <EmptyState icon={LineChart} title="No forecast has been trained yet">
          Training is an offline step that reads the waste history, compares three models on a held-out period and stores the result. Run <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">python scripts/forecast.py</code> and refresh this page.
        </EmptyState>
      </div>
    );
  }

  const estId = own ? (user.establishmentId as number) : null;
  const [series, next, impRidge, impGbm, recent] = await Promise.all([
    own ? Promise.resolve([]) : evalSeries(run.runId),
    nextDay(run.runId, estId, run.bestModel),
    importance(run.runId, "ridge"),
    importance(run.runId, "lightgbm"),
    own ? recentActual(estId as number) : Promise.resolve([]),
  ]);
  const m = run.metrics;
  const base = m.seasonal_naive;
  const best = m[run.bestModel];
  const gain = base.mae_zone_day > 0 ? (1 - best.mae_zone_day / base.mae_zone_day) * 100 : 0;
  const tomorrow = next.totals[run.bestModel] ?? 0;
  const recentAvg = recent.length ? recent.reduce((s, r) => s + r.kg, 0) / recent.length : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title="Waste forecast"
        description={`Next-day waste per establishment, learned from ${fmtNum(run.nSeries)} establishments' real recorded history (${fmtDate(run.historyFrom)} - ${fmtDate(run.historyTo)}). Three models, one chronological test.`}
        actions={<Badge tone="info">Synthetic data</Badge>}
      />

      <Stagger as="section" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard featured label="Best model (zone RMSE)" icon={Trophy} value={MODEL_LABEL[run.bestModel]} hint={`${best.rmse_zone_day.toFixed(0)} kg/day typical error`} />
        <KpiCard label="Error vs seasonal naive" icon={TrendingDown} value={gain.toFixed(0)} unit="% lower MAE" count={{ value: Math.abs(gain) }} hint={`${best.mae_zone_day.toFixed(0)} vs ${base.mae_zone_day.toFixed(0)} kg/day, zone total`} goodWhen="up" delta={gain} />
        {own ? (
          <>
            <KpiCard label="Your expected waste tomorrow" icon={Target} value={fmtNum(tomorrow, 1)} unit="kg" count={{ value: tomorrow, decimals: 1 }} hint={`${MODEL_LABEL[run.bestModel]}, for ${run.targetDate ? fmtDate(run.targetDate) : "the next day"}`} />
            <KpiCard label="Your last 14-day average" icon={CalendarRange} value={recentAvg === null ? "-" : fmtNum(recentAvg, 1)} unit="kg/day" hint="actual recorded waste" />
          </>
        ) : (
          <>
            <KpiCard label="Expected zone waste next day" icon={Target} value={fmtNum(tomorrow, 0)} unit="kg" count={{ value: tomorrow }} hint={`${MODEL_LABEL[run.bestModel]}, for ${run.targetDate ? fmtDate(run.targetDate) : "the next day"}`} />
            <KpiCard label="Held-out test window" icon={CalendarRange} value={String(best.test_days)} unit="days" hint={`${fmtDate(run.testFrom)} - ${fmtDate(run.testTo)}`} />
          </>
        )}
      </Stagger>

      {!own && (
        <Card>
          <CardHeader title="Actual versus predicted" description="Zone waste per day on the held-out test window - the models never saw these days when they were trained or tuned." />
          <CardBody><ActualVsPredicted data={series as never} /></CardBody>
        </Card>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Model comparison" description="Same test rows for every model. Lower is better." />
          <CardBody>
            <ErrorBars rows={MODEL_KEYS.map((k) => ({ model: MODEL_LABEL[k], mae: m[k].mae_zone_day, rmse: m[k].rmse_zone_day }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Scores" description="Establishment-day errors are per kitchen per day; zone-day errors are for the zone total." />
          <div className="overflow-x-auto"><table className="w-full min-w-[30rem] border-collapse text-left text-sm">
            <THead><Th>Model</Th><Th align="right">MAE est.</Th><Th align="right">RMSE est.</Th><Th align="right">MAE zone</Th><Th align="right">RMSE zone</Th></THead>
            <TBody>
              {MODEL_KEYS.map((k) => (
                <Tr key={k}>
                  <Td><span className="font-medium text-ink">{MODEL_LABEL[k]}</span>{k === run.bestModel && <Badge tone="ok" className="ml-2">best</Badge>}{k === "seasonal_naive" && <span className="ml-2 text-xs text-ink-muted">baseline</span>}</Td>
                  <Td align="right" className="tabular">{m[k].mae_estab_day.toFixed(2)}</Td>
                  <Td align="right" className="tabular">{m[k].rmse_estab_day.toFixed(2)}</Td>
                  <Td align="right" className="tabular">{m[k].mae_zone_day.toFixed(0)}</Td>
                  <Td align="right" className="tabular">{m[k].rmse_zone_day.toFixed(0)}</Td>
                </Tr>
              ))}
            </TBody>
          </table></div>
          <p className="px-5 pb-4 text-xs text-ink-muted">
            Units: kg. Zone WAPE (total absolute error / total waste): naive {m.seasonal_naive.wape_zone_pct.toFixed(1)}%, Ridge {m.ridge.wape_zone_pct.toFixed(1)}%, LightGBM {m.lightgbm.wape_zone_pct.toFixed(1)}%. Beat the baseline on an individual zone-day: Ridge {m.ridge.days_better_than_baseline} of {m.ridge.test_days} days, LightGBM {m.lightgbm.days_better_than_baseline} of {m.lightgbm.test_days} days.
            {m.lightgbm.rmse_estab_day < m.ridge.rmse_estab_day && m.ridge.rmse_zone_day < m.lightgbm.rmse_zone_day ? " The models rank differently at kitchen level and zone level: LightGBM is better per kitchen, Ridge on the zone total." : ""}
          </p>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={own ? "Your forecast for the next day" : "Largest expected waste next day"} description={`${run.targetDate ? fmtDate(run.targetDate) : ""} - kilograms per kitchen, ${own ? "all three models" : `top 10 by ${MODEL_LABEL[run.bestModel]}`}`} />
          <div className="overflow-x-auto"><table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <THead><Th>Establishment</Th><Th align="right">Best model</Th><Th align="right">Naive</Th><Th align="right">Ridge</Th><Th align="right">LightGBM</Th></THead>
            <TBody>
              {next.top.map((t) => (
                <Tr key={t.id}><Td><span className="font-medium text-ink">{t.name}</span><span className="block text-xs text-ink-muted">{humanize(t.kind)}</span></Td>
                  <Td align="right" className="tabular font-semibold">{t.best.toFixed(1)}</Td><Td align="right" className="tabular">{t.seasonal_naive.toFixed(1)}</Td><Td align="right" className="tabular">{t.ridge.toFixed(1)}</Td><Td align="right" className="tabular">{t.lightgbm.toFixed(1)}</Td></Tr>
              ))}
            </TBody>
          </table></div>
        </Card>
        <Card>
          <CardHeader title="What the models use" description="Share of each model's decision weight (Ridge: standardised coefficient; LightGBM: split gain)" />
          <CardBody>
            <div className="grid gap-6 sm:grid-cols-2">
              <div><p className="mb-3 text-sm font-medium text-ink">LightGBM</p><RankedBars unit="%" rows={impGbm.map((f) => ({ name: label(f.feature), value: Math.round(f.share * 10) / 10 }))} /></div>
              <div><p className="mb-3 text-sm font-medium text-ink">Ridge</p><RankedBars unit="%" rows={impRidge.map((f) => ({ name: label(f.feature), value: Math.round(f.share * 10) / 10 }))} /></div>
            </div>
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader title="How this was built, and how far to trust it" action={<Info aria-hidden className="size-5 text-ink-muted" />} />
        <CardBody className="grid gap-6 text-sm leading-relaxed text-ink-muted lg:grid-cols-2">
          <div className="space-y-2">
            <p className="font-medium text-ink">Method</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Target: kilograms wasted per establishment per day (redistributed food excluded), one day ahead.</li>
              <li>Features known the evening before: lags (1, 2, 3, 7, 14 days), 7- and 28-day rolling statistics, weekday, scheduled events, establishment size and kind.</li>
              <li><b className="text-ink">Chronological split</b>: train {fmtDate(run.trainFrom)} - {fmtDate(run.trainTo)} ({fmtNum(run.nTrain)} rows), validation {fmtDate(run.valFrom)} - {fmtDate(run.valTo)} ({fmtNum(run.nVal)}), test {fmtDate(run.testFrom)} - {fmtDate(run.testTo)} ({fmtNum(run.nTest)}). Settings were chosen on validation only; the test window was scored once.</li>
              <li><b className="text-ink">No leakage</b>: every history feature is shifted by at least one day; automated tests change future values and check that no earlier feature moves.</li>
              <li>The next-day forecast above uses models refitted on all history, with the settings chosen earlier.</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-ink">Limitations</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>{run.notes}</li>
              <li>Only {run.nTest > 0 ? best.test_days : 0} test days from about {Math.round((new Date(run.historyTo).getTime() - new Date(run.historyFrom).getTime()) / 86400000) + 1} days of history: no seasonal (yearly) pattern can be learned.</li>
              <li>Forecasts are for planning (how much food to expect to discard), not for automatic decisions.</li>
            </ul>
            <p className="pt-2 text-xs"><Cpu aria-hidden className="mr-1 inline size-3.5" />Run #{run.runId}, trained {fmtDateTime(run.createdAt)} · Ridge α={run.params.ridge.alpha} · LightGBM {run.params.lightgbm.num_leaves} leaves, {run.params.lightgbm.n_estimators} trees · {Object.entries(run.versions).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
            <p className="text-xs">Retrain after new data arrives: <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">python scripts/forecast.py</code> (features: {run.features.length}).</p>
          </div>
        </CardBody>
      </Card>
      <p className="text-xs text-ink-muted">All values are read from the forecast tables written by the training script; nothing on this page is computed in the browser.</p>
    </div>
  );
}
