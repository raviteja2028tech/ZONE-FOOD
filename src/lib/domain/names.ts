/**
 * Food-name normalisation and the thresholds of the resolution cascade (Master Plan B2.8, step 3):
 *   1. exact match on canonical name (case-folded)          -> confidence 1.00
 *   2. food_alias cache hit                                  -> cached confidence
 *   3. trigram similarity > 0.45 on canonical_name           -> confidence = similarity
 *   4. vector KNN on name_embedding, accept if >= 0.72       -> confidence = 1 - cosine distance
 *   else unresolved -> food_id NULL and queued for review.
 */
export const TRIGRAM_THRESHOLD = 0.45;
export const VECTOR_THRESHOLD = 0.72;

/** Fuzzy matches below this confidence are used but NOT cached as aliases and are flagged for review. */
export const CACHE_MIN_CONFIDENCE = 0.6;

export type ResolutionMethod = "EXACT" | "ALIAS" | "TRIGRAM" | "VECTOR" | "NONE";

export interface Candidate {
  foodId: number;
  name: string;
  score: number;
}

export interface Resolution {
  foodId: number | null;
  name: string | null;
  confidence: number;
  method: ResolutionMethod;
}

/** Lower-case, strip punctuation and bracketed qualifiers, collapse whitespace: "VEG. BIRYANI (Special)" -> "veg biryani". */
export function normaliseName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Applies the cascade's thresholds to already-fetched candidates (pure, so the policy is unit-testable). */
export function decideResolution(input: {
  exact?: Candidate | null;
  alias?: (Candidate & { confidence: number }) | null;
  trigram?: Candidate | null;
  vector?: Candidate | null;
}): Resolution {
  const { exact, alias, trigram, vector } = input;
  if (exact) return { foodId: exact.foodId, name: exact.name, confidence: 1, method: "EXACT" };
  if (alias) return { foodId: alias.foodId, name: alias.name, confidence: alias.confidence, method: "ALIAS" };
  if (trigram && trigram.score > TRIGRAM_THRESHOLD) {
    return { foodId: trigram.foodId, name: trigram.name, confidence: trigram.score, method: "TRIGRAM" };
  }
  if (vector && vector.score >= VECTOR_THRESHOLD) {
    return { foodId: vector.foodId, name: vector.name, confidence: vector.score, method: "VECTOR" };
  }
  return { foodId: null, name: null, confidence: 0, method: "NONE" };
}
