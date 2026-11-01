import { Clock, MapPin, Salad } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ClaimStatus, PickupBadge, ScoreBar } from "@/components/ui/status";
import { ClaimForm } from "@/components/forms/surplus-forms";
import { requirePageUser, ownRecipientId } from "@/lib/auth/guard";
import { feedForRecipient } from "@/lib/db/repositories/surplus";
import { getRecipient } from "@/lib/db/repositories/organisations";
import { fmtKg, fmtRelative } from "@/lib/format";

export const metadata = { title: "Available surplus" };

export default async function FeedPage() {
  const user = await requirePageUser("feed:read");
  const recipientId = ownRecipientId(user);
  const [feed, org] = await Promise.all([feedForRecipient(recipientId), getRecipient(recipientId)]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Redistribution" title="Available surplus" description="Only food you can actually take: it matches your cooked-food policy, your daily capacity and your pickup window. Ranked by how well it fits your needs." />
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm text-ink-muted">
        <span className="font-medium text-ink">{org.org_name}</span>
        <span>Capacity {org.daily_capacity_kg} kg/day</span>
        <span>Pickup {org.pickup_window_start}–{org.pickup_window_end}</span>
        <span>{org.accepts_cooked ? "Accepts cooked food" : "Does not accept cooked food"}</span>
        {!org.has_embedding && <Badge tone="warn">Need profile not yet embedded - ask an administrator to run the embedding backfill</Badge>}
      </Card>

      {feed.length === 0 ? (
        <EmptyState icon={Salad} title="Nothing available right now">New surplus listings that fit your organisation appear here automatically. Check back soon, or make sure your need profile and pickup window are up to date.</EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {feed.map((f, i) => (
            <li key={f.listing_id}>
              <Card className="flex h-full flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">{i === 0 ? "Best match" : `Match #${i + 1}`}</p>
                  <PickupBadge hoursLeft={f.hours_left} />
                </div>
                <p className="mt-2 text-[15px] font-medium leading-snug text-ink">{f.description}</p>
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-muted">
                  <div className="flex items-center gap-1.5"><MapPin aria-hidden className="size-3.5" />{f.establishment_name}{f.distance_km !== null && ` · ${f.distance_km} km`}</div>
                  <div className="flex items-center gap-1.5"><Clock aria-hidden className="size-3.5" />{fmtRelative(f.expires_at)}</div>
                  <div>{f.is_cooked ? "Cooked" : "Uncooked"} · {f.is_vegetarian ? "Veg" : "Non-veg"}</div>
                </dl>
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-surface-2/60 p-3 text-xs">
                  <div><p className="mb-1 text-ink-muted">Overall</p><p className="tabular text-lg font-semibold text-ink">{f.score.toFixed(2)}</p></div>
                  <div><p className="mb-1 text-ink-muted">Semantic</p><ScoreBar value={f.semantic} /></div>
                  <div><p className="mb-1 text-ink-muted">Capacity fit</p><ScoreBar value={f.capacity} /></div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <p className="tabular text-lg font-semibold">{fmtKg(f.remaining_kg)} <span className="text-xs font-normal text-ink-muted">available</span></p>
                  {f.my_claim_status ? <ClaimStatus status={f.my_claim_status} /> : (
                    <Modal trigger="Claim" title="Claim this surplus" triggerClassName="h-9"><ClaimForm listingId={f.listing_id} maxKg={Math.min(f.remaining_kg, org.daily_capacity_kg)} description={f.description} /></Modal>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
