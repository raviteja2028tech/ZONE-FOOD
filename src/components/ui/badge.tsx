import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

const toneClass: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-2 text-ink-muted",
};

const toneIcon = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Info, neutral: Info } as const;

/** Status chip. Colour is never the only signal: every tone carries an icon and a text label. */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const Icon = toneIcon[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none",
        toneClass[tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  );
}
