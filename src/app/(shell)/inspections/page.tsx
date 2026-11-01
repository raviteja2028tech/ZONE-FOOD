import { ClipboardPlus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { InspectionForm } from "@/components/forms/inspection-form";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { query } from "@/lib/db/postgres";
import { listInspections } from "@/lib/db/repositories/documents";
import { fmtDate } from "@/lib/format";
import { pageScope, readParams, type SearchParams } from "@/lib/page";

export const metadata = { title: "Inspections" };

export default async function InspectionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("inspection:read");
  const p = await readParams(searchParams);
  const scope = pageScope(user, p.establishmentId);
  const reports = await listInspections(scope, 30);
  const names = new Map((await query<{ id: number; name: string }>("SELECT establishment_id AS id, name FROM establishment")).map((e) => [e.id, e.name]));
  const writer = can(user.role, "inspection:write");
  const choices = writer && user.establishmentId === null ? [...names.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data"
        title="Inspection reports"
        description="Checklists whose sections change between audit rounds - stored as flexible documents in MongoDB."
        actions={writer ? <Modal trigger="New inspection" title="Record an inspection" size="lg" triggerIcon={<ClipboardPlus aria-hidden className="size-4" />}><InspectionForm establishments={choices} /></Modal> : undefined}
      />
      {reports.length === 0 && <Card><CardBody><p className="py-10 text-center text-sm text-ink-muted">No inspection reports yet.</p></CardBody></Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        {reports.map((r) => {
          const items = r.sections.flatMap((s) => s.items as { status: string }[]);
          const fails = items.filter((i) => i.status === "FAIL").length;
          return (
            <Card key={r._id}>
              <CardHeader title={names.get(r.establishment_id) ?? `Establishment #${r.establishment_id}`} description={`${fmtDate(r.inspected_at)} · template ${r.template_version ?? "-"} · ${r.sections.length} sections`} action={fails ? <Badge tone="bad">{fails} failed</Badge> : <Badge tone="ok">All clear</Badge>} />
              <CardBody className="space-y-3">
                {r.sections.map((s) => (
                  <div key={s.name}>
                    <p className="text-sm font-semibold">{s.name}</p>
                    <ul className="mt-1 space-y-1">
                      {(s.items as { item: string; status: string; note?: string; reading_c?: number }[]).map((it, i) => (
                        <li key={i} className="flex items-start justify-between gap-3 text-sm"><span className="text-ink-muted">{it.item}{it.reading_c !== undefined && ` (${it.reading_c} °C)`}{it.note && <span className="block text-xs">{it.note}</span>}</span><Badge tone={it.status === "PASS" ? "ok" : it.status === "FAIL" ? "bad" : "neutral"}>{it.status === "NA" ? "N/A" : it.status === "PASS" ? "Pass" : "Fail"}</Badge></li>
                      ))}
                    </ul>
                  </div>
                ))}
                {r.inspector_notes && <p className="border-t border-line pt-3 text-sm italic text-ink-muted">“{r.inspector_notes}”</p>}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
