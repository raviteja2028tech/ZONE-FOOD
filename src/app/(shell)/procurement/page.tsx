import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { EmptyRow, Pagination, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { ProcurementForm } from "@/components/forms/procurement-form";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { listSuppliers } from "@/lib/db/repositories/catalog";
import { listProcurements } from "@/lib/db/repositories/inventory";
import { parsePage } from "@/lib/db/sql";
import { fmtDateTime, fmtInr } from "@/lib/format";
import { pageScope, readParams, type SearchParams } from "@/lib/page";

export const metadata = { title: "Procurement" };

export default async function ProcurementPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("procurement:read");
  const p = await readParams(searchParams);
  const scope = pageScope(user, p.establishmentId);
  const result = await listProcurements(scope, parsePage(p));
  const form = can(user.role, "procurement:write") ? (
    <Modal trigger="Record delivery" title="Record a delivery" description="Creates the invoice and one stock lot per item in a single step." size="lg" triggerIcon={<Plus aria-hidden className="size-4" />}>
      <ProcurementForm suppliers={await listSuppliers()} />
    </Modal>
  ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Kitchen" title="Procurement" description="Deliveries received, with the supplier, invoice and cost. Each line becomes a stock lot in inventory." actions={form} />
      <TableCard footer={<Pagination page={result.page} pages={result.pages} total={result.total} basePath="/procurement" params={{ establishmentId: p.establishmentId }} />}>
        <THead><Th>Received</Th>{!scope.establishmentId && <Th>Establishment</Th>}<Th>Supplier</Th><Th>Invoice</Th><Th align="right">Lines</Th><Th align="right">Total</Th><Th>Recorded by</Th></THead>
        <TBody>
          {result.rows.length === 0 && <EmptyRow cols={7}>No deliveries recorded yet. Use “Record delivery” to add the first one.</EmptyRow>}
          {result.rows.map((r) => (
            <Tr key={r.procurement_id}>
              <Td mono className="whitespace-nowrap">{fmtDateTime(r.received_at)}</Td>
              {!scope.establishmentId && <Td className="max-w-48 truncate">{r.establishment_name}</Td>}
              <Td>{r.supplier_name ?? <span className="text-ink-muted">-</span>}</Td>
              <Td mono>{r.invoice_no ?? "-"}</Td>
              <Td align="right">{r.line_count}</Td>
              <Td align="right" className="font-medium">{fmtInr(r.total_cost)}</Td>
              <Td className="text-ink-muted">{r.recorded_by_name ?? "-"}</Td>
            </Tr>
          ))}
        </TBody>
      </TableCard>
    </div>
  );
}
