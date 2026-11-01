"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import { cn } from "@/lib/cn";

/** Fixed slot per model so a colour always means the same model (and "actual" is the ink colour, never a series colour). */
const SERIES = [
  { key: "actual", label: "Actual", color: "var(--ink)", dash: undefined, width: 2.75 },
  { key: "seasonal_naive", label: "Seasonal naive", color: "var(--series-4)", dash: "5 4", width: 2 },
  { key: "ridge", label: "Ridge regression", color: "var(--series-1)", dash: undefined, width: 2 },
  { key: "lightgbm", label: "LightGBM", color: "var(--series-3)", dash: undefined, width: 2 },
] as const;

type Row = { date: string; actual: number; seasonal_naive: number; ridge: number; lightgbm: number };
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const wd = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" });

function Tip({ active, label, payload }: { active?: boolean; label?: string; payload?: { dataKey: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  const actual = payload.find((p) => p.dataKey === "actual")?.value;
  return (
    <div className="min-w-52 rounded-md border border-line bg-surface px-3 py-2.5 text-xs shadow-pop">
      <p className="mb-1.5 font-semibold text-ink">{wd(label as string)} {day(label as string)}</p>
      {SERIES.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p) return null;
        const err = s.key !== "actual" && actual ? ((p.value - actual) / actual) * 100 : null;
        return (
          <p key={s.key} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-2 text-ink-muted"><span aria-hidden className="h-0.5 w-3 rounded" style={{ background: s.color }} />{s.label}</span>
            <span className="tabular font-medium text-ink">{Math.round(p.value).toLocaleString("en-IN")} kg{err !== null && <span className="ml-1.5 text-ink-muted">{err > 0 ? "+" : ""}{err.toFixed(0)}%</span>}</span>
          </p>
        );
      })}
    </div>
  );
}

/** Held-out test window: real zone waste per day against each model's prediction for that day. */
export function ActualVsPredicted({ data }: { data: Row[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  if (!data.length) return <p className="py-16 text-center text-sm text-ink-muted">No evaluation data in this run.</p>;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend (click to show or hide)">
          {SERIES.map((s) => (
            <li key={s.key}>
              <button type="button" onClick={() => toggle(s.key)} aria-pressed={!hidden.has(s.key)}
                className={cn("flex items-center gap-2 rounded px-1 py-0.5 text-xs transition-opacity hover:text-ink", hidden.has(s.key) ? "text-ink-muted line-through opacity-50" : "text-ink-muted")}>
                <svg width="18" height="6" aria-hidden><line x1="0" x2="18" y1="3" y2="3" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="round" /></svg>{s.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="inline-flex rounded-md border border-line p-0.5 text-xs" role="group" aria-label="View">
          {([["chart", BarChart3, "Chart"], ["table", Table2, "Table"]] as const).map(([v, Icon, label]) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 font-medium", view === v ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink")}><Icon aria-hidden className="size-3.5" />{label}</button>
          ))}
        </div>
      </div>
      {view === "chart" ? (
        <div className="h-80 w-full" role="img" aria-label="Line chart of actual and predicted daily waste for the test window">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="date" tickFormatter={day} tick={{ fontSize: 11, fill: "var(--ink-muted)" }} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: "var(--ink-muted)" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
              <Tooltip content={<Tip />} cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }} />
              {SERIES.filter((s) => !hidden.has(s.key)).map((s, i) => (
                <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                  isAnimationActive animationDuration={900} animationBegin={i * 150} animationEasing="ease-out" />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-80 overflow-auto rounded-md border border-line">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-3 py-2">Date</th>{SERIES.map((s) => <th key={s.key} className="px-3 py-2 text-right">{s.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{data.map((r) => <tr key={r.date}><td className="px-3 py-1.5">{wd(r.date)} {day(r.date)}</td>{SERIES.map((s) => <td key={s.key} className="tabular px-3 py-1.5 text-right">{Math.round(r[s.key]).toLocaleString("en-IN")}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Grouped bars: zone-level error of each model (lower is better). */
export function ErrorBars({ rows }: { rows: { model: string; mae: number; rmse: number }[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Bar chart comparing mean absolute error and root mean square error per model, lower is better">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={4}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="model" tick={{ fontSize: 11, fill: "var(--ink-muted)" }} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
          <YAxis tick={{ fontSize: 11, fill: "var(--ink-muted)" }} tickLine={false} axisLine={false} width={44} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${Number(v).toFixed(0)} kg`]} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="mae" name="MAE (kg/day)" fill="var(--series-1)" radius={[4, 4, 0, 0]} animationDuration={900} />
          <Bar dataKey="rmse" name="RMSE (kg/day)" fill="var(--series-2)" radius={[4, 4, 0, 0]} animationDuration={900} animationBegin={150} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
