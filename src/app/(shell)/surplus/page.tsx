import { Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { ListingStatus } from "@/components/ui/status";
import { EmptyRow, FilterBar, FilterField, Pagination, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/fields";
import { ListingForm, MatchPanel } from "@/components/forms/surplus-forms";
import { requirePageUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { listListings } from "@/lib/db/repositories/surplus";
import { getKpis } from "@/lib/db/repositories/analytics";
import { rescueFunnel } from "@/lib/db/repositories/insights";
import { KpiCard } from "@/components/ui/kpi-card";
import { Gift, Handshake, Timer } from "lucide-react";
import { parsePage } from "@/lib/db/sql";
import { fmtDateTime, fmtKg, fmtRelative, humanize } from "@/lib/format";
import { pageScope, readParams, type SearchParams } from "@/lib/page";

export const metadata = { title: "Surplus listings" };
const STATUSES = ["OPEN", "PARTIALLY_CLAIMED", "FULLY_CLAIMED", "EXPIRED", "CANCELLED"];

export default async function SurplusPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("surplus:read");
  const p = await readParams(searchParams);
  const scope = pageScope(user, p.establishmentId);
  const writer = can(user.role, "surplus:write");
  const status = STATUSES.includes(p.status ?? "") ? p.status : undefined;
  const [result, kpis, funnel] = await Promise.all([listListings({ ...scope, status, q: p.q }, parsePage(p)), getKpis(scope), rescueFunnel(scope)]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Redistribution"
        title="Surplus listings"
        description="Edible food you are offering to recipient organisations. Claims arrive on the Claims page for your approval."
        actions={writer ? <Modal trigger="List surplus" title="Offer surplus food" description="Recipients in your locality are ranked against this description." size="lg" triggerIcon={<Plus aria-hidden className="size-4" />}><ListingForm /></Modal> : undefined}
      />
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Marketplace at a glance">
        <KpiCard featured label="Available right now" icon={Gift} value={String(Math.round(kpis.surplusAvailableKg))} unit="kg" count={{ value: kpis.surplusAvailableKg }} hint={`${kpis.openListings} live listing${kpis.openListings === 1 ? "" : "s"}`} />
        <KpiCard label="Rescue rate" icon={Handshake} value={String(funnel.ratePct)} unit="%" count={{ value: funnel.ratePct, decimals: 1 }} hint={`${funnel.collectedKg.toLocaleString("en-IN")} kg collected of ${funnel.offeredKg.toLocaleString("en-IN")} offered`} />
        <KpiCard label="Median time to pickup" icon={Timer} value={funnel.medianHours === null ? "-" : String(funnel.medianHours)} unit={funnel.medianHours === null ? undefined : "h"} hint="from listing to collection" />
      </section>
      <FilterBar action="/surplus" resetHref="/surplus">
        <FilterField label="Search" name="q"><Input name="q" defaultValue={p.q} placeholder="description or establishment" /></FilterField>
        <FilterField label="Status" name="status"><Select name="status" defaultValue={status ?? ""}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></FilterField>
      </FilterBar>
      <TableCard footer={<Pagination page={result.page} pages={result.pages} total={result.total} basePath="/surplus" params={{ q: p.q, status, establishmentId: p.establishmentId }} />}>
        <THead><Th>Listing</Th>{!scope.establishmentId && <Th>Establishment</Th>}<Th align="right">Offered</Th><Th align="right">Reserved</Th><Th>Window</Th><Th>Status</Th><Th>Claims</Th><Th /></THead>
        <TBody>
          {result.rows.length === 0 && <EmptyRow cols={8}>No listings match. {writer && "Use “List surplus” to offer food."}</EmptyRow>}
          {result.rows.map((l) => {
            const live = l.status === "OPEN" || l.status === "PARTIALLY_CLAIMED";
            return (
              <Tr key={l.listing_id}>
                <Td className="min-w-64 max-w-96"><span className="line-clamp-2">{l.description}</span><span className="mt-0.5 flex gap-1.5 text-xs text-ink-muted">{l.is_cooked ? "Cooked" : "Uncooked"} · {l.is_vegetarian ? "Veg" : "Non-veg"}{!l.has_embedding && live && " · not yet embedded"}</span></Td>
                {!scope.establishmentId && <Td className="max-w-44 truncate text-ink-muted">{l.establishment_name}</Td>}
                <Td align="right" className="whitespace-nowrap font-medium">{fmtKg(l.offered_qty_kg)}</Td>
                <Td align="right" className="whitespace-nowrap">{fmtKg(l.claimed_qty_kg)}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-muted">{fmtDateTime(l.available_from)} → {fmtDateTime(l.expires_at)}{live && <span className="block font-medium text-ink">{fmtRelative(l.expires_at)}</span>}</Td>
                <Td><ListingStatus status={l.status} /></Td>
                <Td>{l.claims_pending > 0 ? <Badge tone="info">{l.claims_pending} pending</Badge> : <span className="tabular text-ink-muted">{l.claims_total}</span>}</Td>
                <Td align="right">
                  {live && writer && (
                    <span className="inline-flex items-center gap-1.5">
                      <Modal trigger="Matches" title="Best recipients for this listing" description={l.description.slice(0, 120)} variant="ghost" triggerClassName="h-8 px-2.5" size="lg" triggerIcon={<Sparkles aria-hidden className="size-3.5" />}><MatchPanel listingId={l.listing_id} /></Modal>
                      <ActionButton label="Cancel" url={`/api/surplus/${l.listing_id}/cancel`} variant="ghost" confirm="Cancel this listing?" success="Listing cancelled" />
                    </span>
                  )}
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </TableCard>
    </div>
  );
}
