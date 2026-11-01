import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, Pagination, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { OpenSessionForm } from "@/components/forms/service-forms";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { query } from "@/lib/db/postgres";
import { listSessions } from "@/lib/db/repositories/kitchen";
import { parsePage } from "@/lib/db/sql";
import { fmtDate, fmtKg, humanize } from "@/lib/format";
import { pageScope, readParams, type SearchParams } from "@/lib/page";

export const metadata = { title: "Service" };

export default async function ServicePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("service:read");
  const p = await readParams(searchParams);
  const scope = pageScope(user, p.establishmentId);
  const result = await listSessions(scope, parsePage(p));
  const today = (await query<{ d: string }>("SELECT CURRENT_DATE::text AS d"))[0]!.d;
  const form = can(user.role, "service:write") ? (
    <Modal trigger="Open session" title="Open a service session" description="One session per date and meal. Add prepared batches, then close it with the consumption figures." triggerIcon={<Plus aria-hidden className="size-4" />}>
      <OpenSessionForm today={today} />
    </Modal>
  ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Kitchen" title="Service sessions" description="Preparation and consumption by meal. Closing a session records how much was served, left over and wasted on plates." actions={form} />
      <TableCard footer={<Pagination page={result.page} pages={result.pages} total={result.total} basePath="/service" params={{ establishmentId: p.establishmentId }} />}>
        <THead><Th>Date</Th>{!scope.establishmentId && <Th>Establishment</Th>}<Th>Meal</Th><Th align="right">Expected</Th><Th align="right">Actual</Th><Th align="right">Batches</Th><Th align="right">Prepared</Th><Th align="right">Leftover</Th><Th>Status</Th><Th /></THead>
        <TBody>
          {result.rows.length === 0 && <EmptyRow cols={10}>No sessions yet. Open one to start recording preparation and consumption.</EmptyRow>}
          {result.rows.map((s) => (
            <Tr key={s.session_id}>
              <Td mono className="whitespace-nowrap">{fmtDate(s.service_date)}</Td>
              {!scope.establishmentId && <Td className="max-w-44 truncate">{s.establishment_name}</Td>}
              <Td>{humanize(s.slot)}</Td>
              <Td align="right">{s.expected_headcount}</Td>
              <Td align="right">{s.actual_headcount ?? "-"}</Td>
              <Td align="right">{s.batch_count}</Td>
              <Td align="right">{fmtKg(s.prepared_kg)}</Td>
              <Td align="right">{s.is_closed ? fmtKg(s.leftover_kg) : "-"}</Td>
              <Td>{s.is_closed ? <Badge tone="neutral">Closed</Badge> : <Badge tone="ok">Open</Badge>}</Td>
              <Td align="right"><Link href={`/service/${s.session_id}`} className="text-sm font-medium text-accent-ink hover:underline">Details</Link></Td>
            </Tr>
          ))}
        </TBody>
      </TableCard>
    </div>
  );
}
