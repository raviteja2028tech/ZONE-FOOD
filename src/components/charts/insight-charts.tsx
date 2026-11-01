"use client";

import { useState, type ReactNode } from "react";
import { Bar, BarChart, Brush, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import { cn } from "@/lib/cn";

const axis = { fill: "var(--ink-muted)", fontSize: 12 } as const;
const shortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

/** Chart / data-table switch: every chart has a table alternative (accessibility + "show me the numbers"). */
export function ChartOrTable({ chart, columns, rows, caption }: { chart: ReactNode; columns: string[]; rows: (string | number)[][]; caption: string }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <div>
      <div role="group" aria-label="View" className="mb-3 inline-flex rounded-md border border-line p-0.5">
        {([["chart", BarChart3, "Chart"], ["table", Table2, "Data"]] as const).map(([v, Icon, label]) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
            className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium", view === v ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink")}>
            <Icon aria-hidden className="size-3.5" />{label}
          </button>
        ))}
      </div>
      {view === "chart" ? chart : (
        <div className="max-h-72 overflow-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 bg-surface-2 text-xs uppercase text-ink-muted"><tr>{columns.map((c) => <th key={c} scope="col" className="px-3 py-2 text-left">{c}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="tabular px-3 py-1.5">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface TrendPt { day: string; kg: number; rolling: number }
interface Anomaly { day: string; kg: number; expectedKg: number; z: number; name: string }

function TrendTip({ active, payload, label }: { active?: boolean; label?: string; payload?: { payload: TrendPt & { anomaly?: number | null; note?: string } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  return (
    <div className="min-w-48 rounded-md border border-line bg-surface px-3 py-2.5 text-xs shadow-pop">
      <p className="mb-1.5 font-semibold text-ink">{shortDate(label as string)}</p>
      <p className="flex justify-between gap-4"><span className="text-ink-muted">Daily waste</span><span className="tabular font-medium">{p.kg.toFixed(1)} kg</span></p>
      <p className="flex justify-between gap-4"><span className="text-ink-muted">7-day average</span><span className="tabular font-medium">{p.rolling.toFixed(1)} kg</span></p>
      {p.note && <p className="mt-1.5 border-t border-line pt-1.5 font-medium text-bad">{p.note}</p>}
    </div>
  );
}

/** Daily bars + rolling 7-day line + anomaly markers, with a zoom brush underneath. */
export function TrendWithAnomalies({ data, anomalies }: { data: TrendPt[]; anomalies: Anomaly[] }) {
  if (!data.length) return <p className="py-14 text-center text-sm text-ink-muted">No waste recorded in this window.</p>;
  const byDay = new Map(anomalies.map((a) => [a.day, a]));
  const rows = data.map((d) => {
    const a = byDay.get(d.day);
    return { ...d, anomaly: a ? d.kg : null, note: a ? `Anomaly: ${a.z.toFixed(1)}σ above its 4-week norm (${a.expectedKg} kg)` : undefined };
  });
  return (
    <ChartOrTable
      caption="Daily waste with rolling seven-day average"
      columns={["Day", "Daily kg", "7-day avg kg", "Anomaly"]}
      rows={rows.map((r) => [shortDate(r.day), r.kg, r.rolling, r.note ? "yes" : ""])}
      chart={
        <>
          <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
            <li className="flex items-center gap-2 text-xs text-ink-muted"><span aria-hidden className="size-2.5 rounded-sm bg-series-1" />Daily waste</li>
            <li className="flex items-center gap-2 text-xs text-ink-muted"><span aria-hidden className="h-0.5 w-4 rounded bg-series-2" />7-day average</li>
            <li className="flex items-center gap-2 text-xs text-ink-muted"><span aria-hidden className="size-2.5 rounded-full bg-bad" />Anomalous day</li>
          </ul>
          <div className="h-80 w-full" role="img" aria-label="Daily waste in kilograms with a rolling seven-day average and anomalous days marked">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="day" tickFormatter={shortDate} tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={28} />
                <YAxis tick={axis} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<TrendTip />} cursor={{ fill: "var(--surface-2)" }} />
                <Bar dataKey="kg" fill="var(--series-1)" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={14} />
                <Line type="monotone" dataKey="rolling" stroke="var(--series-2)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="anomaly" stroke="none" dot={{ r: 5, fill: "var(--bad)", stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} connectNulls={false} />
                <Brush dataKey="day" height={22} travellerWidth={8} stroke="var(--line-strong)" fill="var(--surface-2)" tickFormatter={shortDate} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      }
    />
  );
}

export function WeekdayBars({ data }: { data: { label: string; avgKg: number }[] }) {
  const max = Math.max(...data.map((d) => d.avgKg));
  return (
    <ChartOrTable
      caption="Average waste by weekday"
      columns={["Weekday", "Avg kg per day"]}
      rows={data.map((d) => [d.label, d.avgKg])}
      chart={
        <div className="h-60 w-full" role="img" aria-label="Average waste per day for each weekday">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(v) => [`${Number(v).toLocaleString("en-IN")} kg`, "Average per day"]} cursor={{ fill: "var(--surface-2)" }}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} />
              {max > 0 && <ReferenceLine y={data.reduce((s, d) => s + d.avgKg, 0) / data.length} stroke="var(--ink-muted)" strokeDasharray="4 4" label={{ value: "avg", fill: "var(--ink-muted)", fontSize: 11, position: "right" }} />}
              <Bar dataKey="avgKg" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      }
    />
  );
}

export function PercentLine({ data, label, unit = "%", color = "var(--series-3)" }: { data: { x: string; y: number }[]; label: string; unit?: string; color?: string }) {
  if (data.length < 2) return <p className="py-10 text-center text-sm text-ink-muted">Not enough history yet.</p>;
  return (
    <ChartOrTable
      caption={label}
      columns={["Period", label]}
      rows={data.map((d) => [d.x, `${d.y}${unit}`])}
      chart={
        <div className="h-60 w-full" role="img" aria-label={label}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="x" tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={48} domain={[0, 100]} tickFormatter={(v) => `${v}${unit}`} />
              <Tooltip formatter={(v) => [`${v}${unit}`, label]} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="y" stroke={color} strokeWidth={3} dot={{ r: 4, fill: color, stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      }
    />
  );
}

/** Funnel as plain bars: each step's width is its share of the first step. */
export function FunnelBars({ steps }: { steps: { label: string; value: number; hint?: string }[] }) {
  const top = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <ol className="space-y-3" aria-label="Rescue funnel">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="mb-1 flex items-baseline justify-between text-sm"><span className="text-ink">{s.label}</span><span className="tabular font-medium text-ink">{s.value.toLocaleString("en-IN")} kg</span></div>
          <div className="h-7 overflow-hidden rounded-md bg-surface-2">
            <div className={cn("flex h-full items-center rounded-md px-2 text-xs font-semibold text-white transition-[width] duration-700", i === 0 ? "bg-series-1" : i === 1 ? "bg-series-2" : "bg-series-3")} style={{ width: `${Math.max((s.value / top) * 100, 2)}%` }}>
              {s.value > 0 && <span>{Math.round((s.value / top) * 100)}%</span>}
            </div>
          </div>
          {s.hint && <p className="mt-0.5 text-xs text-ink-muted">{s.hint}</p>}
        </li>
      ))}
    </ol>
  );
}

export function StackedShare({ parts }: { parts: { label: string; pct: number; color: string }[] }) {
  return (
    <div>
      <div className="flex h-5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={parts.map((p) => `${p.label} ${p.pct}%`).join(", ")}>
        {parts.filter((p) => p.pct > 0).map((p) => <div key={p.label} style={{ width: `${p.pct}%`, background: p.color }} title={`${p.label}: ${p.pct}%`} className="border-r-2 border-surface last:border-0" />)}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {parts.map((p) => <li key={p.label} className="flex items-center gap-2 text-xs text-ink-muted"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: p.color }} />{p.label} <span className="tabular font-semibold text-ink">{p.pct}%</span></li>)}
      </ul>
    </div>
  );
}
