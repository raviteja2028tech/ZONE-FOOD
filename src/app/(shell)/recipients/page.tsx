import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, FilterBar, FilterField, Pagination, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { Input } from "@/components/ui/fields";
import { requirePageUser } from "@/lib/auth/guard";
import { listRecipients } from "@/lib/db/repositories/organisations";
import { parsePage } from "@/lib/db/sql";
import { fmtKg, humanize } from "@/lib/format";
import { readParams, type SearchParams } from "@/lib/page";

export const metadata = { title: "Recipients" };

export default async function RecipientsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePageUser("recipient:list");
  const p = await readParams(searchParams);
  const result = await listRecipients(p.q, parsePage(p));
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Locality" title="Recipient organisations" description="NGOs, shelters, community fridges and compost units that can claim surplus food." />
      <FilterBar action="/recipients" resetHref="/recipients"><FilterField label="Name" name="q"><Input name="q" defaultValue={p.q} placeholder="Search…" /></FilterField></FilterBar>
      <TableCard footer={<Pagination page={result.page} pages={result.pages} total={result.total} basePath="/recipients" params={{ q: p.q }} />}>
        <THead><Th>Organisation</Th><Th>Type</Th><Th>Zone</Th><Th align="right">Capacity</Th><Th>Pickup</Th><Th>Cooked</Th><Th align="right">Received</Th><Th>Semantic</Th></THead>
        <TBody>
          {result.rows.length === 0 && <EmptyRow cols={8}>No organisations found.</EmptyRow>}
          {result.rows.map((r) => (
            <Tr key={r.recipient_id}>
              <Td><Link href={`/recipients/${r.recipient_id}`} className="font-medium hover:text-accent-ink hover:underline">{r.org_name}</Link></Td>
              <Td className="text-ink-muted">{humanize(r.org_type)}</Td>
              <Td className="text-ink-muted">{r.zone_name}</Td>
              <Td align="right">{fmtKg(r.daily_capacity_kg, 0)}/day</Td>
              <Td mono className="whitespace-nowrap">{r.pickup_window_start}–{r.pickup_window_end}</Td>
              <Td>{r.accepts_cooked ? <Badge tone="ok">Accepts</Badge> : <Badge tone="neutral">No</Badge>}</Td>
              <Td align="right" className="font-medium">{fmtKg(r.kg_received, 0)} <span className="text-xs font-normal text-ink-muted">({r.claims_collected})</span></Td>
              <Td>{r.has_embedding ? <Badge tone="ok">Embedded</Badge> : <Badge tone="warn">Pending</Badge>}</Td>
            </Tr>
          ))}
        </TBody>
      </TableCard>
    </div>
  );
}
