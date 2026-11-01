import { Badge, type Tone } from "./badge";
import { humanize } from "@/lib/format";

const LISTING: Record<string, Tone> = { OPEN: "ok", PARTIALLY_CLAIMED: "info", FULLY_CLAIMED: "neutral", EXPIRED: "warn", CANCELLED: "neutral" };
const CLAIM: Record<string, Tone> = { REQUESTED: "info", APPROVED: "ok", COLLECTED: "ok", NO_SHOW: "bad", REJECTED: "neutral" };
const SYNC: Record<string, Tone> = { PENDING: "info", SYNCED: "ok", FAILED: "bad" };

export const ListingStatus = ({ status }: { status: string }) => <Badge tone={LISTING[status] ?? "neutral"}>{humanize(status)}</Badge>;
export const ClaimStatus = ({ status }: { status: string }) => <Badge tone={CLAIM[status] ?? "neutral"}>{humanize(status)}</Badge>;
export const SyncStatus = ({ status }: { status: string }) => <Badge tone={SYNC[status] ?? "neutral"}>{humanize(status)}</Badge>;

/** Expiry band: colour + label + icon (never colour alone). */
export function ExpiryBadge({ hoursLeft }: { hoursLeft: number }) {
  if (hoursLeft <= 0) return <Badge tone="bad">Expired</Badge>;
  if (hoursLeft <= 24) return <Badge tone="bad">&lt; 24 h</Badge>;
  if (hoursLeft <= 72) return <Badge tone="warn">{Math.ceil(hoursLeft / 24)} days</Badge>;
  return <Badge tone="ok">{hoursLeft < 24 * 14 ? `${Math.ceil(hoursLeft / 24)} days` : "Fresh"}</Badge>;
}

/** How long until a LISTING ends: urgency by hours, labelled with the actual countdown. */
export function PickupBadge({ hoursLeft }: { hoursLeft: number }) {
  const h = Math.floor(hoursLeft);
  const m = Math.max(0, Math.round((hoursLeft - h) * 60));
  const label = hoursLeft <= 0 ? "Ended" : h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
  return <Badge tone={hoursLeft <= 0 ? "neutral" : hoursLeft < 2 ? "bad" : hoursLeft < 6 ? "warn" : "ok"}>{label}</Badge>;
}

export function ScoreBar({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="text-xs text-ink-muted">no semantic score</span>;
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular text-xs font-medium text-ink">{value.toFixed(2)}</span>
    </span>
  );
}
