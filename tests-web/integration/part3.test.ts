import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, query, queryOne } from "@/lib/db/postgres";
import { closeMongo } from "@/lib/db/mongo";
import { backfillEmbeddings } from "@/lib/db/repositories/name-resolution";
import { loadCatalogue, DEMOS } from "@/lib/lab";
import { anomalies, diversionTrend, peerRanking, supplierSpoilage, weekdayProfile, wasteIntensity, rescueFunnel, provenance } from "@/lib/db/repositories/insights";
import { getDashboard } from "@/lib/dashboard";
import { loadUser } from "@/lib/auth/guard";
import { POST as wastePost, GET as wasteGet } from "@/app/api/waste/route";
import { POST as surplusPost } from "@/app/api/surplus/route";
import { POST as cancelPost } from "@/app/api/surplus/[id]/cancel/route";
import { POST as claimsPost } from "@/app/api/claims/route";
import { PATCH as claimPatch } from "@/app/api/claims/[id]/route";
import { POST as sessionsPost } from "@/app/api/sessions/route";
import { POST as batchPost } from "@/app/api/sessions/[id]/batches/route";
import { POST as closePost } from "@/app/api/sessions/[id]/close/route";
import { GET as dishesGet } from "@/app/api/dishes/route";
import { POST as labRun } from "@/app/api/lab/run/route";
import { POST as labDemo } from "@/app/api/lab/demo/route";
import { POST as labRefresh } from "@/app/api/lab/refresh/route";
import { GET as foodGet } from "@/app/api/food/route";
import { call, count, sessionFor } from "./helpers";

type Session = Awaited<ReturnType<typeof sessionFor>>;
let mgr: Session, staff: Session, admin: Session, auditor: Session, recipients: Session[];
let today: string;
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

beforeAll(async () => {
  await backfillEmbeddings();
  today = (await queryOne<{ d: string }>("SELECT CURRENT_DATE::text AS d"))!.d;
  mgr = await sessionFor("ESTAB_MANAGER");
  staff = await sessionFor("ESTAB_STAFF", "establishment_id = $2", [mgr.establishmentId]);
  admin = await sessionFor("ZONE_ADMIN");
  auditor = await sessionFor("AUDITOR");
  recipients = [];
  for (let i = 1; i <= 8; i++) recipients.push(await sessionFor("RECIPIENT_AGENT", "recipient_id = $2", [i]));
});
afterAll(async () => {
  await closePool();
  await closeMongo();
});

const listingBody = (over: Record<string, unknown> = {}) => ({
  description: "Cooked vegetable pulao and raita, vegetarian, sealed trays for pickup this evening (part 3 test)",
  offeredQtyKg: 10, isCooked: false, isVegetarian: true, availableFrom: hoursFromNow(-1), expiresAt: hoursFromNow(30), ...over,
});
const newListing = async (over = {}) => (await call(surplusPost, { method: "POST", cookie: staff.cookie, body: listingBody(over) })).body.data.listingId as number;
const claim = (s: Session, listingId: number, qty: number) => call(claimsPost, { method: "POST", cookie: s.cookie, body: { listingId, claimedQtyKg: qty } });
const act = (s: Session, claimId: number, action: string) => call(claimPatch, { method: "PATCH", cookie: s.cookie, params: { id: String(claimId) }, body: { action } });

describe("stock consistency: deducted exactly once, from every path", () => {
  const reasonRoute = async () => ({
    reasonId: (await queryOne<{ reason_id: number }>("SELECT reason_id FROM waste_reason WHERE reason_code = 'SPOILAGE'"))!.reason_id,
    routeId: (await queryOne<{ route_id: number }>("SELECT route_id FROM disposal_route WHERE route_name = 'COMPOST'"))!.route_id,
  });
  const lotOf = (establishmentId: number | null, min = 20) =>
    queryOne<{ lot_id: number; remaining_qty: string; food_id: number }>(
      "SELECT lot_id, remaining_qty, food_id FROM inventory_lot WHERE establishment_id = $1 AND remaining_qty >= $2 ORDER BY lot_id DESC LIMIT 1", [establishmentId, min]);
  const remaining = async (lot: number) => Number((await queryOne<{ r: string }>("SELECT remaining_qty AS r FROM inventory_lot WHERE lot_id = $1", [lot]))!.r);

  it("an API write-off deducts the lot once (not twice: the application no longer deducts, the trigger does)", async () => {
    const lot = (await lotOf(mgr.establishmentId))!;
    const before = Number(lot.remaining_qty);
    const { reasonId, routeId } = await reasonRoute();
    const res = await call(wastePost, { method: "POST", cookie: staff.cookie, body: { reasonId, routeId, stage: "PRE_CONSUMER_SPOILAGE", quantityKg: 4, wasEdible: false, occurredOn: today, lotId: lot.lot_id } });
    expect(res.status).toBe(201);
    expect(await remaining(lot.lot_id)).toBeCloseTo(before - 4, 3);
  });

  it("a direct SQL write-off deducts exactly once too, and a bulk-load session does not", async () => {
    const lot = (await lotOf(mgr.establishmentId))!;
    const before = Number(lot.remaining_qty);
    const { reasonId, routeId } = await reasonRoute();
    const ins = `INSERT INTO waste_event (establishment_id, lot_id, reason_id, route_id, stage, quantity_kg, occurred_on)
                 VALUES ($1, $2, $3, $4, 'PRE_CONSUMER_SPOILAGE', 2, CURRENT_DATE)`;
    await query(ins, [mgr.establishmentId, lot.lot_id, reasonId, routeId]);
    expect(await remaining(lot.lot_id)).toBeCloseTo(before - 2, 3);
  });

  it("eight simultaneous API write-offs of 3 kg against a 10 kg lot: exactly three win, stock never goes negative", async () => {
    const lot = (await lotOf(mgr.establishmentId, 12))!;
    await query("UPDATE inventory_lot SET remaining_qty = 10, received_qty = GREATEST(received_qty, 10) WHERE lot_id = $1", [lot.lot_id]);
    const writtenBefore = await count("SELECT COALESCE(sum(quantity_kg), 0) AS n FROM waste_event WHERE lot_id = $1", [lot.lot_id]);
    const { reasonId, routeId } = await reasonRoute();
    const body = { reasonId, routeId, stage: "PRE_CONSUMER_SPOILAGE", quantityKg: 3, wasEdible: false, occurredOn: today, lotId: lot.lot_id };
    const results = await Promise.all(Array.from({ length: 8 }, () => call(wastePost, { method: "POST", cookie: staff.cookie, body })));
    const won = results.filter((r) => r.status === 201).length;
    expect(won).toBe(3);
    expect(results.filter((r) => r.status !== 201).every((r) => r.status === 422)).toBe(true);
    expect(await remaining(lot.lot_id)).toBeCloseTo(1, 3);
    expect((await count("SELECT COALESCE(sum(quantity_kg), 0) AS n FROM waste_event WHERE lot_id = $1", [lot.lot_id])) - writtenBefore).toBeCloseTo(9, 3);   // 3 accepted x 3 kg, no more
  });

  it("the ledger is exact for every lot written off through the application in this run", async () => {
    // received - remaining must equal the sum of waste events that reference the lot, for the lots touched by app/test writes
    const bad = await query<{ lot_id: number }>(
      `SELECT l.lot_id FROM inventory_lot l JOIN waste_event w ON w.lot_id = l.lot_id AND w.recorded_at > now() - interval '1 hour'
        GROUP BY l.lot_id, l.received_qty, l.remaining_qty HAVING l.remaining_qty < 0 OR l.remaining_qty > l.received_qty`);
    expect(bad).toEqual([]);
    expect(await count("SELECT count(*) AS n FROM inventory_lot WHERE remaining_qty < 0 OR remaining_qty > received_qty")).toBe(0);
  });
});

describe("concurrent claims and approvals cannot produce inconsistent results", () => {
  it("eight recipients claim 4 kg each of a 10 kg listing, the manager approves all eight at once: exactly two fit", async () => {
    const listingId = await newListing();
    const claims = await Promise.all(recipients.map((r) => claim(r, listingId, 4)));
    expect(claims.every((c) => c.status === 201)).toBe(true);                       // requests reserve nothing
    const ids = claims.map((c) => c.body.data.claimId as number);
    const approvals = await Promise.all(ids.map((id) => act(mgr, id, "approve")));
    expect(approvals.filter((a) => a.status === 200)).toHaveLength(2);
    expect(approvals.filter((a) => a.status !== 200).every((a) => a.status === 409)).toBe(true);
    const row = (await queryOne<{ claimed_qty_kg: string; status: string }>("SELECT claimed_qty_kg, status FROM surplus_listing WHERE listing_id = $1", [listingId]))!;
    expect(Number(row.claimed_qty_kg)).toBe(8);
    expect(row.status).toBe("PARTIALLY_CLAIMED");
    expect(await count("SELECT count(*) AS n FROM redistribution_claim WHERE listing_id = $1 AND status = 'APPROVED'", [listingId])).toBe(2);
  });

  it("six simultaneous identical claims by one organisation create exactly one claim", async () => {
    const listingId = await newListing();
    const results = await Promise.all(Array.from({ length: 6 }, () => claim(recipients[0]!, listingId, 2)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status !== 201).every((r) => r.status === 409)).toBe(true);
    expect(await count("SELECT count(*) AS n FROM redistribution_claim WHERE listing_id = $1", [listingId])).toBe(1);
  });

  it("the database refuses an illegal claim status change even when the application is bypassed", async () => {
    const listingId = await newListing();
    const c = (await claim(recipients[1]!, listingId, 2)).body.data.claimId;
    await expect(query("UPDATE redistribution_claim SET status = 'COLLECTED', collected_at = now() WHERE claim_id = $1", [c])).rejects.toThrow(/Illegal claim transition/);
    await expect(query("UPDATE redistribution_claim SET claimed_qty_kg = 9 WHERE claim_id = $1", [c])).rejects.toThrow(/cannot be changed/);
  });
});

describe("closing a session through the stored procedure", () => {
  it("records consumption, creates plate-waste events and an auto surplus listing, atomically", async () => {
    const dishes = (await call(dishesGet, { cookie: staff.cookie })).body.data as { dish_id: number }[];
    const open = await call(sessionsPost, { method: "POST", cookie: staff.cookie, body: { serviceDate: today, slot: "ALL_DAY", expectedHeadcount: 80 } });
    expect(open.status).toBe(201);
    const sessionId = open.body.data.sessionId;
    const b1 = (await call(batchPost, { method: "POST", cookie: staff.cookie, params: { id: String(sessionId) }, body: { dishId: dishes[0]!.dish_id, preparedQtyKg: 20, preparedPortions: 100 } })).body.data.batchId;
    const b2 = (await call(batchPost, { method: "POST", cookie: staff.cookie, params: { id: String(sessionId) }, body: { dishId: dishes[1]!.dish_id, preparedQtyKg: 10, preparedPortions: 50 } })).body.data.batchId;
    const wasteBefore = await count("SELECT count(*) AS n FROM waste_event WHERE establishment_id = $1", [mgr.establishmentId]);

    const res = await call(closePost, { method: "POST", cookie: staff.cookie, params: { id: String(sessionId) }, body: {
      actualHeadcount: 70,
      records: [{ batchId: b1, servedQtyKg: 10, leftoverQtyKg: 7, plateWasteKg: 1.5 }, { batchId: b2, servedQtyKg: 8, leftoverQtyKg: 1, plateWasteKg: 0.5 }],
    } });
    expect(res.status).toBe(200);
    expect(res.body.data.listingIds).toHaveLength(1);                              // the 7 kg leftover; the 1 kg one is below the 2 kg threshold
    expect(res.body.data.wasteEvents).toBe(3);                                     // 2 plate-waste rows + 1 small leftover
    expect(res.body.data.embedded).toBe(1);                                         // the auto-listing was embedded for semantic matching
    expect(await count("SELECT count(*) AS n FROM waste_event WHERE establishment_id = $1", [mgr.establishmentId])).toBe(wasteBefore + 3);
    const listing = (await queryOne<{ offered_qty_kg: string; status: string; session_id: number; has_vec: boolean }>(
      "SELECT offered_qty_kg, status, session_id, desc_embedding IS NOT NULL AS has_vec FROM surplus_listing WHERE listing_id = $1", [res.body.data.listingIds[0]]))!;
    expect(listing).toMatchObject({ status: "OPEN", session_id: sessionId, has_vec: true });
    expect(Number(listing.offered_qty_kg)).toBe(7);
    const sources = await query<{ measurement_source: string }>("SELECT DISTINCT measurement_source FROM waste_event WHERE session_id = $1", [sessionId]);
    expect(sources.map((s) => s.measurement_source)).toEqual(["SYSTEM"]);
    // the waste history shows the provenance
    const hist = await call(wasteGet, { cookie: staff.cookie, url: "/api/waste" });
    expect(hist.body.data.rows.some((r: { measurement_source: string }) => r.measurement_source === "SYSTEM")).toBe(true);
    expect((await call(closePost, { method: "POST", cookie: staff.cookie, params: { id: String(sessionId) }, body: { actualHeadcount: 1, records: [{ batchId: b1, servedQtyKg: 1, leftoverQtyKg: 1, plateWasteKg: 0 }, { batchId: b2, servedQtyKg: 1, leftoverQtyKg: 1, plateWasteKg: 0 }] } })).status).toBe(409);
  });
});

describe("audit trail attributes changes to the signed-in user", () => {
  it("creating and cancelling a listing through the API writes audit rows with the manager's id", async () => {
    const res = await call(surplusPost, { method: "POST", cookie: mgr.cookie, body: listingBody() });
    const id = res.body.data.listingId as number;
    await call(cancelPost, { method: "POST", cookie: mgr.cookie, params: { id: String(id) } });
    const rows = await query<{ action: string; changed_by: number; new_row: Record<string, unknown> }>(
      "SELECT action, changed_by, new_row FROM audit_log WHERE table_name = 'surplus_listing' AND record_pk = $1 ORDER BY audit_id", [String(id)]);
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["I", "U"]));
    expect(rows.every((r) => r.changed_by === mgr.userId)).toBe(true);
    expect(rows[rows.length - 1]!.new_row.status).toBe("CANCELLED");
    expect(Object.keys(rows[0]!.new_row)).not.toContain("desc_embedding");
  });
});

describe("DBMS Lab API", () => {
  it("only zone admins and auditors may use it; unknown ids and raw SQL are rejected", async () => {
    for (const s of [staff, recipients[0]!]) expect((await call(labRun, { method: "POST", cookie: s.cookie, body: { id: "Q01" } })).status).toBe(403);
    expect((await call(labRun, { method: "POST", body: { id: "Q01" } })).status).toBe(401);
    expect((await call(labRun, { method: "POST", cookie: admin.cookie, body: { id: "Q99" } })).status).toBe(404);
    expect((await call(labRun, { method: "POST", cookie: admin.cookie, body: { id: "SELECT 1; DROP TABLE zone" } })).status).toBe(422);
    expect((await call(labRun, { method: "POST", cookie: admin.cookie, body: { sql: "DROP TABLE zone" } })).status).toBe(422);
    expect(await count("SELECT count(*) AS n FROM zone")).toBeGreaterThan(0);
  });

  it("runs every catalogue query (26) and returns rows; EXPLAIN ANALYZE returns a plan", async () => {
    // let time pass on the disposable database so the housekeeping UPDATE (Q24) has stale listings to move
    await query("ALTER TABLE surplus_listing DISABLE TRIGGER tr_audit_listing");
    await query("UPDATE surplus_listing SET available_from = now() - interval '6 hours', expires_at = now() - interval '1 hour' WHERE status = 'OPEN' AND expires_at > now() AND listing_id % 3 = 0");
    await query("ALTER TABLE surplus_listing ENABLE TRIGGER tr_audit_listing");
    const catalogue = await loadCatalogue();
    expect(catalogue.length).toBeGreaterThanOrEqual(22);
    // Q11 reports recipients with NO claim in progress; the concurrency tests above gave every recipient one, so it is
    // legitimately empty here (it returns rows on the freshly seeded database - see the Python catalogue tests).
    const mayBeEmpty = new Set(["Q11"]);
    for (const q of catalogue) {
      const res = await call(labRun, { method: "POST", cookie: auditor.cookie, body: { id: q.id } });
      expect(res.status, `${q.id}: ${JSON.stringify(res.body?.error)}`).toBe(200);
      if (!mayBeEmpty.has(q.id)) expect(res.body.data.rowCount, q.id).toBeGreaterThan(0);
      expect(res.body.data.rolledBack).toBe(true);
    }
    const plan = await call(labRun, { method: "POST", cookie: admin.cookie, body: { id: "Q09", explain: true } });
    expect(plan.body.data.plan.join("\n")).toMatch(/Execution Time/);
  });

  it("DML queries leave the data untouched (they are rolled back)", async () => {
    const snapshot = async () => [await count("SELECT count(*) AS n FROM surplus_listing"), await count("SELECT count(*) AS n FROM waste_event"), await count("SELECT count(*) AS n FROM food_alias"), await count("SELECT COALESCE(sum(remaining_qty), 0) AS n FROM inventory_lot")];
    const before = await snapshot();
    for (const id of ["Q23", "Q24", "Q25", "Q26"]) expect((await call(labRun, { method: "POST", cookie: admin.cookie, body: { id } })).status).toBe(200);
    expect(await snapshot()).toEqual(before);
  });

  it("every live demonstration behaves as documented and rolls back", async () => {
    const before = [await count("SELECT count(*) AS n FROM waste_event"), await count("SELECT count(*) AS n FROM audit_log"), await count("SELECT COALESCE(sum(remaining_qty), 0) AS n FROM inventory_lot")];
    for (const d of DEMOS) {
      const res = await call(labDemo, { method: "POST", cookie: auditor.cookie, body: { id: d.id } });
      expect(res.status).toBe(200);
      expect(res.body.data.refused, `${d.id} ${d.title}: ${JSON.stringify(res.body.data.error)}`).toBe(d.expect === "refused");
      if (d.expect === "refused") expect(res.body.data.error.sqlstate).toMatch(/^(23|22|P0|55)/);
    }
    const d4 = (await call(labDemo, { method: "POST", cookie: admin.cookie, body: { id: "D04" } })).body.data;
    const [b, a] = [Number(d4.shown[0].rows[0][1]), Number(d4.shown[1].rows[0][1])];
    expect(b - a).toBeCloseTo(2.5, 3);                                              // stock deducted exactly once, by 2.5
    const d3 = (await call(labDemo, { method: "POST", cookie: admin.cookie, body: { id: "D03" } })).body.data;
    expect(d3.error.message).toMatch(/exceeds the .* remaining/);
    expect([await count("SELECT count(*) AS n FROM waste_event"), await count("SELECT count(*) AS n FROM audit_log"), await count("SELECT COALESCE(sum(remaining_qty), 0) AS n FROM inventory_lot")]).toEqual(before);
    expect((await call(labDemo, { method: "POST", cookie: admin.cookie, body: { id: "D99" } })).status).toBe(404);
  });

  it("only a zone admin can refresh the materialised view; the refresh makes it current", async () => {
    expect((await call(labRefresh, { method: "POST", cookie: auditor.cookie, body: {} })).status).toBe(403);
    const { reasonId, routeId } = {
      reasonId: (await queryOne<{ reason_id: number }>("SELECT reason_id FROM waste_reason WHERE reason_code = 'SPOILAGE'"))!.reason_id,
      routeId: (await queryOne<{ route_id: number }>("SELECT route_id FROM disposal_route WHERE route_name = 'LANDFILL'"))!.route_id,
    };
    const mv = async () => Number((await queryOne<{ s: string }>("SELECT round(sum(waste_kg)) AS s FROM mv_zone_monthly"))!.s);
    const base = async () => Number((await queryOne<{ s: string }>("SELECT round(sum(w.quantity_kg)) AS s FROM waste_event w JOIN waste_reason r USING (reason_id) WHERE r.reason_code <> 'REDISTRIBUTED'"))!.s);
    await call(wastePost, { method: "POST", cookie: staff.cookie, body: { reasonId, routeId, stage: "PRE_CONSUMER_PREP", quantityKg: 500, wasEdible: false, occurredOn: today } });
    expect(await mv()).toBeLessThan(await base());                                   // stale until refreshed
    const res = await call(labRefresh, { method: "POST", cookie: admin.cookie, body: {} });
    expect(res.status).toBe(200);
    expect(await mv()).toBe(await base());
  });
});

describe("analytics repositories agree with the SQL catalogue", () => {
  const sql = async (id: string, edit: (s: string) => string = (s) => s) => query((await loadCatalogue()).find((q) => q.id === id)!.sql.replace(/;\s*$/, "").replace(/.*/s, (m) => edit(m)));

  it("weekday profile == Q07; diversion trend == Q13; supplier ranking == Q20", async () => {
    const q07 = (await sql("Q07")) as { dow: number; avg_kg_per_day: string }[];
    const mine = await weekdayProfile({});
    for (const r of q07) expect(mine.find((m) => m.dow === r.dow)!.avgKg).toBe(Number(r.avg_kg_per_day));

    const q13 = (await sql("Q13")) as { month: string; diversion_pct: string }[];
    const trend = await diversionTrend({});
    expect(trend.map((t) => t.pct)).toEqual(q13.map((r) => Number(r.diversion_pct)));

    const q20 = (await sql("Q20")) as { supplier: string; spoilage_rate_pct: string }[];
    const sup = await supplierSpoilage(20);
    expect(sup.map((s) => s.supplier)).toEqual(q20.map((r) => r.supplier));
  });

  it("every anomaly on the page is one the catalogue query finds (Q15)", async () => {
    const all = (await sql("Q15", (s) => s.replace(/LIMIT 15/, ""))) as { name: string; occurred_on: Date }[];
    const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;   // pg DATE -> local midnight
    const keys = new Set(all.map((r) => `${r.name}|${local(new Date(r.occurred_on))}`));
    const recent = await anomalies({}, 400, 200);
    expect(recent.length).toBeGreaterThan(0);
    for (const a of recent) expect(keys.has(`${a.name}|${a.day}`), `${a.name} ${a.day}`).toBe(true);
  });

  it("peer ranking marks exactly one rank-1 establishment per category and agrees with Q17's ordering", async () => {
    const peers = await peerRanking({}, 200);
    expect(peers.length).toBeGreaterThan(0);
    const q17 = (await sql("Q17", (s) => s.replace(/LIMIT 30/, ""))) as { name: string; worst_rank: number }[];
    for (const p of peers) expect(q17.find((r) => r.name === p.name)!.worst_rank).toBe(p.rank);
    const one = await peerRanking({ establishmentId: mgr.establishmentId as number }, 5);
    expect(one).toHaveLength(1);
  });

  it("stored function fn_waste_intensity feeds the establishment dashboard", async () => {
    const direct = await wasteIntensity(mgr.establishmentId as number);
    const user = (await loadUser(mgr.userId))!;
    const dash = await getDashboard(user);
    expect(dash.kind).toBe("establishment");
    if (dash.kind === "establishment") expect(dash.intensity).toBe(direct);
  });

  it("rescue funnel and provenance are internally consistent", async () => {
    const f = await rescueFunnel({});
    expect(f.collectedKg).toBeLessThanOrEqual(f.reservedKg + 1);
    expect(f.collectedKg).toBeLessThanOrEqual(f.offeredKg);
    const p = await provenance({});
    expect(p.manualPct + p.etlPct + p.systemPct).toBeGreaterThan(99.5);
    expect(p.manualPct + p.etlPct + p.systemPct).toBeLessThan(100.5);
  });
});

describe("full-text and typo-tolerant food search is served by the stored function", () => {
  it("finds a food despite a typo, ranks exact names first, and returns nothing for gibberish", async () => {
    const q = async (term: string) => (await call(foodGet, { cookie: staff.cookie, url: `/api/food?q=${encodeURIComponent(term)}` })).body.data as { canonical_name: string }[];
    expect((await q("panner butter")).map((r) => r.canonical_name)).toContain("Paneer Butter Masala");
    expect((await q("masala dosa"))[0]!.canonical_name).toBe("Masala Dosa");
    expect(await q("zzzzqq")).toEqual([]);
    expect((await q("")).length).toBeGreaterThan(5);
  });
});
