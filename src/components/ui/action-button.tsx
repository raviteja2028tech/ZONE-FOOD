"use client";

import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useSubmit } from "@/lib/client-api";
import { Button } from "./button";

/** A button that performs one real API call (optionally after a confirm step) and refreshes the page data. */
export function ActionButton({
  label,
  url,
  method = "POST",
  body,
  success,
  variant = "secondary",
  confirm,
  icon,
  className,
}: {
  label: string;
  url: string;
  method?: string;
  body?: unknown;
  success?: string;
  variant?: "primary" | "secondary" | "ghost";
  confirm?: string;
  icon?: ReactNode;
  className?: string;
}) {
  const { submit, pending } = useSubmit({ url, method, success });
  const [armed, setArmed] = useState(false);

  async function run() {
    const res = await submit(body);
    if (!res.ok) toast.error(res.error.message);
    setArmed(false);
  }

  if (confirm && armed) {
    return (
      <span className="inline-flex items-center gap-1.5" role="group" aria-label={confirm}>
        <span className="text-xs text-ink-muted">{confirm}</span>
        <Button variant="primary" onClick={run} disabled={pending} className="h-8 px-2.5">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : "Yes"}
        </Button>
        <Button variant="ghost" onClick={() => setArmed(false)} disabled={pending} className="h-8 px-2.5">
          No
        </Button>
      </span>
    );
  }
  return (
    <Button variant={variant} className={className ?? "h-8 px-3"} disabled={pending} aria-busy={pending} onClick={() => (confirm ? setArmed(true) : run())}>
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {label}
    </Button>
  );
}
