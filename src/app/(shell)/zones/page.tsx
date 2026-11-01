import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { EmptyRow, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { buttonClass } from "@/components/ui/button";
import { ZoneForm } from "@/components/forms/profile-forms";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { getZoneRollup } from "@/lib/db/repositories/zones";
import { fmtKg } from "@/lib/format";
import { readParams, type SearchParams } from "@/lib/page";

export const metadata = { title: "Zones" };
const LEVELS = ["", "Sector", "Block", "Street", "Lane"];

export default async function ZonesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("zone:read");
  const p = await readParams(searchParams);
  const days = [7, 30, 90].includes(Number(p.days)) ? Number(p.days) : 30;
  const zones = await getZoneRollup(days);
  const admin = can(user.role, "zone:manage");

  // Depth-first order (parent followed by its children) so the hierarchy reads as a tree.
  const children = new Map<number | null, typeof zones>();
  for (const z of zones) children.set(z.parent_zone_id, [...(children.get(z.parent_zone_id) ?? []), z]);
  const ordered: typeof zones = [];
  const walk = (parent: number | null) => { for (const z of children.get(parent) ?? []) { ordered.push(z); walk(z.zone_id); } };
  walk(null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Locality"
        title="Zones"
        description="The locality hierarchy with figures rolled up from every street beneath each zone (one recursive query)."
        actions={
          <>
            <div role="group" aria-label="Period" className="inline-flex rounded-md border border-line p-0.5">
              {[7, 30, 90].map((d) => <Link key={d} href={`/zones?days=${d}`} aria-current={d === days ? "true" : undefined} className={`rounded px-3 py-1.5 text-sm font-medium ${d === days ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"}`}>{d} days</Link>)}
            </div>
            {admin && <Modal trigger="New zone" title="Create a zone" triggerIcon={<Plus aria-hidden className="size-4" />}><ZoneForm parents={zones.filter((z) => z.zone_level < 4).map((z) => ({ id: z.zone_id, label: `${"— ".repeat(z.zone_level - 1)}${z.zone_name}` }))} /></Modal>}
          </>
        }
      />
      <TableCard>
        <THead><Th>Zone</Th><Th>Level</Th><Th align="right">Establishments</Th><Th align="right">Recipients</Th><Th align="right">Wasted</Th><Th align="right">Redistributed</Th><Th align="right">Surplus open</Th></THead>
        <TBody>
          {ordered.length === 0 && <EmptyRow cols={7}>No zones.</EmptyRow>}
          {ordered.map((z) => (
            <Tr key={z.zone_id} className={z.zone_level === 1 ? "bg-accent-soft/40 font-semibold" : undefined}>
              <Td><span style={{ paddingLeft: `${(z.zone_level - 1) * 20}px` }} className="inline-flex items-center gap-2">{z.zone_level > 1 && <span aria-hidden className="text-ink-muted">└</span>}{z.zone_name}{z.pincode && <span className="text-xs font-normal text-ink-muted">{z.pincode}</span>}</span></Td>
              <Td className="text-ink-muted">{LEVELS[z.zone_level]}</Td>
              <Td align="right">{z.establishments}</Td>
              <Td align="right">{z.recipients}</Td>
              <Td align="right">{fmtKg(z.wasteKg, 0)}</Td>
              <Td align="right">{fmtKg(z.redistributedKg, 0)}</Td>
              <Td align="right">{fmtKg(z.surplusOpenKg, 0)}</Td>
            </Tr>
          ))}
        </TBody>
      </TableCard>
      <Link href="/establishments" className={buttonClass("secondary")}>Browse establishments</Link>
    </div>
  );
}
