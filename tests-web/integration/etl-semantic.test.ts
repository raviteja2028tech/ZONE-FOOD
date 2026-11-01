import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { closePool, query, queryOne } from "@/lib/db/postgres";
import { closeMongo, getMongoDb } from "@/lib/db/mongo";
import { GET as submissionsGet, POST as submissionsPost } from "@/app/api/submissions/route";
import { GET as etlGet } from "@/app/api/etl/route";
import { POST as etlSync } from "@/app/api/etl/sync/route";
import { POST as etlRetry } from "@/app/api/etl/retry/[id]/route";
import { POST as matchName } from "@/app/api/matching/name/route";
import { GET as embedGet } from "@/app/api/embeddings/route";
import { POST as backfillPost } from "@/app/api/embeddings/backfill/route";
import { GET as inspectionsGet, POST as inspectionsPost } from "@/app/api/inspections/route";
import { backfillEmbeddings, resolveFoodName } from "@/lib/db/repositories/name-resolution";
import { call, count, sessionFor } from "./helpers";

type Session = Awaited<ReturnType<typeof sessionFor>>;
let admin: Session, auditor: Session, commercial: Session, residential: Session, educational: Session;
let today: string;

const KIND = (k: string) => `establishment_id IN (SELECT e.establishment_id FROM establishment e JOIN establishment_category c USING (category_id) WHERE c.kind = '${k}')`;

beforeAll(async () => {
  await backfillEmbeddings();
  today = (await queryOne<{ d: string }>("SELECT CURRENT_DATE::text AS d"))!.d;
  admin = await sessionFor("ZONE_ADMIN");
  auditor = await sessionFor("AUDITOR");
  commercial = await sessionFor("ESTAB_STAFF", KIND("COMMERCIAL"));
  residential = await sessionFor("ESTAB_MANAGER", KIND("RESIDENTIAL"));
  educational = await sessionFor("ESTAB_STAFF", KIND("EDUCATIONAL"));
});
afterAll(async () => {
  await closePool();
  await closeMongo();
});

const submit = (s: Session, payload: unknown, serviceDate = today) => call(submissionsPost, { method: "POST", cookie: s.cookie, body: { serviceDate, payload } });

describe("MongoDB submissions: genuinely different document shapes", () => {
  it("stores restaurant, household and college logs with different structures and reads them back", async () => {
    const r1 = await submit(commercial, { slot: "DINNER", covers_served: 80, dish_waste: [{ dish_name: "Panner Butter Masala", portions_prepared: 40, portions_sold: 35, returned_plates: 6, avg_plate_leftover_g: 90 }], buffet_counter_leftovers_kg: 2.5 });
    const r2 = await submit(residential, { bins: { vegetable_peels_kg: 3.2, cooked_leftovers_kg: 1.1 }, segregated: true, free_text: "festival leftovers" });
    const r3 = await submit(educational, { meal_slot: "LUNCH", headcount: { present: 300, guests: 4 }, counters: [{ counter: "Counter 1", plates_served: 280, leftover_kg: 6.5 }, { counter: "Counter 2", plates_served: 100, leftover_kg: 2 }] });
    for (const r of [r1, r2, r3]) {
      expect(r.status).toBe(201);
      expect(r.body.data.id).toMatch(/^[0-9a-f]{24}$/);
    }
    const db = await getMongoDb();
    const docs = await db.collection("waste_submissions").find({ _id: { $in: [r1, r2, r3].map((r) => new ObjectId(r.body.data.id)) } }).toArray();
    expect(docs).toHaveLength(3);
    const shapes = new Set(docs.map((d) => Object.keys(d.payload).sort().join(",")));
    expect(shapes.size).toBe(3); // three different payload key-sets in ONE collection
    expect(docs.every((d) => d.sync_status === "PENDING")).toBe(true);

    const list = await call(submissionsGet, { cookie: commercial.cookie });
    expect(list.status).toBe(200);
    for (const d of list.body.data.docs) expect(d.establishment_id).toBe(commercial.establishmentId); // tenant scoped
    expect(list.body.data.stats.pending).toBeGreaterThan(0);
  });

  it("validates the payload for the establishment's kind and the date; refuses the wrong role", async () => {
    expect((await submit(commercial, { bins: { vegetable_peels_kg: 3 } })).status).toBe(422); // household shape sent by a restaurant
    expect((await submit(commercial, { dish_waste: [{ dish_name: "X", returned_plates: -4, avg_plate_leftover_g: 50 }] })).status).toBe(422);
    expect((await submit(residential, { bins: { vegetable_peels_kg: 1 }, segregated: true }, "2999-01-01")).status).toBe(422);
    expect((await call(submissionsPost, { method: "POST", cookie: auditor.cookie, body: { serviceDate: today, payload: {} } })).status).toBe(403);
    expect((await call(submissionsGet, { cookie: (await sessionFor("RECIPIENT_AGENT")).cookie })).status).toBe(403);
  });

  it("stores variable-structure inspection reports (manager: own establishment only; auditor: read-only)", async () => {
    const mgr = await sessionFor("ESTAB_MANAGER", KIND("COMMERCIAL"));
    const v1 = { sections: [{ name: "Kitchen hygiene", items: [{ item: "Handwash station stocked", status: "PASS" }] }] };
    const v2 = { sections: [...v1.sections, { name: "Cold chain", items: [{ item: "Fridge temperature logged", status: "FAIL", reading_c: 9.5, note: "above limit" }] }], inspectorNotes: "Re-check next week" };
    expect((await call(inspectionsPost, { method: "POST", cookie: mgr.cookie, body: v1 })).status).toBe(201);
    expect((await call(inspectionsPost, { method: "POST", cookie: mgr.cookie, body: { ...v2, establishmentId: 99999 } })).status).toBe(201); // body id ignored: pinned to own establishment
    const mine = await call(inspectionsGet, { cookie: mgr.cookie });
    for (const d of mine.body.data) expect(d.establishment_id).toBe(mgr.establishmentId);
    expect(new Set(mine.body.data.map((d: { sections: unknown[] }) => d.sections.length)).size).toBeGreaterThan(1); // different structures
    expect((await call(inspectionsPost, { method: "POST", cookie: auditor.cookie, body: v1 })).status).toBe(403);
    expect((await call(inspectionsGet, { cookie: auditor.cookie })).status).toBe(200);
  });
});

describe("ETL: MongoDB -> PostgreSQL", () => {
  let docId: string;
  let reportId: number;

  it("imports a PENDING document into waste_event with lineage, trigger-derived cost and resolved names", async () => {
    const r = await submit(commercial, { slot: "LUNCH", dish_waste: [{ dish_name: "Panner Butter Masala", returned_plates: 10, avg_plate_leftover_g: 100 }, { dish_name: "VEG. BIRYANI", returned_plates: 5, avg_plate_leftover_g: 100 }], buffet_counter_leftovers_kg: 2 });
    docId = r.body.data.id;
    const run = await call(etlSync, { method: "POST", cookie: admin.cookie, body: { mode: "PENDING", limit: 500 } });
    expect(run.status).toBe(200);
    reportId = run.body.data.runId;
    expect(run.body.data.synced).toBeGreaterThan(0);
    expect(run.body.data.rowsWritten).toBeGreaterThan(0);

    const doc = await (await getMongoDb()).collection("waste_submissions").findOne({ _id: new ObjectId(docId) });
    expect(doc!.sync_status).toBe("SYNCED");
    expect(doc!.sql_waste_ids).toHaveLength(3); // 2 dishes + buffet counter
    const rows = await query<{ food_name: string | null; quantity_kg: string; cost_estimate: string | null; stage: string }>(
      "SELECT f.canonical_name AS food_name, w.quantity_kg, w.cost_estimate, w.stage FROM waste_event w LEFT JOIN food_item f USING (food_id) WHERE w.source_doc_id = $1 ORDER BY w.waste_id",
      [docId],
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]!.food_name).toBe("Paneer Butter Masala"); // "Panner" typo resolved
    expect(Number(rows[0]!.quantity_kg)).toBeCloseTo(1, 3); // 10 plates x 100 g
    expect(Number(rows[0]!.cost_estimate)).toBeGreaterThan(0); // filled by the DB trigger, not the app
    expect(rows[1]!.food_name).toBe("Veg Biryani"); // "VEG. BIRYANI" normalised to an exact match
    expect(rows[2]!.food_name).toBeNull(); // buffet leftovers have no food name
    const log = await queryOne<{ docs_synced: number; rows_written: number }>("SELECT docs_synced, rows_written FROM etl_run_log WHERE run_id = $1", [reportId]);
    expect(log!.docs_synced).toBe(run.body.data.synced);
  });

  it("is idempotent: a second run writes nothing, and a crash-recovery re-sync creates no duplicates", async () => {
    const before = await count("SELECT count(*) AS n FROM waste_event WHERE source_doc_id IS NOT NULL");
    const again = await call(etlSync, { method: "POST", cookie: admin.cookie, body: { mode: "PENDING", limit: 500 } });
    expect(again.body.data.rowsWritten).toBe(0);
    expect(await count("SELECT count(*) AS n FROM waste_event WHERE source_doc_id IS NOT NULL")).toBe(before);

    // Simulate "PostgreSQL committed, then the process died before updating MongoDB".
    const db = await getMongoDb();
    await db.collection("waste_submissions").updateOne({ _id: new ObjectId(docId) }, { $set: { sync_status: "PENDING" }, $unset: { sql_waste_ids: "", synced_at: "" } });
    const retry = await call(etlSync, { method: "POST", cookie: admin.cookie, body: { mode: "PENDING", limit: 500 } });
    expect(retry.body.data.skipped).toBe(1);
    expect(retry.body.data.rowsWritten).toBe(0);
    expect(await count("SELECT count(*) AS n FROM waste_event WHERE source_doc_id = $1", [docId])).toBe(3);
    const doc = await db.collection("waste_submissions").findOne({ _id: new ObjectId(docId) });
    expect(doc).toMatchObject({ sync_status: "SYNCED" });
    expect(doc!.sql_waste_ids).toHaveLength(3);
  });

  it("marks bad documents FAILED with a safe error, writes nothing for them, and supports retry after a fix", async () => {
    const db = await getMongoDb();
    const bad = await db.collection("waste_submissions").insertOne({
      establishment_id: commercial.establishmentId,
      estab_kind: "COMMERCIAL",
      service_date: today,
      submitted_at: new Date(),
      sync_status: "PENDING",
      payload: { dish_waste: [{ dish_name: "Dal Tadka", returned_plates: "lots", avg_plate_leftover_g: 50 }] },
    });
    const id = String(bad.insertedId);
    const run = await call(etlSync, { method: "POST", cookie: admin.cookie, body: { mode: "PENDING", limit: 500 } });
    expect(run.body.data.failed).toBeGreaterThanOrEqual(1);
    let doc = await db.collection("waste_submissions").findOne({ _id: bad.insertedId });
    expect(doc).toMatchObject({ sync_status: "FAILED", sync_attempts: 1 });
    expect(doc!.sync_error).toMatch(/not a positive number/);
    expect(await count("SELECT count(*) AS n FROM waste_event WHERE source_doc_id = $1", [id])).toBe(0);

    const status = await call(etlGet, { cookie: auditor.cookie }); // auditors may look but not touch
    expect(status.status).toBe(200);
    expect(status.body.data.failed.some((f: { id: string }) => f.id === id)).toBe(true);
    expect((await call(etlRetry, { method: "POST", cookie: auditor.cookie, params: { id } })).status).toBe(403);

    const stillBad = await call(etlRetry, { method: "POST", cookie: admin.cookie, params: { id } });
    expect(stillBad.status).toBe(200);
    expect(stillBad.body.data.failed).toBe(1);
    doc = await db.collection("waste_submissions").findOne({ _id: bad.insertedId });
    expect(doc!.sync_attempts).toBe(2);

    await db.collection("waste_submissions").updateOne({ _id: bad.insertedId }, { $set: { "payload.dish_waste.0.returned_plates": 4 } });
    const fixed = await call(etlRetry, { method: "POST", cookie: admin.cookie, params: { id } });
    expect(fixed.body.data.synced).toBe(1);
    expect(await count("SELECT count(*) AS n FROM waste_event WHERE source_doc_id = $1", [id])).toBe(1);
    expect((await call(etlRetry, { method: "POST", cookie: admin.cookie, params: { id } })).status).toBe(409); // already synced
  });

  it("two overlapping runs never process the same document twice (lease)", async () => {
    const db = await getMongoDb();
    const ids: ObjectId[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await db.collection("waste_submissions").insertOne({
        establishment_id: residential.establishmentId, estab_kind: "RESIDENTIAL", service_date: today, submitted_at: new Date(Date.now() + i),
        sync_status: "PENDING", payload: { bins: { vegetable_peels_kg: 1 + i }, segregated: true },
      });
      ids.push(r.insertedId);
    }
    await Promise.all([call(etlSync, { method: "POST", cookie: admin.cookie, body: { limit: 500 } }), call(etlSync, { method: "POST", cookie: admin.cookie, body: { limit: 500 } })]);
    for (const id of ids) expect(await count("SELECT count(*) AS n FROM waste_event WHERE source_doc_id = $1", [String(id)])).toBe(1);
  });
});

/** (messy variant -> canonical) pairs taken from the Part 1 seed catalogue. */
const PAIRS: [string, string][] = [
  ["Veg Biriyani", "Veg Biryani"], ["veg biryani", "Veg Biryani"], ["VEG. BIRYANI", "Veg Biryani"], ["Vegetable Biryani", "Veg Biryani"], ["Veg Biriyani (Special)", "Veg Biryani"],
  ["Chicken Biriyani", "Chicken Biryani"], ["chicken biryani", "Chicken Biryani"], ["CHKN BIRYANI", "Chicken Biryani"], ["Chicken Dum Biryani", "Chicken Biryani"],
  ["paneer butter masala", "Paneer Butter Masala"], ["Panner Butter Masala", "Paneer Butter Masala"], ["PBM", "Paneer Butter Masala"],
  ["dal tadka", "Dal Tadka"], ["Daal Tadka", "Dal Tadka"], ["Dhal Tadka", "Dal Tadka"],
  ["masala dosai", "Masala Dosa"], ["Masala Dosa (Plain)", "Masala Dosa"], ["MASALA DOSA", "Masala Dosa"],
  ["plain rice", "Steamed Rice"], ["White Rice", "Steamed Rice"], ["STEAMED RICE", "Steamed Rice"],
  ["chapathi", "Chapati"], ["Chappathi", "Chapati"], ["Roti", "Chapati"],
  ["mixed vegetable curry", "Mixed Veg Curry"], ["Mix Veg", "Mixed Veg Curry"], ["MIXED VEG CURRY", "Mixed Veg Curry"],
  ["channa masala", "Chole Masala"], ["Chana Masala", "Chole Masala"],
  ["jeera rice", "Jeera Rice"], ["Cumin Rice", "Jeera Rice"], ["JEERA RICE", "Jeera Rice"],
];

describe("semantic name matching (pgvector + trigram cascade)", () => {
  it("all four embedding columns' coverage reaches 100% after the idempotent backfill", async () => {
    const before = await call(embedGet, { cookie: admin.cookie });
    expect(before.status).toBe(200);
    const done = await call(backfillPost, { method: "POST", cookie: admin.cookie, body: {} });
    expect(done.status).toBe(200);
    for (const c of done.body.data.coverage) expect(c.embedded).toBe(c.total);
    const second = await call(backfillPost, { method: "POST", cookie: admin.cookie, body: {} });
    expect(second.body.data.done).toEqual({ foods: 0, recipients: 0, listings: 0 }); // nothing left to do
    expect((await call(backfillPost, { method: "POST", cookie: commercial.cookie, body: {} })).status).toBe(403);
    const v = await queryOne<{ dims: number }>("SELECT vector_dims(name_embedding) AS dims FROM food_item LIMIT 1");
    expect(v!.dims).toBe(384);
  });

  it("explains every stage of the cascade and resolves typos, case and punctuation", async () => {
    const ex = async (name: string) => (await call(matchName, { method: "POST", cookie: commercial.cookie, body: { name } })).body.data;
    const typo = await ex("Panner Butter Masala");
    expect(typo.resolution.name).toBe("Paneer Butter Masala");
    expect(["ALIAS", "TRIGRAM"]).toContain(typo.resolution.method); // ALIAS once the earlier ETL run has learned it
    expect(typo.stages.trigram[0].name).toBe("Paneer Butter Masala");
    expect(typo.stages.vector[0].name).toBe("Paneer Butter Masala"); // the vector stage independently agrees
    expect(typo.vectorAvailable).toBe(true);
    expect((await ex("VEG. BIRYANI")).resolution).toMatchObject({ name: "Veg Biryani", method: "EXACT" });
    expect((await ex("completely unrelated gadget")).resolution.method).toBe("NONE");
    expect((await call(matchName, { method: "POST", cookie: commercial.cookie, body: { name: "" } })).status).toBe(422);
    expect((await call(matchName, { method: "POST", cookie: (await sessionFor("RECIPIENT_AGENT")).cookie, body: { name: "rice" } })).status).toBe(403);
  });

  it("learns: a fuzzy hit is cached in food_alias and answered from the cache next time; misses are queued for review", async () => {
    const first = await resolveFoodName("Daal Tadka");
    expect(first.foodId).not.toBeNull();
    const alias = await queryOne<{ method: string; status: string }>("SELECT method, status FROM food_alias WHERE raw_name_norm = 'daal tadka'");
    expect(alias).toMatchObject({ status: "RESOLVED" });
    const second = await resolveFoodName("Daal Tadka");
    expect(second.method).toBe("ALIAS");
    await resolveFoodName("zzz qqq nonsense");
    expect((await queryOne<{ status: string }>("SELECT status FROM food_alias WHERE raw_name_norm = 'zzz qqq nonsense'"))!.status).toBe("UNRESOLVED");
  });

  it("measures accuracy on the seed's messy names (honest evaluation, not a guarantee)", async () => {
    let correct = 0;
    const misses: string[] = [];
    const methods: Record<string, number> = {};
    for (const [raw, canonical] of PAIRS) {
      const r = await resolveFoodName(raw);
      methods[r.method] = (methods[r.method] ?? 0) + 1;
      if (r.name === canonical) correct++;
      else misses.push(`${raw} -> ${r.name ?? "UNRESOLVED"} (${r.method})`);
    }
    const accuracy = correct / PAIRS.length;
    console.log(`name-matching accuracy ${correct}/${PAIRS.length} = ${(accuracy * 100).toFixed(0)}%  methods=${JSON.stringify(methods)}\n  misses: ${misses.join("; ")}`);
    expect(accuracy).toBeGreaterThanOrEqual(0.7);
    // Never a confident wrong answer for abbreviations the model cannot know: they must be unresolved or correct.
    const pbm = await resolveFoodName("PBM");
    expect([null, "Paneer Butter Masala"]).toContain(pbm.name);
  });
});
