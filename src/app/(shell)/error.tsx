"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ShellError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("route error", error.digest ?? "");
  }, [error]);

  return (
    <EmptyState
      icon={TriangleAlert}
      tone="bad"
      title="This page could not be loaded"
      action={<Button variant="primary" onClick={reset}>Try again</Button>}
    >
      An unexpected error occurred. Check that the databases are running (<code className="font-mono text-xs">docker compose up -d --wait</code>)
      and review the System status page.
      {error.digest && <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>}
    </EmptyState>
  );
}
