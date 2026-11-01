import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyRow, FilterBar, FilterField, Pagination, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/fields";
import { WasteForm } from "@/components/forms/waste-form";
import { Scale, Wallet, Wind } from "lucide-react";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { listDisposalRoutes, listWasteReasons } from "@/lib/db/repositories/catalog";
import { query } from "@/lib/db/postgres";
import { listWaste } from "@/lib/db/repositories/waste";
import { parsePage } from "@/lib/db/sql";
import { fmtDate, fmtInr, fmtKg, fmtNum, humanize } from "@/lib/format";
import { asInt, isoDateOrUndef, pageScope, readParams, type SearchParams } from "@/lib/page";

export const metadata = { title: "Waste" };

const STAGES = ["PRE_CONSUMER_PREP", "PRE_CONSUMER_SPOILAGE", "PRE_CONSUMER_EXPIRY", "POST_CONSUMER_PLATE", "POST_CONSUMER_SERVICE"];

export default async function WastePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("waste:read");
  const p = await readParams(searchParams);
  const scope = pageScope(user, p.establishmentId);
  const canWrite = can(user.role, "waste:write");
  const page = parsePage(p);
  const result = await listWaste({ ...scope, from: isoDateOrUndef(p.from), to: isoDateOrUndef(p.to), stage: STAGES.includes(p.stage ?? "") ? p.stage : undefined, reasonId: asInt(p.reasonId), q: p.q }, page);
  const allReasons = await listWasteReasons(true);

  let form = null;
  if (canWrite) {
    const [reasons, routes, lots, today] = await Promise.all([
      listWasteReasons(),
      listDisposalRoutes(),
      query<{ id: number; label: string }>(
        `SELECT l.lot_id AS id, f.canonical_name || ' - ' || round(l.remaining_qty, 1) || ' ' || f.base_unit || ' left (exp ' || to_char(l.expires_at, 'DD Mon') || ')' AS label
           FROM inventory_lot l JOIN food_item f USING (food_id) WHERE l.establishment_id = $1 AND l.remaining_qty > 0 ORDER BY l.expires_at LIMIT 60`,
        [scope.establishmentId],
      ),
      query<{ d: string }>("SELECT CURRENT_DATE::text AS d"),
    ]);
    form = (
      <Modal trigger="Record waste" title="Record food waste" description="Cost and CO₂e are calculated by the database from the food item." triggerIcon={<Plus aria-hidden className="size-4" />}>
        <WasteForm reasons={reasons} routes={routes} lots={lots} today={today[0]!.d} />
      </Modal>
    );
  }

  const params = { q: p.q, from: p.from, to: p.to, stage: p.stage, reasonId: p.reasonId, establishmentId: p.establishmentId };
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Kitchen" title="Waste" description={scope.establishmentId ? "Everything your establishment has thrown away or redirected, newest first." : "Waste events across the whole zone."} actions={form} />

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Totals for the current filters">
        <KpiCard label="Weight" icon={Scale} value={fmtNum(result.sums.kg, 1)} unit="kg" hint={`${fmtNum(result.total)} events`} />
        <KpiCard label="Estimated cost" icon={Wallet} value={fmtInr(result.sums.cost)} hint="from item prices" />
        <KpiCard label="CO₂e" icon={Wind} value={fmtNum(result.sums.co2e, 0)} unit="kg" hint="illustrative factors" />
      </section>

      <FilterBar action="/waste" resetHref="/waste">
        <FilterField label="Search food or notes" name="q"><Input name="q" defaultValue={p.q} placeholder="e.g. rice" /></FilterField>
        <FilterField label="From" name="from"><Input name="from" type="date" defaultValue={p.from} /></FilterField>
        <FilterField label="To" name="to"><Input name="to" type="date" defaultValue={p.to} /></FilterField>
        <FilterField label="Stage" name="stage"><Select name="stage" defaultValue={p.stage ?? ""}><option value="">All stages</option>{STAGES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></FilterField>
        <FilterField label="Reason" name="reasonId"><Select name="reasonId" defaultValue={p.reasonId ?? ""}><option value="">All reasons</option>{allReasons.map((r) => <option key={r.id} value={r.id}>{humanize(r.code)}</option>)}</Select></FilterField>
      </FilterBar>

      <TableCard footer={<Pagination page={result.page} pages={result.pages} total={result.total} basePath="/waste" params={params} />}>
        <THead><Th>Date</Th>{!scope.establishmentId && <Th>Establishment</Th>}<Th>Food</Th><Th>Stage</Th><Th>Reason</Th><Th>Route</Th><Th align="right">Qty</Th><Th align="right">Cost</Th></THead>
        <TBody>
          {result.rows.length === 0 && <EmptyRow cols={8}>No waste events match these filters.</EmptyRow>}
          {result.rows.map((w) => (
            <Tr key={w.waste_id}>
              <Td mono className="whitespace-nowrap">{fmtDate(w.occurred_on)}</Td>
              {!scope.establishmentId && <Td className="max-w-48 truncate">{w.establishment_name}</Td>}
              <Td className="max-w-56"><span className="block truncate">{w.food_name ?? <span className="text-ink-muted">Mixed / unspecified</span>}</span>{w.notes && <span className="block truncate text-xs text-ink-muted">{w.notes}</span>}</Td>
              <Td className="whitespace-nowrap text-ink-muted">{humanize(w.stage)}</Td>
              <Td className="whitespace-nowrap">{w.reason_code === "REDISTRIBUTED" ? <Badge tone="ok">Redistributed</Badge> : humanize(w.reason_code)}</Td>
              <Td className="whitespace-nowrap">{w.is_diversion ? <Badge tone="ok">{humanize(w.route_name)}</Badge> : <Badge tone="warn">{humanize(w.route_name)}</Badge>}</Td>
              <Td align="right" className="whitespace-nowrap font-medium">{fmtKg(w.quantity_kg, 2)}</Td>
              <Td align="right" className="whitespace-nowrap text-ink-muted">{w.cost_estimate === null ? "-" : fmtInr(w.cost_estimate)}</Td>
            </Tr>
          ))}
        </TBody>
      </TableCard>
    </div>
  );
}
