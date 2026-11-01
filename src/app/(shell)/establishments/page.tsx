import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, FilterBar, FilterField, Pagination, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/fields";
import { requirePageUser } from "@/lib/auth/guard";
import { listEstablishments } from "@/lib/db/repositories/organisations";
import { parsePage } from "@/lib/db/sql";
import { fmtDate, fmtKg, humanize } from "@/lib/format";
import { asInt, readParams, type SearchParams } from "@/lib/page";
import { query } from "@/lib/db/postgres";

export const metadata = { title: "Establishments" };
const KINDS = ["COMMERCIAL", "EDUCATIONAL", "ORGANIZATIONAL", "RESIDENTIAL", "RECREATIONAL", "RETAIL_FOOD", "HEALTHCARE"];

export default async function EstablishmentsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePageUser("establishment:list");
  const p = await readParams(searchParams);
  const status = p.status === "active" || p.status === "inactive" ? p.status : "all";
  const kind = KINDS.includes(p.kind ?? "") ? p.kind : undefined;
  const [result, blocks] = await Promise.all([
    listEstablishments({ q: p.q, zoneId: asInt(p.zoneId), kind, status }, parsePage(p)),
    query<{ id: number; label: string }>("SELECT zone_id AS id, zone_name AS label FROM zone WHERE zone_level = 2 ORDER BY zone_name"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Locality" title="Establishments" description="Every registered food-service establishment and residential unit in the zone, with the last 30 days of waste." />
      <FilterBar action="/establishments" resetHref="/establishments">
        <FilterField label="Name" name="q"><Input name="q" defaultValue={p.q} placeholder="Search…" /></FilterField>
        <FilterField label="Block" name="zoneId"><Select name="zoneId" defaultValue={p.zoneId ?? ""}><option value="">All blocks</option>{blocks.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</Select></FilterField>
        <FilterField label="Kind" name="kind"><Select name="kind" defaultValue={kind ?? ""}><option value="">All kinds</option>{KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</Select></FilterField>
        <FilterField label="Status" name="status"><Select name="status" defaultValue={status}><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option></Select></FilterField>
      </FilterBar>
      <TableCard footer={<Pagination page={result.page} pages={result.pages} total={result.total} basePath="/establishments" params={{ q: p.q, zoneId: p.zoneId, kind, status: status === "all" ? undefined : status }} />}>
        <THead><Th>Name</Th><Th>Type</Th><Th>Location</Th><Th align="right">Capacity</Th><Th align="right">Waste (30 d)</Th><Th>Since</Th><Th>Status</Th></THead>
        <TBody>
          {result.rows.length === 0 && <EmptyRow cols={7}>No establishments match these filters.</EmptyRow>}
          {result.rows.map((e) => (
            <Tr key={e.establishment_id}>
              <Td><Link href={`/establishments/${e.establishment_id}`} className="font-medium text-ink hover:text-accent-ink hover:underline">{e.name}</Link></Td>
              <Td className="text-ink-muted">{e.category_name}</Td>
              <Td className="text-ink-muted">{e.block_name} › {e.zone_name}</Td>
              <Td align="right">{e.capacity} <span className="text-xs text-ink-muted">{e.capacity_metric}</span></Td>
              <Td align="right" className="font-medium">{fmtKg(e.waste_kg_30d, 0)}</Td>
              <Td mono className="whitespace-nowrap text-ink-muted">{fmtDate(e.operational_since)}</Td>
              <Td>{e.is_active ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}</Td>
            </Tr>
          ))}
        </TBody>
      </TableCard>
    </div>
  );
}
