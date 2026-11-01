"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ZonePoint {
  zone: string;
  wasteKg: number;
  redistributedKg: number;
  establishments: number;
  wastePerEstablishment: number;
}

const SERIES = [
  { key: "wasteKg", label: "Wasted", color: "var(--series-2)" },
  { key: "redistributedKg", label: "Redistributed", color: "var(--series-3)" },
] as const;

function Tip({ active, payload, label }: { active?: boolean; label?: string; payload?: { payload: ZonePoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  return (
    <div className="min-w-48 rounded-md border border-line bg-surface px-3 py-2.5 text-xs shadow-pop">
      <p className="mb-1.5 font-semibold text-ink">{label}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-ink-muted"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
          <span className="tabular font-medium text-ink">{p[s.key].toLocaleString("en-IN")} kg</span>
        </p>
      ))}
      <p className="mt-1.5 border-t border-line pt-1.5 text-ink-muted">{p.establishments} establishments · {p.wastePerEstablishment} kg waste each</p>
    </div>
  );
}

/** Grouped bars: waste vs redistributed per block for the period. */
export function ZoneChart({ data }: { data: ZonePoint[] }) {
  if (!data.length) return <p className="py-12 text-center text-sm text-ink-muted">No zone data yet.</p>;
  return (
    <div>
      <ul className="mb-3 flex gap-4" aria-label="Legend">
        {SERIES.map((s) => <li key={s.key} className="flex items-center gap-2 text-xs text-ink-muted"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</li>)}
      </ul>
      <div className="h-64 w-full" role="img" aria-label="Grouped bar chart of kilograms wasted and redistributed per block">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="zone" tick={{ fill: "var(--ink-muted)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
            <YAxis tick={{ fill: "var(--ink-muted)", fontSize: 12 }} tickLine={false} axisLine={false} width={52} />
            <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-2)" }} />
            {SERIES.map((s) => <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} stroke="var(--surface)" strokeWidth={2} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
