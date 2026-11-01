"use client";

import { Activity, CheckCircle2, Database, Loader2, Play, RefreshCw, ShieldX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { callApi } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { DbObjects } from "@/lib/db/repositories/db-objects";

export interface QueryMeta { id: string; title: string; concepts: string; purpose: string; reading: string; mode: "select" | "dml"; sql: string }
export interface DemoMeta { id: string; title: string; concept: string; explanation: string; expect: "refused" | "ok"; sql: string }

interface RunOutcome { id: string; mode: string; columns: string[]; rows: unknown[][]; rowCount: number; truncated: boolean; millis: number; plan?: string[]; rolledBack: boolean }
interface DemoOutcome { id: string; expect: "refused" | "ok"; refused: boolean; error?: { sqlstate: string; message: string; constraint?: string | null }; shown: { label: string; columns: string[]; rows: unknown[][] }[] }

const show = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v));

function ResultTable({ columns, rows }: { columns: string[]; rows: unknown[][] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-md border border-line">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="sticky top-0 bg-surface-2 text-xs uppercase tracking-wide text-ink-muted"><tr>{columns.map((c, i) => <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i} className="hover:bg-surface-2/60">{r.map((c, j) => <td key={j} className={cn("whitespace-nowrap px-3 py-1.5", typeof c === "number" || /^-?\d+(\.\d+)?$/.test(String(c)) ? "tabular text-right" : "")}>{show(c).slice(0, 80)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function QueriesTab({ queries, canRefresh }: { queries: QueryMeta[]; canRefresh: boolean }) {
  const [sel, setSel] = useState(queries[0]!.id);
  const [busy, setBusy] = useState<"run" | "explain" | null>(null);
  const [out, setOut] = useState<Record<string, RunOutcome>>({});
  const [err, setErr] = useState<string | null>(null);
  const q = queries.find((x) => x.id === sel)!;
  const router = useRouter();

  async function run(explain: boolean) {
    setBusy(explain ? "explain" : "run");
    setErr(null);
    const res = await callApi<RunOutcome>("/api/lab/run", "POST", { id: sel, explain });
    setBusy(null);
    if (res.ok) setOut((o) => ({ ...o, [sel]: res.data }));
    else setErr(res.error.message);
  }
  async function refresh() {
    setBusy("run");
    const res = await callApi<{ rows: number; millis: number }>("/api/lab/refresh", "POST", {});
    setBusy(null);
    if (res.ok) { toast.success(`mv_zone_monthly refreshed concurrently: ${res.data.rows} rows in ${res.data.millis} ms`); router.refresh(); }
    else toast.error(res.error.message);
  }
  const r = out[sel];

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <nav aria-label="Catalogue queries" className="max-h-[70vh] space-y-1 overflow-y-auto rounded-lg border border-line bg-surface p-2">
        {queries.map((x) => (
          <button key={x.id} type="button" onClick={() => { setSel(x.id); setErr(null); }} aria-current={x.id === sel}
            className={cn("flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors", x.id === sel ? "bg-accent-soft text-accent-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}>
            <span className="tabular mt-0.5 shrink-0 text-xs font-semibold">{x.id}</span>
            <span className="leading-snug">{x.title}</span>
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader title={`${q.id} · ${q.title}`} description={q.concepts} action={q.mode === "dml" ? <Badge tone="warn">DML - runs in a rolled-back transaction</Badge> : <Badge tone="ok">Read-only</Badge>} />
          <CardBody className="space-y-4">
            <p className="text-sm leading-relaxed text-ink">{q.purpose}</p>
            <pre className="max-h-80 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-xs leading-relaxed">{q.sql}</pre>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => run(false)} disabled={busy !== null}>{busy === "run" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Play aria-hidden className="size-4" />}Run query</Button>
              <Button variant="secondary" onClick={() => run(true)} disabled={busy !== null}>{busy === "explain" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Activity aria-hidden className="size-4" />}Run with EXPLAIN ANALYZE</Button>
              {q.id === "Q13" && canRefresh && <Button variant="ghost" onClick={refresh} disabled={busy !== null}><RefreshCw aria-hidden className="size-4" />Refresh the materialised view</Button>}
            </div>
            {err && <p role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-sm font-medium text-bad">{err}</p>}
          </CardBody>
        </Card>
        {r && (
          <Card>
            <CardHeader title="Result" description={`${r.rowCount} row${r.rowCount === 1 ? "" : "s"}${r.truncated ? " (first 200 shown)" : ""} in ${r.millis} ms${r.rolledBack ? " · transaction rolled back" : ""}`} />
            <CardBody className="space-y-4">
              <ResultTable columns={r.columns} rows={r.rows} />
              <p className="text-sm text-ink-muted"><span className="font-semibold text-ink">How to read it: </span>{q.reading}</p>
              {r.plan && (<div><p className="mb-2 text-sm font-semibold">EXPLAIN (ANALYZE, BUFFERS)</p><pre className="max-h-96 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-xs leading-relaxed">{r.plan.join("\n")}</pre></div>)}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function DemosTab({ demos }: { demos: DemoMeta[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<Record<string, DemoOutcome>>({});
  async function run(id: string) {
    setBusy(id);
    const res = await callApi<DemoOutcome>("/api/lab/demo", "POST", { id });
    setBusy(null);
    if (res.ok) setOut((o) => ({ ...o, [id]: res.data }));
    else toast.error(res.error.message);
  }
  return (
    <ul className="grid gap-4 xl:grid-cols-2">
      {demos.map((d) => {
        const o = out[d.id];
        const met = o ? (d.expect === "refused" ? o.refused : !o.refused) : null;
        return (
          <li key={d.id}>
            <Card className="h-full">
              <CardHeader title={<span><span className="tabular mr-2 text-ink-muted">{d.id}</span>{d.title}</span>} description={d.concept} />
              <CardBody className="space-y-3">
                <p className="text-sm leading-relaxed text-ink-muted">{d.explanation}</p>
                <details><summary className="cursor-pointer text-xs font-medium text-accent-ink">Show the SQL</summary><pre className="mt-2 max-h-48 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-xs">{d.sql}</pre></details>
                <Button variant={o ? "secondary" : "primary"} onClick={() => run(d.id)} disabled={busy !== null} className="h-9">{busy === d.id ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Play aria-hidden className="size-4" />}{o ? "Run again" : "Run demo"}</Button>
                {o && (
                  <div className="space-y-2" aria-live="polite">
                    <div className="flex flex-wrap items-center gap-2">
                      {o.refused ? <Badge tone="bad">Refused by the database</Badge> : <Badge tone="ok">Accepted</Badge>}
                      {met !== null && <span className="text-xs text-ink-muted">{met ? "as expected" : "NOT as expected"}</span>}
                    </div>
                    {o.error && (
                      <div className="rounded-md border border-bad/30 bg-bad-soft p-3 text-sm">
                        <p className="font-medium text-bad">{o.error.message}</p>
                        <p className="mt-1 font-mono text-xs text-ink-muted">SQLSTATE {o.error.sqlstate}{o.error.constraint ? ` · constraint ${o.error.constraint}` : ""}</p>
                      </div>
                    )}
                    {o.shown.map((s) => (<div key={s.label}><p className="mb-1 text-xs font-semibold text-ink-muted">{s.label}</p><ResultTable columns={s.columns} rows={s.rows} /></div>))}
                    <p className="flex items-center gap-1.5 text-xs text-ink-muted"><CheckCircle2 aria-hidden className="size-3.5" />The transaction was rolled back; no data changed.</p>
                  </div>
                )}
              </CardBody>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function ObjSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <Card><CardHeader title={`${title} (${count})`} /><CardBody className="p-0"><div className="max-h-80 overflow-auto">{children}</div></CardBody></Card>;
}
function ObjTable({ head, rows }: { head: string[]; rows: (string | number | boolean)[][] }) {
  return (
    <table className="w-full text-left text-sm"><thead className="sticky top-0 bg-surface-2 text-xs uppercase text-ink-muted"><tr>{head.map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="whitespace-nowrap px-4 py-1.5">{typeof c === "boolean" ? (c ? "yes" : "") : String(c)}</td>)}</tr>)}</tbody></table>
  );
}

function ObjectsTab({ o }: { o: DbObjects }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-muted">Live from the PostgreSQL catalogue. Extensions: {o.extensions.map((e) => `${e.name} ${e.version}`).join(", ")}. <span className="font-medium text-ink">mv_zone_monthly</span> holds {o.mvRows} rows.</p>
      <div className="grid gap-5 xl:grid-cols-2">
        <ObjSection title="Triggers" count={o.triggers.length}><ObjTable head={["Trigger", "Table", "When", "Events", "Function"]} rows={o.triggers.map((t) => [t.name, t.table, t.timing, t.events, t.fn])} /></ObjSection>
        <ObjSection title="Functions and procedures" count={o.routines.length}><ObjTable head={["Name", "Kind", "Purpose"]} rows={o.routines.map((r) => [r.name, r.kind, r.purpose])} /></ObjSection>
        <ObjSection title="Views and materialised views" count={o.views.length}><ObjTable head={["Name", "Kind", "Comment"]} rows={o.views.map((v) => [v.name, v.kind, v.comment])} /></ObjSection>
        <ObjSection title="Partitions of waste_event" count={o.partitions.length}><ObjTable head={["Partition", "Range", "≈ rows"]} rows={o.partitions.map((p) => [p.name, p.bound, p.rows])} /></ObjSection>
        <ObjSection title="Indexes" count={o.indexes.length}><ObjTable head={["Index", "Table", "Method", "Partial", "Unique", "Size"]} rows={o.indexes.map((i) => [i.name, i.table, i.method, i.partial, i.unique, i.size])} /></ObjSection>
        <ObjSection title="Tables" count={o.tables.length}><ObjTable head={["Table", "Kind", "≈ rows"]} rows={o.tables.map((t) => [t.name, t.kind, t.rows])} /></ObjSection>
      </div>
    </div>
  );
}

export function LabClient({ queries, demos, objects, canRefresh }: { queries: QueryMeta[]; demos: DemoMeta[]; objects: DbObjects; canRefresh: boolean }) {
  const tabs = [
    { id: "queries", label: `SQL catalogue (${queries.length})`, icon: Database },
    { id: "demos", label: `Live constraint demos (${demos.length})`, icon: ShieldX },
    { id: "objects", label: "Database objects", icon: Activity },
  ] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("queries");
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="DBMS Lab sections" className="flex flex-wrap gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors", tab === id ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-muted hover:text-ink")}>
            <Icon aria-hidden className="size-4" />{label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "queries" && <QueriesTab queries={queries} canRefresh={canRefresh} />}
        {tab === "demos" && <DemosTab demos={demos} />}
        {tab === "objects" && <ObjectsTab o={objects} />}
      </div>
    </div>
  );
}
