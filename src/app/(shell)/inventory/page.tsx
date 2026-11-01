import { AlertTriangle, Boxes, Wallet } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { ExpiryBadge } from "@/components/ui/status";
import { EmptyRow, FilterBar, FilterField, Pagination, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/fields";
import { buttonClass } from "@/components/ui/button";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { inventorySummary, listLots } from "@/lib/db/repositories/inventory";
import { parsePage } from "@/lib/db/sql";
import { fmtDateTime, fmtInr, fmtNum, fmtRelative } from "@/lib/format";
import { pageScope, readParams, type SearchParams } from "@/lib/page";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("inventory:read");
  const p = await readParams(searchParams);
  const scope = pageScope(user, p.establishmentId);
  const state = (["fresh", "expiring", "expired"] as const).find((s) => s === p.state);
  const [lots, summary] = await Promise.all([listLots(scope, { q: p.q, state }, parsePage(p)), inventorySummary(scope)]);
  const writer = can(user.role, "waste:write");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Kitchen" title="Inventory" description="Stock lots with quantity remaining and expiry, soonest first. Deliveries create lots; waste write-offs deduct from them." />
      <section className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Stock lots" icon={Boxes} value={fmtNum(summary.lots)} hint={`worth ${fmtInr(summary.value)}`} />
        <KpiCard label="Expiring in 72 h" icon={AlertTriangle} value={fmtNum(summary.expiring)} hint={`${fmtInr(summary.valueAtRisk)} at risk`} />
        <KpiCard label="Past expiry, still in stock" icon={Wallet} value={fmtNum(summary.expired)} hint="log as waste to clear" />
      </section>
      <FilterBar action="/inventory" resetHref="/inventory">
        <FilterField label="Food item" name="q"><Input name="q" defaultValue={p.q} placeholder="e.g. paneer" /></FilterField>
        <FilterField label="Expiry" name="state"><Select name="state" defaultValue={state ?? ""}><option value="">All</option><option value="expiring">Expiring in 72 h</option><option value="expired">Already expired</option><option value="fresh">Fresh</option></Select></FilterField>
      </FilterBar>
      <TableCard footer={<Pagination page={lots.page} pages={lots.pages} total={lots.total} basePath="/inventory" params={{ q: p.q, state, establishmentId: p.establishmentId }} />}>
        <THead><Th>Food</Th>{!scope.establishmentId && <Th>Establishment</Th>}<Th align="right">Remaining</Th><Th align="right">Value</Th><Th>Received</Th><Th>Expires</Th><Th>Status</Th>{writer && <Th />}</THead>
        <TBody>
          {lots.rows.length === 0 && <EmptyRow cols={8}>No stock matches. Record a delivery on the Procurement page to add stock.</EmptyRow>}
          {lots.rows.map((l) => (
            <Tr key={l.lot_id}>
              <Td className="font-medium">{l.food_name}</Td>
              {!scope.establishmentId && <Td className="max-w-48 truncate text-ink-muted">{l.establishment_name}</Td>}
              <Td align="right" className="whitespace-nowrap">{fmtNum(l.remaining_qty, 2)} {l.base_unit} <span className="text-xs text-ink-muted">of {fmtNum(l.received_qty, 2)}</span></Td>
              <Td align="right">{fmtInr(l.value_remaining)}</Td>
              <Td mono className="whitespace-nowrap text-ink-muted">{fmtDateTime(l.received_at)}</Td>
              <Td mono className="whitespace-nowrap">{fmtDateTime(l.expires_at)} <span className="text-xs text-ink-muted">({fmtRelative(l.expires_at)})</span></Td>
              <Td><ExpiryBadge hoursLeft={l.hours_left} /></Td>
              {writer && <Td align="right"><Link href="/waste" className={buttonClass("ghost", "h-8 px-2.5")}>Log waste</Link></Td>}
            </Tr>
          ))}
        </TBody>
      </TableCard>
    </div>
  );
}
