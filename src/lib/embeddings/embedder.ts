import "server-only";
import path from "node:path";

/**
 * Local sentence embeddings: sentence-transformers/all-MiniLM-L6-v2 (384-dim, cosine) run through ONNX
 * Runtime in Node via @huggingface/transformers. No API key, no network at query time. The model weights
 * (~23 MB, int8-quantised) are downloaded once on first use into `.cache/models` (git-ignored).
 *
 * Limitation: this is a small general-purpose English model. It is good at paraphrase and typo-level
 * similarity ("Panner Butter Masala" ~ "Paneer Butter Masala") and weak at abbreviations and unrelated
 * synonyms ("PBM", "Roti" vs "Chapati"); that is why the name cascade tries exact/alias/trigram first.
 */
export const EMBEDDING_DIM = 384;
export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

export class EmbeddingUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Embedding model unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "EmbeddingUnavailableError";
  }
}

type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;
const g = globalThis as unknown as { __zonefoodExtractor?: Promise<Extractor>; __zonefoodEmbedCache?: Map<string, number[]> };

function extractor(): Promise<Extractor> {
  if (!g.__zonefoodExtractor) {
    g.__zonefoodExtractor = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = path.join(process.cwd(), ".cache", "models");
      return (await pipeline("feature-extraction", MODEL_ID, { dtype: "q8" })) as unknown as Extractor;
    })().catch((err) => {
      g.__zonefoodExtractor = undefined; // allow a retry on the next call
      throw new EmbeddingUnavailableError(err);
    });
  }
  return g.__zonefoodExtractor;
}

const cache = (g.__zonefoodEmbedCache ??= new Map<string, number[]>());

/** Embeds many texts (unit-length vectors). Repeats are served from a small in-process cache. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const clean = texts.map((t) => t.trim().slice(0, 2000) || " ");
  const missing = [...new Set(clean.filter((t) => !cache.has(t)))];
  if (missing.length) {
    const ex = await extractor();
    for (let i = 0; i < missing.length; i += 32) {
      const batch = missing.slice(i, i + 32);
      const vectors = (await ex(batch, { pooling: "mean", normalize: true })).tolist();
      batch.forEach((t, j) => cache.set(t, vectors[j] as number[]));
    }
    if (cache.size > 2000) for (const k of [...cache.keys()].slice(0, cache.size - 2000)) cache.delete(k);
  }
  return clean.map((t) => cache.get(t) as number[]);
}

export async function embedText(text: string): Promise<number[]> {
  return (await embedTexts([text]))[0] as number[];
}

/** pgvector text literal, e.g. '[0.1,0.2,...]' - bound as a parameter and cast with `$1::vector`. */
export const toVectorLiteral = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(",")}]`;

/** Best-effort: returns a vector literal, or null if the model cannot be loaded (caller stores NULL; backfill fixes it later). */
export async function tryEmbedLiteral(text: string): Promise<string | null> {
  try {
    return toVectorLiteral(await embedText(text));
  } catch (err) {
    if (err instanceof EmbeddingUnavailableError) return null;
    throw err;
  }
}
