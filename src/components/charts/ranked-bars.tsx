/** Ranked horizontal bars in plain HTML/CSS (no JS needed): a single series, so one colour and no legend. */
export function RankedBars({ rows, unit = "kg" }: { rows: { name: string; value: number; sub?: string }[]; unit?: string }) {
  if (!rows.length) return <p className="py-10 text-center text-sm text-ink-muted">Nothing to rank yet.</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="space-y-3" aria-label="Ranked list">
      {rows.map((r, i) => (
        <li key={r.name} title={`${r.name}: ${r.value.toLocaleString("en-IN")} ${unit}${r.sub ? ` (${r.sub})` : ""}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink"><span className="tabular mr-2 text-xs text-ink-muted">{i + 1}</span>{r.name}</span>
            <span className="tabular shrink-0 font-medium text-ink">{r.value.toLocaleString("en-IN")} {unit}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-series-1 transition-[width] duration-700" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.sub && <p className="mt-0.5 text-xs text-ink-muted">{r.sub}</p>}
        </li>
      ))}
    </ol>
  );
}
