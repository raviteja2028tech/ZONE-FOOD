import "server-only";
import { establishmentScope } from "@/lib/http/scope";
import type { SessionUser } from "@/lib/auth/guard";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Flattens Next.js searchParams (string | string[]) to first values and drops blanks. */
export async function readParams(sp: SearchParams): Promise<Record<string, string | undefined>> {
  const raw = await sp;
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    const first = Array.isArray(v) ? v[0] : v;
    out[k] = first && first.trim() !== "" ? first.trim() : undefined;
  }
  return out;
}

export const asInt = (v: string | undefined): number | undefined => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : undefined;
};

/** Same scoping rule as the API: establishment roles are pinned to their own establishment. */
export const pageScope = (user: SessionUser, requested?: string) => establishmentScope(user, asInt(requested));

export const isoDateOrUndef = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
