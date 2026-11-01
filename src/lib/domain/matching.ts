/**
 * Surplus <-> recipient matching score (Master Plan B2.9). Hard constraints are applied in SQL BEFORE
 * ranking; this score only orders candidates that are already feasible:
 *
 *   score = 0.60 x cosine similarity  +  0.25 x capacity fit  +  0.15 x proximity
 */
export const WEIGHTS = { semantic: 0.6, capacity: 0.25, proximity: 0.15 } as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** pgvector's `<=>` is cosine DISTANCE; similarity = 1 - distance. */
export const similarityFromDistance = (distance: number) => clamp01(1 - distance);

/** 1 when the offer equals the recipient's daily capacity, falling off linearly as they diverge. */
export function capacityFit(offeredKg: number, dailyCapacityKg: number): number {
  if (dailyCapacityKg <= 0) return 0;
  return clamp01(1 - Math.abs(offeredKg - dailyCapacityKg) / dailyCapacityKg);
}

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 1 at distance 0, 0 at (or beyond) `maxKm`. */
export const proximityScore = (distanceKm: number, maxKm: number) => (maxKm <= 0 ? 1 : clamp01(1 - distanceKm / maxKm));

export interface ScoreParts {
  semantic: number | null; // null when an embedding is missing
  capacity: number;
  proximity: number;
}

export function hybridScore(p: ScoreParts): number {
  // A missing embedding contributes 0 rather than being invented; the UI shows "no semantic score".
  const sem = p.semantic ?? 0;
  return clamp01(WEIGHTS.semantic * sem + WEIGHTS.capacity * p.capacity + WEIGHTS.proximity * p.proximity);
}

export const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
