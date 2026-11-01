import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "./card";

/** Used for empty and error states: says what happened and what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  tone = "neutral",
  page = false,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "bad";
  /** True when this is the whole page's content: renders the title as the page-level h1. */
  page?: boolean;
}) {
  const Heading = page ? "h1" : "h3";
  return (
    <Card className="grid place-items-center px-6 py-12 text-center" role={tone === "bad" ? "alert" : undefined}>
      <span className={`grid size-12 place-items-center rounded-full ${tone === "bad" ? "bg-bad-soft text-bad" : "bg-accent-soft text-accent-ink"}`}>
        <Icon aria-hidden className="size-6" />
      </span>
      <Heading className="mt-4 text-base font-semibold text-ink">{title}</Heading>
      {children && <div className="mt-1 max-w-md text-sm text-ink-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}
