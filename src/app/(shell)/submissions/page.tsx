import { FilePlus2, Info } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { SyncStatus } from "@/components/ui/status";
import { FilterBar, FilterField } from "@/components/ui/table";
import { Select } from "@/components/ui/fields";
import { SubmissionForm } from "@/components/forms/submission-form";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { query } from "@/lib/db/postgres";
import { listSubmissions, submissionStats } from "@/lib/db/repositories/documents";
import { fmtDate, fmtDateTime, humanize } from "@/lib/format";
import { pageScope, readParams, type SearchParams } from "@/lib/page";
import { CircleAlert, CircleCheck, Clock } from "lucide-react";

export const metadata = { title: "Field logs" };

export default async function SubmissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("submission:read");
  const p = await readParams(searchParams);
  const scope = pageScope(user, p.establishmentId);
  const status = (["PENDING", "SYNCED", "FAILED"] as const).find((s) => s === p.status);
  const [docs, stats] = await Promise.all([listSubmissions({ ...scope, status, limit: 30 }), submissionStats(scope)]);
  const writer = can(user.role, "submission:write");
  let kind = "";
  let today = "";
  if (writer) {
    kind = (await query<{ kind: string }>("SELECT c.kind FROM establishment e JOIN establishment_category c USING (category_id) WHERE e.establishment_id = $1", [scope.establishmentId]))[0]?.kind ?? "";
    today = (await query<{ d: string }>("SELECT CURRENT_DATE::text AS d"))[0]!.d;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data"
        title="Field logs"
        description="Daily submissions whose structure differs by establishment type, stored as documents in MongoDB and imported into PostgreSQL by the sync."
        actions={writer ? <Modal trigger="New field log" title="Submit a daily field log" description={`Form for: ${humanize(kind)}`} size="lg" triggerIcon={<FilePlus2 aria-hidden className="size-4" />}><SubmissionForm kind={kind} today={today} /></Modal> : undefined}
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Waiting to sync" icon={Clock} value={String(stats.pending)} hint="in MongoDB, not yet in PostgreSQL" />
        <KpiCard label="Synced" icon={CircleCheck} value={String(stats.synced)} hint="imported into waste events" />
        <KpiCard label="Failed" icon={CircleAlert} value={String(stats.failed)} hint="needs attention on the Data sync page" />
      </section>
      <Card className="flex items-start gap-3 p-4 text-sm text-ink-muted"><Info aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-ink" /><p>Why MongoDB? A restaurant reports dishes and plates, a household reports bins, a hospital reports wards. One relational table would need dozens of mostly-empty columns; documents keep each submission&apos;s natural shape. PostgreSQL stays the system of record for the validated result.</p></Card>
      <FilterBar action="/submissions" resetHref="/submissions"><FilterField label="Sync status" name="status"><Select name="status" defaultValue={status ?? ""}><option value="">All</option><option value="PENDING">Pending</option><option value="SYNCED">Synced</option><option value="FAILED">Failed</option></Select></FilterField></FilterBar>
      <div className="space-y-3">
        {docs.length === 0 && <Card><CardBody><p className="py-8 text-center text-sm text-ink-muted">No field logs yet.</p></CardBody></Card>}
        {docs.map((d) => (
          <Card key={d._id}>
            <CardHeader
              title={<span className="flex flex-wrap items-center gap-2">{fmtDate(d.service_date)} <span className="text-sm font-normal text-ink-muted">· {humanize(d.estab_kind)}{!scope.establishmentId && ` · establishment #${d.establishment_id}`}</span></span>}
              description={`Submitted ${fmtDateTime(d.submitted_at)} · fields: ${Object.keys(d.payload).join(", ")}`}
              action={<SyncStatus status={d.sync_status} />}
            />
            <CardBody className="space-y-2">
              {d.sync_error && <p role="alert" className="text-sm font-medium text-bad">{d.sync_error}{d.sync_attempts ? ` (attempt ${d.sync_attempts})` : ""}</p>}
              {d.sql_waste_ids && d.sql_waste_ids.length > 0 && <p className="text-sm text-ink-muted">Imported as {d.sql_waste_ids.length} waste event{d.sql_waste_ids.length === 1 ? "" : "s"}.</p>}
              <details className="group"><summary className="cursor-pointer text-sm font-medium text-accent-ink hover:underline">View document</summary><pre className="mt-2 max-h-72 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-xs leading-relaxed">{JSON.stringify({ _id: d._id, ...d.payload }, null, 2)}</pre></details>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
