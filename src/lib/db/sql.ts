import { AppError } from "@/lib/http/errors";

/** Business timezone of the synthetic locality; used for "expires at end of day" and pickup-window comparisons. */
export const APP_TZ = "Asia/Kolkata";

/** Listing status as seen NOW: stored status is only authoritative for CANCELLED; expiry is derived from the clock. */
export const EFFECTIVE_LISTING_STATUS = `
  CASE WHEN l.status = 'CANCELLED' THEN 'CANCELLED'
       WHEN l.claimed_qty_kg >= l.offered_qty_kg THEN 'FULLY_CLAIMED'
       WHEN l.expires_at <= now() THEN 'EXPIRED'
       WHEN l.claimed_qty_kg > 0 THEN 'PARTIALLY_CLAIMED'
       ELSE 'OPEN' END`;

export interface Page {
  page: number;
  pageSize: number;
  offset: number;
}

export function parsePage(params: { page?: string | string[]; pageSize?: string | string[] }, defaultSize = 20): Page {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(first(params.page))) || 1));
  const pageSize = Math.max(5, Math.min(100, Math.floor(Number(first(params.pageSize))) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export const paged = <T>(rows: T[], total: number, p: Page): Paged<T> => ({
  rows,
  total,
  page: p.page,
  pageSize: p.pageSize,
  pages: Math.max(1, Math.ceil(total / p.pageSize)),
});

/** Escapes % and _ so user text is matched literally inside LIKE/ILIKE. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Builds `$n` placeholders for a growing parameter list, keeping SQL text free of user values. */
export class Params {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

export const notFoundError = (what: string) => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const conflict = (message: string) => new AppError(409, "CONFLICT", message);
export const unprocessable = (message: string, details?: unknown) => new AppError(422, "RULE_VIOLATION", message, details);

/** pg returns NUMERIC as string; convert at the edge. */
export const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
