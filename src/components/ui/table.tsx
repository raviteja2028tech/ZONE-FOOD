import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "./card";
import { buttonClass } from "./button";

/** Scrollable, sticky-header table shell. Wide tables scroll horizontally on phones instead of breaking the layout. */
export function TableCard({ children, className, footer, minWidth = "min-w-[40rem]" }: { children: ReactNode; className?: string; footer?: ReactNode; minWidth?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className={cn("w-full border-collapse text-left text-sm", minWidth)}>{children}</table>
      </div>
      {footer}
    </Card>
  );
}

export const THead = ({ children }: { children: ReactNode }) => (
  <thead className="sticky top-0 bg-surface-2 text-xs uppercase tracking-wide text-ink-muted">
    <tr>{children}</tr>
  </thead>
);
export function Th({ children, align, className }: { children?: ReactNode; align?: "right"; className?: string }) {
  return (
    <th scope="col" className={cn("whitespace-nowrap px-4 py-3 font-semibold", align === "right" && "text-right", className)}>
      {children}
    </th>
  );
}
export const TBody = ({ children }: { children: ReactNode }) => <tbody className="divide-y divide-line">{children}</tbody>;
export const Tr = ({ className, ...props }: ComponentProps<"tr">) => <tr className={cn("transition-colors hover:bg-surface-2/60", className)} {...props} />;
export function Td({ children, align, className, mono }: { children?: ReactNode; align?: "right"; className?: string; mono?: boolean }) {
  return <td className={cn("px-4 py-3 align-middle", align === "right" && "tabular text-right", mono && "tabular", className)}>{children}</td>;
}

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-14 text-center text-sm text-ink-muted">
        {children}
      </td>
    </tr>
  );
}

/** Server-rendered pager that keeps the current filters in the query string. */
export function Pagination({ page, pages, total, basePath, params }: { page: number; pages: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-muted">
      <span className="tabular">{total.toLocaleString("en-IN")} result{total === 1 ? "" : "s"}</span>
      <div className="flex items-center gap-2">
        <span className="tabular">Page {page} of {pages}</span>
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClass("secondary", "size-9 px-0")} aria-label="Previous page"><ChevronLeft aria-hidden className="size-4" /></Link>
        ) : (
          <span className={buttonClass("secondary", "size-9 px-0 opacity-40")} aria-hidden><ChevronLeft className="size-4" /></span>
        )}
        {page < pages ? (
          <Link href={href(page + 1)} className={buttonClass("secondary", "size-9 px-0")} aria-label="Next page"><ChevronRight aria-hidden className="size-4" /></Link>
        ) : (
          <span className={buttonClass("secondary", "size-9 px-0 opacity-40")} aria-hidden><ChevronRight className="size-4" /></span>
        )}
      </div>
    </div>
  );
}

/** GET form: filters live in the URL, so they are shareable, survive refresh and are applied by the server. */
export function FilterBar({ action, children, resetHref }: { action: string; children: ReactNode; resetHref?: string }) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3 shadow-card">
      {children}
      <button type="submit" className={buttonClass("secondary")}>
        <Search aria-hidden className="size-4" /> Apply
      </button>
      {resetHref && (
        <Link href={resetHref} className={buttonClass("ghost")}>
          Reset
        </Link>
      )}
    </form>
  );
}

export function FilterField({ label, name, children }: { label: string; name: string; children: ReactNode }) {
  return (
    <div className="min-w-36 flex-1 space-y-1">
      <label htmlFor={name} className="text-xs font-medium text-ink-muted">{label}</label>
      {children}
    </div>
  );
}
