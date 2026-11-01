import Link from "next/link";
import { ArrowUpRight, Gift, Handshake, Trash2, type LucideIcon } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ExpiryBadge, PickupBadge, ScoreBar } from "@/components/ui/status";
import { fmtKg, fmtRelative } from "@/lib/format";
import type { ActivityItem } from "@/lib/db/repositories/analytics";
import type { FeedRow } from "@/lib/db/repositories/surplus";

const KIND_ICON: Record<ActivityItem["kind"], LucideIcon> = { waste: Trash2, listing: Gift, claim: Handshake };

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <Card>
      <CardHeader title="Recent activity" description="Latest events across waste, listings and claims" />
      {items.length === 0 ? (
        <CardBody><p className="py-8 text-center text-sm text-ink-muted">No activity yet.</p></CardBody>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((a, i) => {
            const Icon = KIND_ICON[a.kind];
            return (
              <li key={i} className="flex items-start gap-3 px-5 py-3">
                <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-muted"><Icon className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{a.text}</p>
                  <p className="truncate text-xs text-ink-muted">{a.who}</p>
                </div>
                <time dateTime={new Date(a.at).toISOString()} className="shrink-0 text-xs text-ink-muted">{fmtRelative(a.at)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function ExpiringLots({ lots }: { lots: { lotId: number; food: string; remaining: number; unit: string; hoursLeft: number; value: number }[] }) {
  return (
    <Card>
      <CardHeader title="Stock expiring soon" description="Expired or expiring within 72 hours - use it, list it as surplus, or log it" action={<Link href="/inventory?state=expiring" className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">View all <ArrowUpRight aria-hidden className="size-4" /></Link>} />
      {lots.length === 0 ? (
        <CardBody><p className="py-8 text-center text-sm text-ink-muted">Nothing is about to expire. Nice work.</p></CardBody>
      ) : (
        <ul className="divide-y divide-line">
          {lots.map((l) => (
            <li key={l.lotId} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{l.food}</p>
                <p className="tabular text-xs text-ink-muted">{l.remaining.toFixed(1)} {l.unit} left · ₹{Math.round(l.value).toLocaleString("en-IN")}</p>
              </div>
              <ExpiryBadge hoursLeft={l.hoursLeft} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function FeedPreview({ items }: { items: FeedRow[] }) {
  return (
    <Card>
      <CardHeader title="Best matches for you" description="Ranked by meaning, capacity and distance" action={<Link href="/feed" className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">See all <ArrowUpRight aria-hidden className="size-4" /></Link>} />
      {items.length === 0 ? (
        <CardBody><p className="py-8 text-center text-sm text-ink-muted">No surplus is available right now that matches your organisation&apos;s needs. New listings appear here as soon as they are published.</p></CardBody>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((f) => (
            <li key={f.listing_id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 text-sm text-ink">{f.description}</p>
                <PickupBadge hoursLeft={f.hours_left} />
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                <span>{f.establishment_name}</span><span className="tabular">{fmtKg(f.remaining_kg)}</span><ScoreBar value={f.score} label="Hybrid match score" />
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
