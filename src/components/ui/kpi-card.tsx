import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Card } from "./card";
import { CountUp } from "./count-up";
import { Sparkline } from "./sparkline";
import { cn } from "@/lib/cn";
import { Spotlight, StaggerItem } from "@/components/motion/motion";

/**
 * Headline figure with an optional period-over-period delta. `goodWhen` says which direction is good for THIS
 * metric (less waste is good, more redistribution is good), and the delta is always shown with an arrow + sign,
 * not colour alone.
 */
export function KpiCard({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  delta,
  goodWhen,
  featured,
  count,
  spark,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon: LucideIcon;
  delta?: number | null;
  goodWhen?: "down" | "up";
  featured?: boolean;
  /** When set, the figure animates up to this number (the `value` string is still what is rendered server-side). */
  count?: { value: number; decimals?: number; prefix?: string };
  /** Recent values drawn as a sparkline in the corner of the card. */
  spark?: number[];
}) {
  const hasDelta = delta !== undefined && delta !== null;
  const good = hasDelta && goodWhen ? (goodWhen === "down" ? delta < 0 : delta > 0) : null;
  const DeltaIcon = !hasDelta || Math.abs(delta) < 0.5 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <StaggerItem className="min-w-0">
    <Spotlight className="h-full">
    <Card className={cn("glass relative h-full overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop", featured && "bg-gradient-to-br from-accent-soft to-surface")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-ink"><Icon aria-hidden className="size-[18px]" /></span>
      </div>
      <p className="tabular mt-3 flex items-baseline gap-1.5 text-[34px] font-semibold leading-none tracking-tight text-ink">
        {count ? <CountUp value={count.value} decimals={count.decimals ?? 0} prefix={count.prefix ?? ""} /> : value}
        {unit && <span className="text-base font-medium text-ink-muted">{unit}</span>}
      </p>
      <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-2 text-xs">
        {hasDelta && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold", good === null ? "bg-surface-2 text-ink-muted" : good ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}>
            <DeltaIcon aria-hidden className="size-3.5" />
            {delta > 0 ? "+" : ""}{delta.toFixed(0)}%
          </span>
        )}
        {hint && <span className="text-ink-muted">{hint}</span>}
        {spark && <Sparkline values={spark} className="ml-auto h-7 w-24" />}
      </div>
    </Card>
    </Spotlight>
    </StaggerItem>
  );
}
