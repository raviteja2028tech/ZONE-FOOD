/** Display formatting (pure, shared by server and client components). Locale fixed to en-IN: the synthetic locality is Indian. */
const num = (v: number, max = 1) => v.toLocaleString("en-IN", { maximumFractionDigits: max, minimumFractionDigits: 0 });

export const fmtKg = (v: number | null | undefined, max = 1) => (v === null || v === undefined ? "-" : `${num(v, max)} kg`);
export const fmtNum = (v: number | null | undefined, max = 0) => (v === null || v === undefined ? "-" : num(v, max));
export const fmtInr = (v: number | null | undefined) => (v === null || v === undefined ? "-" : `₹${num(v, 0)}`);
export const fmtPct = (v: number, max = 0) => `${num(v, max)}%`;

const TZ = "Asia/Kolkata";
export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });

/** "in 3h 20m", "2d 4h ago" - compact countdown for expiries and recent events. */
export function fmtRelative(d: string | Date, now = Date.now()): string {
  const diff = new Date(d).getTime() - now;
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const body = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins % 60}m` : `${Math.max(mins, 1)}m`;
  return diff >= 0 ? `in ${body}` : `${body} ago`;
}

export const humanize = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** % change vs a previous period; null when there is nothing to compare against. */
export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
