"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/** Re-runs the server checks for the current page without a full reload. */
export function RefreshButton({ label = "Re-run checks" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button onClick={() => start(() => router.refresh())} disabled={pending} aria-busy={pending}>
      <RefreshCw aria-hidden className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Checking…" : label}
    </Button>
  );
}
