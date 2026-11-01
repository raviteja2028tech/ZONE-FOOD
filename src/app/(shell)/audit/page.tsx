import { History } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, FilterBar, FilterField, Pagination, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { Select } from "@/components/ui/fields";
import { requirePageUser } from "@/lib/auth/guard";
import { ROLE_LABEL, type Role } from "@/lib/auth/permissions";
import { auditTables, listAudit } from "@/lib/db/repositories/audit";
import { parsePage } from "@/lib/db/sql";
import { fmtDateTime, humanize } from "@/lib/format";
import { readParams, type SearchParams } from "@/lib/page";

export const metadata = { title: "Audit log" };
const ACTIONS = { I: ["Created", "ok"], U: ["Updated", "info"], D: ["Deleted", "bad"] } as const;
const show = (v: unknown) => (v === null || v === undefined ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, 40);

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePageUser("audit:read");
  const p = await readParams(searchParams);
  const action = ["I", "U", "D"].includes(p.action ?? "") ? p.action : undefined;
  const [result, tables] = await Promise.all([listAudit({ table: p.table, action }, parsePage(p, 25)), auditTables()]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Administration" title="Audit log" description="Who changed which establishment, listing, claim or organisation, written by database trigger T4 in the same transaction as the change - the application cannot forget to log." />
      <FilterBar action="/audit" resetHref="/audit">
        <FilterField label="Table" name="table"><Select name="table" defaultValue={p.table ?? ""}><option value="">All audited tables</option>{tables.map((t) => <option key={t.table_name} value={t.table_name}>{humanize(t.table_name)}</option>)}</Select></FilterField>
        <FilterField label="Action" name="action"><Select name="action" defaultValue={action ?? ""}><option value="">All</option><option value="I">Created</option><option value="U">Updated</option><option value="D">Deleted</option></Select></FilterField>
      </FilterBar>
      <TableCard footer={<Pagination page={result.page} pages={result.pages} total={result.total} basePath="/audit" params={{ table: p.table, action }} />}>
        <THead><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Record</Th><Th>What changed</Th></THead>
        <TBody>
          {result.rows.length === 0 && <EmptyRow cols={5}><span className="inline-flex items-center gap-2"><History aria-hidden className="size-4" />No audited changes yet. Edit an establishment, publish a listing or approve a claim and it appears here.</span></EmptyRow>}
          {result.rows.map((a) => (
            <Tr key={a.audit_id}>
              <Td mono className="whitespace-nowrap">{fmtDateTime(a.changed_at)}</Td>
              <Td>{a.who ?? <span className="text-ink-muted">system / unattributed</span>}{a.role && <span className="block text-xs text-ink-muted">{ROLE_LABEL[a.role as Role] ?? a.role}</span>}</Td>
              <Td><Badge tone={ACTIONS[a.action][1]}>{ACTIONS[a.action][0]}</Badge></Td>
              <Td className="whitespace-nowrap"><span className="font-medium">{humanize(a.table_name)}</span> <span className="tabular text-ink-muted">#{a.record_pk}</span></Td>
              <Td className="max-w-md text-xs text-ink-muted">
                {a.action === "U" ? a.changes.slice(0, 3).map((c) => <span key={c.field} className="block"><span className="font-mono text-ink">{c.field}</span>: {show(c.from)} → <span className="text-ink">{show(c.to)}</span></span>) : a.action === "I" ? "New record" : "Record removed"}
                {a.action === "U" && a.changes.length > 3 && <span className="block">+{a.changes.length - 3} more fields</span>}
              </Td>
            </Tr>
          ))}
        </TBody>
      </TableCard>
    </div>
  );
}
