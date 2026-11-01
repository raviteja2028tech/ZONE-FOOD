import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

export const buttonClass = (variant: Variant = "secondary", className?: string) =>
  cn(
    "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-all active:scale-[0.97] active:duration-75",
    "disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" && "bg-accent text-accent-on shadow-[0_1px_0_0_oklch(1_0_0/0.25)_inset,0_6px_14px_-6px_var(--accent)] hover:-translate-y-px hover:bg-accent-hover hover:shadow-[0_1px_0_0_oklch(1_0_0/0.25)_inset,0_10px_20px_-8px_var(--accent)]",
    variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-surface-2",
    variant === "ghost" && "text-ink-muted hover:bg-surface-2 hover:text-ink",
    className,
  );

export function Button({ variant, className, type = "button", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}
