"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import type { TrendPoint } from "@/lib/db/repositories/analytics";
import { cn } from "@/lib/cn";

/** Fixed slot order = fixed meaning: the same stage always gets the same colour (validated categorical palette). */
const STAGES = [
  { key: "PRE_CONSUMER_PREP", label: "Preparation trimmings", color: "var(--series-1)" },
  { key: "PRE_CONSUMER_SPOILAGE", label: "Spoilage", color: "var(--series-2)" },
  { key: "PRE_CONSUMER_EXPIRY", label: "Expired stock", color: "var(--series-3)" },
  { key: "POST_CONSUMER_PLATE", label: "Plate leftovers", color: "var(--series-4)" },
  { key: "POST_CONSUMER_SERVICE", label: "Service leftovers", color: "var(--series-5)" },
] as const;

const fmtWeek = (w: string) => new Date(w + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const total = (p: TrendPoint) => STAGES.reduce((s, st) => s + (p[st.key] as number), 0);

interface TipProps {
  active?: boolean;
  label?: string;
  payload?: { dataKey: string; value: number }[];
}

function Tip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const sum = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="min-w-48 rounded-md border border-line bg-surface px-3 py-2.5 text-xs shadow-pop">
      <p className="mb-1.5 font-semibold text-ink">Week of {fmtWeek(label as string)}</p>
      {[...payload].reverse().map((p) => {
        const st = STAGES.find((s) => s.key === p.dataKey)!;
        return (
          <p key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-2 text-ink-muted"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: st.color }} />{st.label}</span>
            <span className="tabular font-medium text-ink">{p.value.toFixed(1)} kg</span>
          </p>
        );
      })}
      <p className="mt-1.5 flex justify-between border-t border-line pt-1.5 font-semibold text-ink"><span>Total</span><span className="tabular">{sum.toFixed(1)} kg</span></p>
    </div>
  );
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setHidden((h) => { const next = new Set(h); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  if (!data.length) return <p className="py-16 text-center text-sm text-ink-muted">No waste has been recorded in this period yet.</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
          {STAGES.map((s) => (
            <li key={s.key}>
              <button type="button" onClick={() => toggle(s.key)} aria-pressed={!hidden.has(s.key)} title="Click to show or hide this stage"
                className={cn("flex items-center gap-2 rounded px-1 py-0.5 text-xs transition-opacity hover:text-ink", hidden.has(s.key) ? "text-ink-muted line-through opacity-50" : "text-ink-muted")}>
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
              </button>
            </li>
          ))}
        </ul>
        <div role="group" aria-label="View" className="inline-flex rounded-md border border-line p-0.5">
          {([["chart", BarChart3, "Chart"], ["table", Table2, "Table"]] as const).map(([v, Icon, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium", view === v ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink")}>
              <Icon aria-hidden className="size-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      {view === "chart" ? (
        <div className="h-80 w-full" role="img" aria-label="Stacked area chart of weekly food waste in kilograms by stage">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
              <YAxis tick={{ fill: "var(--ink-muted)", fontSize: 12 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
              <Tooltip content={<Tip />} cursor={{ stroke: "var(--ink-muted)", strokeDasharray: "3 3" }} />
              {STAGES.map((s) => (
                <Area key={s.key} hide={hidden.has(s.key)} type="monotone" dataKey={s.key} stackId="1" stroke={s.color} strokeWidth={2} fill={s.color} fillOpacity={0.78} isAnimationActive animationDuration={700} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-72 overflow-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">Weekly waste in kilograms by stage</caption>
            <thead className="sticky top-0 bg-surface-2 text-xs uppercase text-ink-muted"><tr><th scope="col" className="px-3 py-2 text-left">Week of</th>{STAGES.map((s) => <th key={s.key} scope="col" className="px-3 py-2 text-right">{s.label}</th>)}<th scope="col" className="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data.map((p) => (
                <tr key={p.week}><th scope="row" className="px-3 py-2 text-left font-medium">{fmtWeek(p.week)}</th>{STAGES.map((s) => <td key={s.key} className="tabular px-3 py-2 text-right">{(p[s.key] as number).toFixed(1)}</td>)}<td className="tabular px-3 py-2 text-right font-semibold">{total(p).toFixed(1)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
