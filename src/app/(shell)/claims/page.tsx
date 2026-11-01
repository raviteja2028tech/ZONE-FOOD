import { PageHeader } from "@/components/ui/page-header";
import { ActionButton } from "@/components/ui/action-button";
import { ClaimStatus } from "@/components/ui/status";
import { EmptyRow, FilterBar, FilterField, Pagination, TBody, TableCard, Td, THead, Th, Tr } from "@/components/ui/table";
import { Select } from "@/components/ui/fields";
import { requirePageUser } from "@/lib/auth/guard";
import { claimCounts, listClaims } from "@/lib/db/repositories/claims";
import { KpiCard } from "@/components/ui/kpi-card";
import { CircleCheck, Clock, Handshake as HandshakeIcon, UserX } from "lucide-react";
import { parsePage } from "@/lib/db/sql";
import { fmtDateTime, fmtKg, humanize } from "@/lib/format";
import { readParams, type SearchParams } from "@/lib/page";

export const metadata = { title: "Claims" };
const STATUSES = ["REQUESTED", "APPROVED", "COLLECTED", "NO_SHOW", "REJECTED"];

const ACTION_UI = {
  approve: { label: "Approve", variant: "primary", success: "Claim approved - quantity reserved" },
  reject: { label: "Reject", variant: "ghost", success: "Claim rejected" },
  collect: { label: "Mark collected", variant: "primary", success: "Pickup recorded as redistributed food" },
  no_show: { label: "No-show", variant: "ghost", success: "Marked as no-show - quantity released" },
} as const;

export default async function ClaimsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("claim:read");
  const p = await readParams(searchParams);
  const status = STATUSES.includes(p.status ?? "") ? p.status : undefined;
  const scope = user.role === "RECIPIENT_AGENT" ? { recipientId: user.recipientId as number } : user.establishmentId !== null ? { establishmentId: user.establishmentId } : {};
  const [result, counts] = await Promise.all([listClaims(user, { ...scope, status }, parsePage(p)), claimCounts(scope)]);
  const recipient = user.role === "RECIPIENT_AGENT";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Redistribution"
        title="Claims"
        description={recipient ? "Your requests and their progress. Mark a claim collected once you have picked the food up." : user.establishmentId !== null ? "Requests for your surplus. Approve to reserve the quantity, then hand over and mark it collected." : "All claims across the zone (read-only)."}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Claims by status">
        <KpiCard label="Awaiting approval" icon={Clock} value={String(counts.REQUESTED?.n ?? 0)} count={{ value: counts.REQUESTED?.n ?? 0 }} hint={`${(counts.REQUESTED?.kg ?? 0).toFixed(0)} kg requested`} />
        <KpiCard label="Approved, to collect" icon={HandshakeIcon} value={String(counts.APPROVED?.n ?? 0)} count={{ value: counts.APPROVED?.n ?? 0 }} hint={`${(counts.APPROVED?.kg ?? 0).toFixed(0)} kg reserved`} />
        <KpiCard label="Collected" icon={CircleCheck} value={String(counts.COLLECTED?.n ?? 0)} count={{ value: counts.COLLECTED?.n ?? 0 }} hint={`${(counts.COLLECTED?.kg ?? 0).toFixed(0)} kg redistributed`} />
        <KpiCard label="No-show / rejected" icon={UserX} value={String((counts.NO_SHOW?.n ?? 0) + (counts.REJECTED?.n ?? 0))} hint={`${counts.NO_SHOW?.n ?? 0} no-show · ${counts.REJECTED?.n ?? 0} rejected`} />
      </section>
      <FilterBar action="/claims" resetHref="/claims">
        <FilterField label="Status" name="status"><Select name="status" defaultValue={status ?? ""}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></FilterField>
      </FilterBar>
      <TableCard footer={<Pagination page={result.page} pages={result.pages} total={result.total} basePath="/claims" params={{ status }} />}>
        <THead><Th>Requested</Th>{!recipient && <Th>Organisation</Th>}{(recipient || !scope.establishmentId) && <Th>From</Th>}<Th>Food</Th><Th align="right">Quantity</Th><Th>Match</Th><Th>Status</Th><Th /></THead>
        <TBody>
          {result.rows.length === 0 && <EmptyRow cols={8}>{recipient ? "You have not claimed anything yet. Browse available surplus to make your first claim." : "No claims yet."}</EmptyRow>}
          {result.rows.map((c) => (
            <Tr key={c.claim_id}>
              <Td mono className="whitespace-nowrap">{fmtDateTime(c.requested_at)}</Td>
              {!recipient && <Td className="font-medium">{c.org_name}</Td>}
              {(recipient || !scope.establishmentId) && <Td className="max-w-44 truncate text-ink-muted">{c.establishment_name}</Td>}
              <Td className="min-w-56 max-w-80"><span className="line-clamp-2">{c.description}</span></Td>
              <Td align="right" className="whitespace-nowrap font-medium">{fmtKg(c.claimed_qty_kg)} <span className="text-xs font-normal text-ink-muted">of {fmtKg(c.offered_qty_kg, 0)}</span></Td>
              <Td mono className="text-ink-muted">{c.match_score === null ? "-" : c.match_score.toFixed(2)}</Td>
              <Td><ClaimStatus status={c.status} /></Td>
              <Td align="right">
                <span className="inline-flex items-center gap-1.5">
                  {c.allowed_actions.map((a) => (
                    <ActionButton key={a} label={ACTION_UI[a].label} url={`/api/claims/${c.claim_id}`} method="PATCH" body={{ action: a }} variant={ACTION_UI[a].variant} success={ACTION_UI[a].success} confirm={a === "reject" || a === "no_show" ? `${ACTION_UI[a].label}?` : undefined} />
                  ))}
                </span>
              </Td>
            </Tr>
          ))}
        </TBody>
      </TableCard>
    </div>
  );
}
