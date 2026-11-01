import { CircleAlert, CircleCheck, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { EmptyRow, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { BackfillButton, SyncControls } from "@/components/forms/etl-controls";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { submissionStats } from "@/lib/db/repositories/documents";
import { failedDocuments, recentRuns } from "@/lib/db/repositories/etl";
import { embeddingCoverage, listAliases } from "@/lib/db/repositories/name-resolution";
import { fmtDateTime, humanize } from "@/lib/format";

export const metadata = { title: "Data sync" };

export default async function EtlPage() {
  const user = await requirePageUser("etl:read");
  const admin = can(user.role, "etl:run");
  const [stats, runs, failed, resolved, unresolved, coverage] = await Promise.all([
    submissionStats({}), recentRuns(), failedDocuments(), listAliases("RESOLVED", 12), listAliases("UNRESOLVED", 12), embeddingCoverage(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Data sync"
        description="MongoDB → PostgreSQL. Each field log is adapted to its establishment type, food names are resolved, and rows are written in one transaction. Re-running is always safe."
        actions={admin ? <SyncControls /> : <Badge tone="neutral">Read-only for auditors</Badge>}
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Pending" icon={Clock} value={String(stats.pending)} hint="waiting in MongoDB" />
        <KpiCard label="Synced" icon={CircleCheck} value={String(stats.synced)} hint="present in PostgreSQL" />
        <KpiCard label="Failed" icon={CircleAlert} value={String(stats.failed)} hint="see below; retry after fixing" />
      </section>

      <Card>
        <CardHeader title="Failed documents" description="Stored with a safe error message. Retry re-processes just that document." />
        <TableCard className="rounded-none border-0 shadow-none">
          <THead><Th>Date</Th><Th>Kind</Th><Th>Establishment</Th><Th>Error</Th><Th align="right">Attempts</Th>{admin && <Th />}</THead>
          <TBody>
            {failed.length === 0 && <EmptyRow cols={6}>No failed documents.</EmptyRow>}
            {failed.map((f) => (
              <Tr key={f.id}>
                <Td mono>{f.serviceDate}</Td><Td>{humanize(f.kind)}</Td><Td mono>#{f.establishmentId}</Td>
                <Td className="max-w-72 text-bad">{f.error}</Td><Td align="right">{f.attempts}</Td>
                {admin && <Td align="right">{f.retryable ? <ActionButton label="Retry" url={`/api/etl/retry/${f.id}`} success="Retry processed" /> : <Badge tone="neutral">Max attempts</Badge>}</Td>}
              </Tr>
            ))}
          </TBody>
        </TableCard>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Recent runs" />
          <TableCard className="rounded-none border-0 shadow-none">
            <THead><Th>Started</Th><Th>By</Th><Th align="right">Seen</Th><Th align="right">Synced</Th><Th align="right">Skipped</Th><Th align="right">Failed</Th><Th align="right">Rows</Th></THead>
            <TBody>
              {runs.length === 0 && <EmptyRow cols={7}>No runs yet.</EmptyRow>}
              {runs.map((r) => (<Tr key={r.run_id}><Td mono className="whitespace-nowrap">{fmtDateTime(r.started_at)}</Td><Td className="text-ink-muted">{r.who ?? "-"} {r.mode === "RETRY" && <Badge tone="info">retry</Badge>}</Td><Td align="right">{r.docs_seen}</Td><Td align="right">{r.docs_synced}</Td><Td align="right">{r.docs_skipped}</Td><Td align="right">{r.docs_failed}</Td><Td align="right">{r.rows_written}</Td></Tr>))}
            </TBody>
          </TableCard>
        </Card>

        <Card>
          <CardHeader title="Semantic index (pgvector)" description="all-MiniLM-L6-v2 · 384 dimensions · cosine" action={admin ? <BackfillButton /> : undefined} />
          <CardBody className="space-y-4">
            {coverage.map((c) => {
              const pct = c.total ? (c.embedded / c.total) * 100 : 100;
              return (
                <div key={c.table}>
                  <div className="mb-1 flex justify-between text-sm"><span>{c.table}</span><span className="tabular text-ink-muted">{c.embedded} / {c.total}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.table} embedding coverage`}><div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Learned name aliases" description="Raw names the sync matched and cached (trigram / vector)" />
          <TableCard className="rounded-none border-0 shadow-none">
            <THead><Th>Raw name</Th><Th>Matched to</Th><Th>Method</Th><Th align="right">Confidence</Th><Th align="right">Hits</Th></THead>
            <TBody>
              {resolved.length === 0 && <EmptyRow cols={5}>No aliases learned yet - run a sync.</EmptyRow>}
              {resolved.map((a) => (<Tr key={a.raw_name_norm}><Td mono>{a.raw_name_norm}</Td><Td className="font-medium">{a.food_name}</Td><Td><Badge tone="info">{a.method}</Badge></Td><Td align="right">{a.confidence ? Number(a.confidence).toFixed(2) : "-"}</Td><Td align="right">{a.hit_count}</Td></Tr>))}
            </TBody>
          </TableCard>
        </Card>
        <Card>
          <CardHeader title="Needs review" description="Names that could not be matched confidently; imported without a food item" />
          <TableCard className="rounded-none border-0 shadow-none">
            <THead><Th>Raw name</Th><Th align="right">Seen</Th><Th>Last seen</Th></THead>
            <TBody>
              {unresolved.length === 0 && <EmptyRow cols={3}>Nothing to review.</EmptyRow>}
              {unresolved.map((a) => (<Tr key={a.raw_name_norm}><Td mono>{a.raw_name_norm}</Td><Td align="right">{a.hit_count}</Td><Td mono className="text-ink-muted">{fmtDateTime(a.last_seen_at)}</Td></Tr>))}
            </TBody>
          </TableCard>
        </Card>
      </div>
    </div>
  );
}
