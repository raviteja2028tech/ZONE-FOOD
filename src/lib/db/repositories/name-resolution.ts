import "server-only";
import { query, queryOne } from "@/lib/db/postgres";
import { CACHE_MIN_CONFIDENCE, decideResolution, normaliseName, type Candidate, type Resolution } from "@/lib/domain/names";
import { EmbeddingUnavailableError, embedText, toVectorLiteral } from "@/lib/embeddings/embedder";
import { round4 } from "@/lib/domain/matching";

/** SQL form of normaliseName() so canonical names are compared on equal terms with the normalised raw name. */
const NORM_SQL = "btrim(regexp_replace(regexp_replace(lower(canonical_name), '\\([^)]*\\)', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'))";

interface Stages {
  normalised: string;
  exact: Candidate | null;
  alias: (Candidate & { confidence: number }) | null;
  trigram: Candidate[];
  vector: Candidate[];
  vectorAvailable: boolean;
}

async function gather(raw: string): Promise<Stages> {
  const normalised = normaliseName(raw);

  const exactRow = await queryOne<{ food_id: number; canonical_name: string }>(
    `SELECT food_id, canonical_name FROM food_item WHERE lower(canonical_name) = lower(btrim($1)) OR ${NORM_SQL} = $2 LIMIT 1`,
    [raw, normalised],
  );
  const aliasRow = await queryOne<{ food_id: number; canonical_name: string; confidence: string }>(
    `SELECT fa.food_id, fi.canonical_name, fa.confidence FROM food_alias fa JOIN food_item fi ON fi.food_id = fa.food_id
      WHERE fa.raw_name_norm = $1 AND fa.status = 'RESOLVED'`,
    [normalised],
  );
  const tri = await query<{ food_id: number; canonical_name: string; s: string }>(
    `SELECT food_id, canonical_name, similarity(${NORM_SQL}, $1) AS s FROM food_item ORDER BY s DESC, canonical_name LIMIT 3`,
    [normalised],
  );

  let vector: Candidate[] = [];
  let vectorAvailable = true;
  try {
    const literal = toVectorLiteral(await embedText(normalised));
    const rows = await query<{ food_id: number; canonical_name: string; s: string }>(
      `SELECT food_id, canonical_name, 1 - (name_embedding <=> $1::vector) AS s FROM food_item
        WHERE name_embedding IS NOT NULL ORDER BY name_embedding <=> $1::vector LIMIT 3`,
      [literal],
    );
    vector = rows.map((r) => ({ foodId: r.food_id, name: r.canonical_name, score: round4(Number(r.s)) }));
    if (!rows.length) vectorAvailable = false; // no stored name embeddings yet
  } catch (err) {
    if (!(err instanceof EmbeddingUnavailableError)) throw err;
    vectorAvailable = false;
  }

  return {
    normalised,
    exact: exactRow ? { foodId: exactRow.food_id, name: exactRow.canonical_name, score: 1 } : null,
    alias: aliasRow ? { foodId: aliasRow.food_id, name: aliasRow.canonical_name, score: Number(aliasRow.confidence), confidence: Number(aliasRow.confidence) } : null,
    trigram: tri.map((r) => ({ foodId: r.food_id, name: r.canonical_name, score: round4(Number(r.s)) })),
    vector,
    vectorAvailable,
  };
}

export interface ExplainedResolution {
  input: string;
  normalised: string;
  resolution: Resolution;
  stages: { exact: Candidate | null; alias: Candidate | null; trigram: Candidate[]; vector: Candidate[] };
  vectorAvailable: boolean;
}

/** Runs the full cascade WITHOUT writing anything; used by the "Name matching" page to show every stage's candidates. */
export async function explainFoodName(raw: string): Promise<ExplainedResolution> {
  const s = await gather(raw);
  const resolution = decideResolution({ exact: s.exact, alias: s.alias, trigram: s.trigram[0] ?? null, vector: s.vector[0] ?? null });
  return { input: raw, normalised: s.normalised, resolution, stages: { exact: s.exact, alias: s.alias, trigram: s.trigram, vector: s.vector }, vectorAvailable: s.vectorAvailable };
}

/**
 * Resolves a raw food name for the ETL and LEARNS from the outcome: a trigram/vector hit is cached in food_alias
 * (so the next occurrence is an O(1) lookup), a miss is recorded as UNRESOLVED for human review.
 */
export async function resolveFoodName(raw: string): Promise<Resolution> {
  const { resolution, normalised } = await (async () => {
    const e = await explainFoodName(raw);
    return { resolution: e.resolution, normalised: e.normalised };
  })();
  if (!normalised) return resolution;

  if (resolution.method === "ALIAS") {
    await query("UPDATE food_alias SET hit_count = hit_count + 1, last_seen_at = now() WHERE raw_name_norm = $1", [normalised]);
  } else if ((resolution.method === "TRIGRAM" || resolution.method === "VECTOR") && resolution.confidence >= CACHE_MIN_CONFIDENCE) {
    // Only confident fuzzy matches are cached; a weak guess must not become a permanent alias.
    await query(
      `INSERT INTO food_alias (raw_name_norm, food_id, confidence, method, status) VALUES ($1, $2, $3, $4, 'RESOLVED')
       ON CONFLICT (raw_name_norm) DO UPDATE SET food_id = EXCLUDED.food_id, confidence = EXCLUDED.confidence,
         method = EXCLUDED.method, status = 'RESOLVED', hit_count = food_alias.hit_count + 1, last_seen_at = now()`,
      [normalised, resolution.foodId, Math.min(1, resolution.confidence), resolution.method],
    );
  } else if (resolution.method === "NONE") {
    await query(
      `INSERT INTO food_alias (raw_name_norm, food_id, confidence, method, status) VALUES ($1, NULL, NULL, 'NONE', 'UNRESOLVED')
       ON CONFLICT (raw_name_norm) DO UPDATE SET hit_count = food_alias.hit_count + 1, last_seen_at = now()
         WHERE food_alias.status = 'UNRESOLVED'`,
      [normalised],
    );
  }
  return resolution;
}

export const listAliases = (status: "RESOLVED" | "UNRESOLVED", limit = 25) =>
  query<{ raw_name_norm: string; food_name: string | null; confidence: string | null; method: string; hit_count: number; last_seen_at: string }>(
    `SELECT fa.raw_name_norm, fi.canonical_name AS food_name, fa.confidence, fa.method, fa.hit_count, fa.last_seen_at
       FROM food_alias fa LEFT JOIN food_item fi ON fi.food_id = fa.food_id
      WHERE fa.status = $1 ORDER BY fa.hit_count DESC, fa.last_seen_at DESC LIMIT $2`,
    [status, limit],
  );

/* ----------------------------------------------------------------------- embedding backfill */

export interface EmbeddingCoverage {
  table: string;
  column: string;
  total: number;
  embedded: number;
}

export async function embeddingCoverage(): Promise<EmbeddingCoverage[]> {
  const row = await queryOne<Record<string, number>>(
    `SELECT (SELECT count(*) FROM food_item)::int AS f, (SELECT count(name_embedding) FROM food_item)::int AS fe,
            (SELECT count(*) FROM recipient_org)::int AS r, (SELECT count(need_embedding) FROM recipient_org)::int AS re,
            (SELECT count(*) FROM surplus_listing WHERE expires_at > now() - interval '1 day')::int AS l,
            (SELECT count(desc_embedding) FROM surplus_listing WHERE expires_at > now() - interval '1 day')::int AS le`,
  );
  return [
    { table: "food_item", column: "name_embedding", total: row?.f ?? 0, embedded: row?.fe ?? 0 },
    { table: "recipient_org", column: "need_embedding", total: row?.r ?? 0, embedded: row?.re ?? 0 },
    { table: "surplus_listing (live + last 24h)", column: "desc_embedding", total: row?.l ?? 0, embedded: row?.le ?? 0 },
  ];
}

/** Fills NULL embeddings. Idempotent: only rows still NULL are touched, so re-running after a failure is safe. */
export async function backfillEmbeddings(): Promise<{ foods: number; recipients: number; listings: number }> {
  const { embedTexts } = await import("@/lib/embeddings/embedder");

  const foods = await query<{ id: number; t: string }>("SELECT food_id AS id, canonical_name AS t FROM food_item WHERE name_embedding IS NULL");
  const recipients = await query<{ id: number; t: string }>("SELECT recipient_id AS id, need_profile AS t FROM recipient_org WHERE need_embedding IS NULL");
  const listings = await query<{ id: number; t: string }>(
    `SELECT listing_id AS id, description AS t FROM surplus_listing
      WHERE desc_embedding IS NULL AND expires_at > now() - interval '1 day' ORDER BY listing_id DESC LIMIT 5000`,
  );

  const apply = async (rows: { id: number; t: string }[], sql: string) => {
    for (let i = 0; i < rows.length; i += 64) {
      const chunk = rows.slice(i, i + 64);
      const vectors = await embedTexts(chunk.map((r) => r.t));
      for (let j = 0; j < chunk.length; j++) await query(sql, [toVectorLiteral(vectors[j] as number[]), chunk[j]!.id]);
    }
    return rows.length;
  };
  return {
    foods: await apply(foods, "UPDATE food_item SET name_embedding = $1::vector WHERE food_id = $2 AND name_embedding IS NULL"),
    recipients: await apply(recipients, "UPDATE recipient_org SET need_embedding = $1::vector WHERE recipient_id = $2 AND need_embedding IS NULL"),
    listings: await apply(listings, "UPDATE surplus_listing SET desc_embedding = $1::vector WHERE listing_id = $2 AND desc_embedding IS NULL"),
  };
}
