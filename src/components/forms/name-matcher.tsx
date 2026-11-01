"use client";

import { Loader2, ScanSearch } from "lucide-react";
import { useState } from "react";
import { callApi } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FormError, Input } from "@/components/ui/fields";
import { ScoreBar } from "@/components/ui/status";

interface Cand { foodId: number; name: string; score: number }
interface Result {
  input: string;
  normalised: string;
  vectorAvailable: boolean;
  resolution: { foodId: number | null; name: string | null; confidence: number; method: string };
  stages: { exact: Cand | null; alias: Cand | null; trigram: Cand[]; vector: Cand[] };
}

const EXAMPLES = ["Panner Butter Masala", "VEG. BIRYANI", "Daal Tadka", "Cumin Rice", "PBM", "chapathi"];

/** Interactive view of the resolution cascade: shows what each stage found and why the final answer was chosen. */
export function NameMatcher() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run(value: string) {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    const res = await callApi<Result>("/api/matching/name", "POST", { name: value });
    setBusy(false);
    if (res.ok) setResult(res.data);
    else setError(res.error.message);
  }

  const verdictTone = !result ? "neutral" : result.resolution.method === "NONE" ? "warn" : result.resolution.confidence >= 0.8 ? "ok" : "info";
  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <form noValidate onSubmit={(e) => { e.preventDefault(); void run(name); }} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1"><Field label="A food name as someone might type it" name="name"><Input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Panner Butter Masala" /></Field></div>
            <Button type="submit" variant="primary" disabled={busy}>{busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ScanSearch aria-hidden className="size-4" />}Match</Button>
          </form>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">Try:{EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => { setName(ex); void run(ex); }} className="rounded-full border border-line px-2.5 py-1 hover:border-accent hover:text-accent-ink">{ex}</button>)}</div>
          <FormError message={error} />
        </CardBody>
      </Card>

      {result && (
        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Result for “{result.input}” <span className="font-normal normal-case">(normalised: “{result.normalised}”)</span></p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-2xl font-semibold tracking-tight">{result.resolution.name ?? "Unresolved"}</p>
              <Badge tone={verdictTone}>{result.resolution.method === "NONE" ? "No confident match" : `${result.resolution.method} · confidence ${result.resolution.confidence.toFixed(2)}`}</Badge>
            </div>
            {result.resolution.method === "NONE" && <p className="mt-2 text-sm text-ink-muted">Nothing cleared the thresholds (trigram &gt; 0.45, vector ≥ 0.72), so the sync would import this row without a food item and queue the name for review. Abbreviations and synonyms are the model&apos;s known weak spot.</p>}
            {!result.vectorAvailable && <p className="mt-2 text-sm text-warn">The vector stage was skipped: the embedding model or stored name embeddings are unavailable. Run the embedding backfill on the Data sync page.</p>}
          </Card>
          <div className="grid gap-4 lg:grid-cols-4">
            <Stage title="1 · Exact" hint="Case-folded, punctuation-insensitive" cands={result.stages.exact ? [result.stages.exact] : []} />
            <Stage title="2 · Alias cache" hint="Learned from earlier syncs" cands={result.stages.alias ? [result.stages.alias] : []} />
            <Stage title="3 · Trigram" hint="Accept if similarity > 0.45" cands={result.stages.trigram} />
            <Stage title="4 · Vector (pgvector)" hint="Cosine similarity, accept ≥ 0.72" cands={result.stages.vector} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stage({ title, hint, cands }: { title: string; hint: string; cands: Cand[] }) {
  return (
    <Card>
      <CardHeader title={title} description={hint} />
      <CardBody>
        {cands.length === 0 ? <p className="text-sm text-ink-muted">No candidate</p> : (
          <ol className="space-y-2.5">{cands.map((c) => <li key={c.foodId}><p className="truncate text-sm font-medium">{c.name}</p><ScoreBar value={Math.min(1, Math.max(0, c.score))} /></li>)}</ol>
        )}
      </CardBody>
    </Card>
  );
}
