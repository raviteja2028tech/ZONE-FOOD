import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

export const buttonClass = (variant: Variant = "secondary", className?: string) =>
  cn(
    "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" && "bg-accent text-accent-on hover:bg-accent-hover",
    variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-surface-2",
    variant === "ghost" && "text-ink-muted hover:bg-surface-2 hover:text-ink",
    className,
  );

export function Button({ variant, className, type = "button", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}
