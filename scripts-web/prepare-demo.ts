/**
 * Prepares the working database for a live demo (idempotent, safe to re-run):
 *   1. fills every NULL embedding (food names, recipient needs, recent listings) with the local MiniLM model;
 *   2. publishes a few SYNTHETIC surplus listings that are open right now, so the recipient feed is not empty
 *      (the Part 1 seed only contains listings that have already expired);
 *   3. files two pending claims so the approval workflow can be shown immediately.
 * Run:  npm run demo:prepare
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

const { backfillEmbeddings, embeddingCoverage } = await import("../src/lib/db/repositories/name-resolution");
const { createListing } = await import("../src/lib/db/repositories/surplus");
const { createClaim } = await import("../src/lib/db/repositories/claims");
const { query } = await import("../src/lib/db/postgres");
const { closePool } = await import("../src/lib/db/postgres");

const SAMPLES = [
  "Cooked vegetable pulao with raita - vegetarian, no onion or garlic, packed in sealed trays (synthetic demo listing)",
  "Steamed rice and dal tadka, vegetarian, freshly cooked at lunch service (synthetic demo listing)",
  "Chapati and mixed vegetable curry, vegetarian, wrapped in foil portions (synthetic demo listing)",
  "Plain cooked rice and boiled eggs, suitable for animal shelters (synthetic demo listing)",
  "Vegetable peels, spoiled tomatoes and fruit trimmings for composting (synthetic demo listing)",
  "Chicken biryani, non-vegetarian, cooked this evening, individual packs (synthetic demo listing)",
];

console.log("Embedding backfill ...");
console.log("  done:", await backfillEmbeddings());

const estabs = await query<{ establishment_id: number }>(
  `SELECT e.establishment_id FROM establishment e JOIN establishment_category c USING (category_id)
    WHERE e.is_active AND c.kind IN ('COMMERCIAL','EDUCATIONAL','ORGANIZATIONAL') ORDER BY e.establishment_id LIMIT ${SAMPLES.length}`,
);
const now = Date.now();
const created: number[] = [];
for (const [i, e] of estabs.entries()) {
  const description = SAMPLES[i % SAMPLES.length]!;
  const exists = await query("SELECT 1 FROM surplus_listing WHERE establishment_id = $1 AND description = $2 AND expires_at > now()", [e.establishment_id, description]);
  if (exists.length) continue;
  const cooked = !/peels/.test(description);
  const { listingId } = await createListing(e.establishment_id, {
    description,
    offeredQtyKg: [12, 8, 15, 6, 20, 10][i % 6]!,
    isCooked: cooked,
    isVegetarian: !/chicken|egg/i.test(description),
    availableFrom: new Date(now - 30 * 60_000).toISOString(),
    expiresAt: new Date(now + (6 + i) * 3_600_000).toISOString(),
  });
  created.push(listingId);
}
console.log(`Published ${created.length} live synthetic listing(s):`, created);

// Two pending claims (idempotent through the unique (listing, recipient) constraint).
const open = await query<{ listing_id: number }>("SELECT listing_id FROM surplus_listing WHERE status = 'OPEN' AND expires_at > now() AND is_cooked ORDER BY listing_id DESC LIMIT 2");
const fakeUser = { userId: 0, role: "RECIPIENT_AGENT" } as never;
for (const [i, l] of open.entries()) {
  try {
    await createClaim(fakeUser, i + 1, { listingId: l.listing_id, claimedQtyKg: 3 });
    console.log(`Filed a pending claim by recipient ${i + 1} on listing ${l.listing_id}`);
  } catch (err) {
    console.log(`  (claim on listing ${l.listing_id} skipped: ${(err as Error).message})`);
  }
}
console.log("Coverage:", await embeddingCoverage());
await closePool();
process.exit(0);
