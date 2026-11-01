"use client";

import { Cpu, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { callApi } from "@/lib/client-api";
import { Button } from "@/components/ui/button";

interface Summary { synced: number; skipped: number; failed: number; rowsWritten: number; seen: number }

/** Runs the Mongo -> PostgreSQL sync (or a retry pass over failed documents) and reports the real counts. */
export function SyncControls() {
  const router = useRouter();
  const [busy, setBusy] = useState<"PENDING" | "RETRY" | null>(null);
  async function run(mode: "PENDING" | "RETRY") {
    setBusy(mode);
    const res = await callApi<Summary>("/api/etl/sync", "POST", { mode, limit: 200 });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error.message);
    const s = res.data;
    toast.success(s.seen === 0 ? "Nothing to sync" : `Synced ${s.synced}, already present ${s.skipped}, failed ${s.failed} - ${s.rowsWritten} waste events written`);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" onClick={() => run("PENDING")} disabled={busy !== null}>{busy === "PENDING" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" />}Run sync now</Button>
      <Button variant="secondary" onClick={() => run("RETRY")} disabled={busy !== null}>{busy === "RETRY" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <RotateCcw aria-hidden className="size-4" />}Retry all failed</Button>
    </div>
  );
}

export function BackfillButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const res = await callApi<{ done: { foods: number; recipients: number; listings: number } }>("/api/embeddings/backfill", "POST", {});
    setBusy(false);
    if (!res.ok) return void toast.error(res.error.message);
    const d = res.data.done;
    toast.success(`Embedded ${d.foods} food names, ${d.recipients} need profiles, ${d.listings} listings`);
    router.refresh();
  }
  return <Button variant="secondary" onClick={run} disabled={busy}>{busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Cpu aria-hidden className="size-4" />}{busy ? "Embedding… (first run downloads the model)" : "Run embedding backfill"}</Button>;
}
