import Link from "next/link";
import { ArrowLeft, ChefHat, Lock } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { EmptyRow, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { BatchForm, CloseSessionForm, DishForm } from "@/components/forms/service-forms";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { getSession, listDishes, MIN_SURPLUS_KG } from "@/lib/db/repositories/kitchen";
import { query } from "@/lib/db/postgres";
import { ListingStatus } from "@/components/ui/status";
import { AppError } from "@/lib/http/errors";
import { fmtDate, fmtKg, humanize } from "@/lib/format";
import { pageScope } from "@/lib/page";

export const metadata = { title: "Service session" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("service:read");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let data;
  try {
    data = await getSession(id, pageScope(user));
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const { session, batches } = data;
  const writer = can(user.role, "service:write") && user.establishmentId === session.establishment_id;
  const dishes = writer ? await listDishes(user.establishmentId as number) : [];
  const followUp = session.is_closed
    ? {
        listings: await query<{ listing_id: number; description: string; status: string }>(
          "SELECT listing_id, description, status FROM surplus_listing WHERE session_id = $1 ORDER BY listing_id", [id]),
        waste: (await query<{ n: number; kg: string }>("SELECT count(*)::int AS n, COALESCE(sum(quantity_kg), 0) AS kg FROM waste_event WHERE session_id = $1", [id]))[0]!,
      }
    : { listings: [], waste: { n: 0, kg: "0" } };
  const prepared = batches.reduce((s, b) => s + b.prepared_qty_kg, 0);
  const leftover = batches.reduce((s, b) => s + (b.leftover_qty_kg ?? 0), 0);

  return (
    <div className="space-y-6">
      <Link href="/service" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"><ArrowLeft aria-hidden className="size-4" />All sessions</Link>
      <PageHeader
        eyebrow={session.establishment_name}
        title={`${humanize(session.slot)} · ${fmtDate(session.service_date)}`}
        description={`Expected ${session.expected_headcount} diners${session.actual_headcount !== null ? ` · actual ${session.actual_headcount}` : ""}.`}
        actions={
          writer && !session.is_closed ? (
            <>
              <Modal trigger="New dish" title="Add a dish" variant="ghost" triggerIcon={<ChefHat aria-hidden className="size-4" />}><DishForm /></Modal>
              <Modal trigger="Add batch" title="Add a prepared batch" variant="secondary"><BatchForm sessionId={id} dishes={dishes} /></Modal>
              {batches.length > 0 && <Modal trigger="Close session" title="Close session" description="Record how much was served and left over for each batch." size="lg" triggerIcon={<Lock aria-hidden className="size-4" />}><CloseSessionForm sessionId={id} batches={batches} /></Modal>}
            </>
          ) : session.is_closed ? <Badge tone="neutral">Closed</Badge> : <Badge tone="ok">Open</Badge>
        }
      />
      <TableCard>
        <THead><Th>Dish</Th><Th align="right">Prepared</Th><Th align="right">Portions</Th><Th align="right">Served</Th><Th align="right">Leftover</Th><Th align="right">Plate waste</Th></THead>
        <TBody>
          {batches.length === 0 && <EmptyRow cols={6}>{writer ? "No batches yet. Add the dishes you prepared." : "No batches were recorded."}</EmptyRow>}
          {batches.map((b) => (
            <Tr key={b.batch_id}>
              <Td className="font-medium">{b.dish_name}</Td>
              <Td align="right">{fmtKg(b.prepared_qty_kg, 2)}</Td>
              <Td align="right">{b.prepared_portions}</Td>
              <Td align="right">{b.served_qty_kg === null ? "-" : fmtKg(b.served_qty_kg, 2)}</Td>
              <Td align="right">{b.leftover_qty_kg === null ? "-" : fmtKg(b.leftover_qty_kg, 2)}</Td>
              <Td align="right">{b.plate_waste_kg === null ? "-" : fmtKg(b.plate_waste_kg, 2)}</Td>
            </Tr>
          ))}
        </TBody>
      </TableCard>
      {session.is_closed && (
        <Card>
          <CardHeader title="Created automatically when the session closed" description={`${fmtKg(leftover, 2)} left from ${fmtKg(prepared, 2)} prepared. The stored procedure sp_close_service_session did this in one transaction.`} />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-surface-2/60 p-4"><p className="text-xs text-ink-muted">Waste events recorded</p><p className="tabular text-2xl font-semibold">{followUp.waste.n}</p><p className="text-xs text-ink-muted">{fmtKg(Number(followUp.waste.kg), 2)} · plate waste and small leftovers</p></div>
              <div className="rounded-lg bg-surface-2/60 p-4"><p className="text-xs text-ink-muted">Surplus listings created</p><p className="tabular text-2xl font-semibold">{followUp.listings.length}</p><p className="text-xs text-ink-muted">edible leftovers of {MIN_SURPLUS_KG} kg or more</p></div>
            </div>
            {followUp.listings.length > 0 && (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {followUp.listings.map((l) => (
                  <li key={l.listing_id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span className="line-clamp-1">{l.description}</span><ListingStatus status={l.status} /></li>
                ))}
              </ul>
            )}
            <Link href="/surplus" className={buttonClass("secondary")}>Open surplus listings</Link>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
