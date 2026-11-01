import type { LucideIcon } from "lucide-react";
import { Card } from "./card";

/** KPI tile: label, large tabular figure and a one-line explanation of where the figure comes from. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="group relative overflow-hidden p-5 transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <span className="grid size-9 place-items-center rounded-md bg-accent-soft text-accent-ink">
          <Icon aria-hidden className="size-[18px]" />
        </span>
      </div>
      <p className="tabular mt-3 text-4xl font-semibold tracking-tight text-ink">
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </p>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="p-5" aria-hidden>
      <div className="flex items-center justify-between">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton size-9 rounded-md" />
      </div>
      <div className="skeleton mt-4 h-9 w-28 rounded" />
      <div className="skeleton mt-3 h-3 w-36 rounded" />
    </Card>
  );
}
