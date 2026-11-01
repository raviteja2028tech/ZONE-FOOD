import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-muted/70 transition-colors " +
  "hover:border-ink-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60 aria-[invalid=true]:border-bad";

/** Label + control + hint/error. The error is announced to assistive tech and linked via aria-describedby. */
export function Field({
  label,
  name,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-muted">{hint}</p>}
      {error && (
        <p id={`${name}-error`} role="alert" className="text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input"> & { name: string }) {
  return <input id={props.name} className={cn(control, "h-10", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select"> & { name: string }) {
  return (
    <select id={props.name} className={cn(control, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea"> & { name: string }) {
  return <textarea id={props.name} className={cn(control, "min-h-24 py-2", className)} {...props} />;
}

export function Checkbox({ label, name, defaultChecked, className }: { label: string; name: string; defaultChecked?: boolean; className?: string }) {
  return (
    <label htmlFor={name} className={cn("flex cursor-pointer items-center gap-2.5 text-sm text-ink", className)}>
      <input id={name} name={name} type="checkbox" defaultChecked={defaultChecked} className="size-4 rounded border-line-strong accent-[var(--accent)]" />
      {label}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2.5 text-sm font-medium text-bad">
      {message}
    </div>
  );
}

/** Responsive two-column grid used inside forms. */
export const FormGrid = ({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) => (
  <div className={cn("grid gap-4", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3")}>{children}</div>
);
