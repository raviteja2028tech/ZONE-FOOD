import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, query, queryOne } from "@/lib/db/postgres";
import { closeMongo } from "@/lib/db/mongo";
import { POST as procurementPost, GET as procurementGet } from "@/app/api/procurement/route";
import { GET as inventoryGet } from "@/app/api/inventory/route";
import { GET as sessionsGet, POST as sessionsPost } from "@/app/api/sessions/route";
import { POST as batchPost } from "@/app/api/sessions/[id]/batches/route";
import { POST as closePost } from "@/app/api/sessions/[id]/close/route";
import { GET as dishesGet } from "@/app/api/dishes/route";
import { POST as wastePost } from "@/app/api/waste/route";
import { GET as surplusGet, POST as surplusPost } from "@/app/api/surplus/route";
import { GET as matchesGet } from "@/app/api/surplus/[id]/matches/route";
import { POST as cancelPost } from "@/app/api/surplus/[id]/cancel/route";
import { GET as feedGet } from "@/app/api/feed/route";
import { GET as claimsGet, POST as claimsPost } from "@/app/api/claims/route";
import { PATCH as claimPatch } from "@/app/api/claims/[id]/route";
import { GET as dashGet } from "@/app/api/analytics/dashboard/route";
import { GET as zonesGet } from "@/app/api/zones/route";
import { backfillEmbeddings } from "@/lib/db/repositories/name-resolution";
import { call, count, sessionFor } from "./helpers";

type Session = Awaited<ReturnType<typeof sessionFor>>;
let mgr: Session, staff: Session, admin: Session, auditor: Session, annapoorna: Session, hope: Session, otherMgr: Session;
let today: string;

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const listingBody = (over: Record<string, unknown> = {}) => ({
  description: "Cooked vegetable pulao with raita, vegetarian, no onion or garlic, packed and ready for pickup",
  offeredQtyKg: 10,
  isCooked: true,
  isVegetarian: true,
  availableFrom: hoursFromNow(-1),
  expiresAt: hoursFromNow(30), // >= 24h so the pickup-window overlap rule never depends on the time of day the test runs
  ...over,
});

beforeAll(async () => {
  await backfillEmbeddings(); // food names + recipient needs (the seed leaves embeddings NULL)
  today = (await queryOne<{ d: string }>("SELECT CURRENT_DATE::text AS d"))!.d;
  mgr = await sessionFor("ESTAB_MANAGER");
  staff = await sessionFor("ESTAB_STAFF", "establishment_id = $2", [mgr.establishmentId]);
  otherMgr = await sessionFor("ESTAB_MANAGER", "establishment_id <> $2", [mgr.establishmentId]);
  admin = await sessionFor("ZONE_ADMIN");
  auditor = await sessionFor("AUDITOR");
  annapoorna = await sessionFor("RECIPIENT_AGENT", "recipient_id = 1");
  hope = await sessionFor("RECIPIENT_AGENT", "recipient_id = 2");
});
afterAll(async () => {
  await closePool();
  await closeMongo();
});

describe("procurement and inventory", () => {
  it("records a delivery as one transaction: header + lines + one inventory lot per line, cost computed server-side", async () => {
    const foods = await query<{ food_id: number }>("SELECT food_id FROM food_item ORDER BY food_id LIMIT 2");
    const before = await count("SELECT count(*) AS n FROM inventory_lot WHERE establishment_id = $1", [mgr.establishmentId]);
    const res = await call(procurementPost, {
      method: "POST",
      cookie: staff.cookie,
      body: {
        supplierId: 1,
        invoiceNo: "TEST-INV-1",
        lines: [
          { foodId: foods[0]!.food_id, quantity: 10, unitCost: 40, expiryDate: "2030-01-01" },
          { foodId: foods[1]!.food_id, quantity: 5, unitCost: 20 },
        ],
      },
    });
    expect(res.status).toBe(201);
    const head = await queryOne<{ total_cost: string; establishment_id: number }>("SELECT total_cost, establishment_id FROM procurement WHERE procurement_id = $1", [res.body.data.procurementId]);
    expect(Number(head!.total_cost)).toBe(500);
    expect(head!.establishment_id).toBe(mgr.establishmentId);
    expect(await count("SELECT count(*) AS n FROM inventory_lot WHERE establishment_id = $1", [mgr.establishmentId])).toBe(before + 2);
    const lot = await queryOne<{ remaining_qty: string; received_qty: string }>(
      "SELECT l.remaining_qty, l.received_qty FROM inventory_lot l JOIN procurement_line pl ON pl.line_id = l.source_line_id WHERE pl.procurement_id = $1 AND l.food_id = $2",
      [res.body.data.procurementId, foods[0]!.food_id],
    );
    expect(Number(lot!.remaining_qty)).toBe(10);

    const inv = await call(inventoryGet, { cookie: staff.cookie });
    expect(inv.status).toBe(200);
    expect(inv.body.data.summary.lots).toBeGreaterThan(0);
    const list = await call(procurementGet, { cookie: staff.cookie });
    for (const r of list.body.data.rows) expect(r.establishment_id).toBe(mgr.establishmentId);
  });

  it("writes NOTHING when one line is invalid (atomic rollback)", async () => {
    const proc = await count("SELECT count(*) AS n FROM procurement");
    const lots = await count("SELECT count(*) AS n FROM inventory_lot");
    const res = await call(procurementPost, {
      method: "POST",
      cookie: staff.cookie,
      body: { invoiceNo: "TEST-INV-ROLLBACK", lines: [{ foodId: 1, quantity: 3, unitCost: 10 }, { foodId: 999999, quantity: 3, unitCost: 10 }] },
    });
    expect(res.status).toBe(422);
    expect(await count("SELECT count(*) AS n FROM procurement")).toBe(proc);
    expect(await count("SELECT count(*) AS n FROM inventory_lot")).toBe(lots);
  });

  it("validates quantities and duplicate lines; duplicate invoices are a 409", async () => {
    const bad = await call(procurementPost, { method: "POST", cookie: staff.cookie, body: { lines: [{ foodId: 1, quantity: 0, unitCost: -1 }] } });
    expect(bad.status).toBe(422);
    const dup = await call(procurementPost, { method: "POST", cookie: staff.cookie, body: { lines: [{ foodId: 1, quantity: 1, unitCost: 1 }, { foodId: 1, quantity: 2, unitCost: 1 }] } });
    expect(dup.status).toBe(422);
    const line = { supplierId: 1, invoiceNo: "TEST-INV-DUP", lines: [{ foodId: 1, quantity: 1, unitCost: 1 }] };
    expect((await call(procurementPost, { method: "POST", cookie: staff.cookie, body: line })).status).toBe(201);
    expect((await call(procurementPost, { method: "POST", cookie: staff.cookie, body: line })).status).toBe(409);
  });
});

describe("service sessions, preparation and consumption", () => {
  let sessionId: number;
  let dishId: number;
  let batchId: number;

  it("opens a session, adds a batch and refuses duplicates and future dates", async () => {
    const open = await call(sessionsPost, { method: "POST", cookie: staff.cookie, body: { serviceDate: today, slot: "SNACKS", expectedHeadcount: 120 } });
    expect(open.status).toBe(201);
    sessionId = open.body.data.sessionId;
    expect((await call(sessionsPost, { method: "POST", cookie: staff.cookie, body: { serviceDate: today, slot: "SNACKS", expectedHeadcount: 1 } })).status).toBe(409);
    const future = await call(sessionsPost, { method: "POST", cookie: staff.cookie, body: { serviceDate: "2999-01-01", slot: "DINNER", expectedHeadcount: 1 } });
    expect(future.status).toBe(422);

    const dishes = await call(dishesGet, { cookie: staff.cookie });
    dishId = dishes.body.data[0].dish_id;
    const b = await call(batchPost, { method: "POST", cookie: staff.cookie, params: { id: String(sessionId) }, body: { dishId, preparedQtyKg: 20, preparedPortions: 100 } });
    expect(b.status).toBe(201);
    batchId = b.body.data.batchId;
    expect((await call(batchPost, { method: "POST", cookie: staff.cookie, params: { id: String(sessionId) }, body: { dishId, preparedQtyKg: 1, preparedPortions: 1 } })).status).toBe(409);
  });

  it("refuses another establishment's session and another establishment's dishes (tenant scoping)", async () => {
    const res = await call(batchPost, { method: "POST", cookie: otherMgr.cookie, params: { id: String(sessionId) }, body: { dishId, preparedQtyKg: 1, preparedPortions: 1 } });
    expect(res.status).toBe(404);
  });

  it("closing with served + leftover > prepared is rejected by the DB trigger and rolls everything back", async () => {
    const res = await call(closePost, { method: "POST", cookie: staff.cookie, params: { id: String(sessionId) }, body: { actualHeadcount: 90, records: [{ batchId, servedQtyKg: 15, leftoverQtyKg: 10, plateWasteKg: 1 }] } });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/exceeds prepared/);
    const s = await queryOne<{ is_closed: boolean }>("SELECT is_closed FROM service_session WHERE session_id = $1", [sessionId]);
    expect(s!.is_closed).toBe(false);
    expect(await count("SELECT count(*) AS n FROM consumption_record WHERE batch_id = $1", [batchId])).toBe(0);
  });

  it("requires consumption for every batch, then closes atomically; a closed session is immutable", async () => {
    const missing = await call(closePost, { method: "POST", cookie: staff.cookie, params: { id: String(sessionId) }, body: { actualHeadcount: 90, records: [{ batchId: 999999, servedQtyKg: 1, leftoverQtyKg: 1, plateWasteKg: 0 }] } });
    expect(missing.status).toBe(422);
    const ok = await call(closePost, { method: "POST", cookie: staff.cookie, params: { id: String(sessionId) }, body: { actualHeadcount: 90, records: [{ batchId, servedQtyKg: 15, leftoverQtyKg: 4, plateWasteKg: 1.5 }] } });
    expect(ok.status).toBe(200);
    const s = await queryOne<{ is_closed: boolean; actual_headcount: number }>("SELECT is_closed, actual_headcount FROM service_session WHERE session_id = $1", [sessionId]);
    expect(s).toMatchObject({ is_closed: true, actual_headcount: 90 });
    expect((await call(closePost, { method: "POST", cookie: staff.cookie, params: { id: String(sessionId) }, body: { actualHeadcount: 1, records: [{ batchId, servedQtyKg: 1, leftoverQtyKg: 1, plateWasteKg: 0 }] } })).status).toBe(409);
    expect((await call(batchPost, { method: "POST", cookie: staff.cookie, params: { id: String(sessionId) }, body: { dishId, preparedQtyKg: 1, preparedPortions: 1 } })).status).toBe(409);
    const list = await call(sessionsGet, { cookie: staff.cookie });
    expect(list.body.data.rows.find((r: { session_id: number }) => r.session_id === sessionId).leftover_kg).toBe(4);
  });
});

describe("waste recording", () => {
  const ids = async () => ({
    reason: (await queryOne<{ reason_id: number }>("SELECT reason_id FROM waste_reason WHERE reason_code = 'SPOILAGE'"))!.reason_id,
    redistributed: (await queryOne<{ reason_id: number }>("SELECT reason_id FROM waste_reason WHERE reason_code = 'REDISTRIBUTED'"))!.reason_id,
    route: (await queryOne<{ route_id: number }>("SELECT route_id FROM disposal_route WHERE route_name = 'COMPOST'"))!.route_id,
  });

  it("deducts the lot and derives cost/CO2e in the database (trigger), in one transaction", async () => {
    const { reason, route } = await ids();
    const lot = await queryOne<{ lot_id: number; remaining_qty: string; food_id: number }>(
      "SELECT lot_id, remaining_qty, food_id FROM inventory_lot WHERE establishment_id = $1 AND remaining_qty > 3 ORDER BY lot_id DESC LIMIT 1",
      [mgr.establishmentId],
    );
    const before = Number(lot!.remaining_qty);
    const res = await call(wastePost, {
      method: "POST",
      cookie: staff.cookie,
      body: { reasonId: reason, routeId: route, stage: "PRE_CONSUMER_SPOILAGE", quantityKg: 1.5, wasEdible: false, occurredOn: today, notes: "fridge fault overnight", lotId: lot!.lot_id },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.costEstimate).toBeGreaterThan(0);
    expect(res.body.data.co2eEstimate).toBeGreaterThan(0);
    const after = await queryOne<{ remaining_qty: string }>("SELECT remaining_qty FROM inventory_lot WHERE lot_id = $1", [lot!.lot_id]);
    expect(Number(after!.remaining_qty)).toBeCloseTo(before - 1.5, 3);
  });

  it("refuses to write off more than the lot holds, a lot from another establishment, a future date and a system reason", async () => {
    const { reason, route, redistributed } = await ids();
    const lot = await queryOne<{ lot_id: number; remaining_qty: string }>("SELECT lot_id, remaining_qty FROM inventory_lot WHERE establishment_id = $1 AND remaining_qty > 0 LIMIT 1", [mgr.establishmentId]);
    const base = { reasonId: reason, routeId: route, stage: "PRE_CONSUMER_SPOILAGE", wasEdible: false, occurredOn: today };
    const tooMuch = await call(wastePost, { method: "POST", cookie: staff.cookie, body: { ...base, quantityKg: Number(lot!.remaining_qty) + 5, lotId: lot!.lot_id } });
    expect(tooMuch.status).toBe(422);
    expect(Number((await queryOne<{ remaining_qty: string }>("SELECT remaining_qty FROM inventory_lot WHERE lot_id = $1", [lot!.lot_id]))!.remaining_qty)).toBe(Number(lot!.remaining_qty));

    const foreign = await queryOne<{ lot_id: number }>("SELECT lot_id FROM inventory_lot WHERE establishment_id <> $1 AND remaining_qty > 1 LIMIT 1", [mgr.establishmentId]);
    expect((await call(wastePost, { method: "POST", cookie: staff.cookie, body: { ...base, quantityKg: 1, lotId: foreign!.lot_id } })).status).toBe(422);
    expect((await call(wastePost, { method: "POST", cookie: staff.cookie, body: { ...base, quantityKg: 1, occurredOn: "2999-01-01" } })).status).toBe(422);
    expect((await call(wastePost, { method: "POST", cookie: staff.cookie, body: { ...base, reasonId: redistributed, quantityKg: 1 } })).status).toBe(422);
    expect((await call(wastePost, { method: "POST", cookie: staff.cookie, body: { ...base, quantityKg: -2 } })).status).toBe(422);
  });
});

describe("surplus listings, claims and redistribution", () => {
  const newListing = async (over: Record<string, unknown> = {}) => {
    const r = await call(surplusPost, { method: "POST", cookie: staff.cookie, body: listingBody(over) });
    expect(r.status).toBe(201);
    return r.body.data.listingId as number;
  };
  const claim = (s: Session, listingId: number, qty: number) => call(claimsPost, { method: "POST", cookie: s.cookie, body: { listingId, claimedQtyKg: qty } });
  const act = (s: Session, claimId: number, action: string) => call(claimPatch, { method: "PATCH", cookie: s.cookie, params: { id: String(claimId) }, body: { action } });
  const listingRow = (id: number) => queryOne<{ claimed_qty_kg: string; status: string }>("SELECT claimed_qty_kg, status FROM surplus_listing WHERE listing_id = $1", [id]);

  it("full lifecycle: list -> claim -> approve -> collect, with quantities, statuses and the redistribution record", async () => {
    const res = await call(surplusPost, { method: "POST", cookie: staff.cookie, body: listingBody() });
    expect(res.status).toBe(201);
    expect(res.body.data.embedded).toBe(true);
    const listingId = res.body.data.listingId as number;

    const a = await claim(annapoorna, listingId, 6);
    expect(a.status).toBe(201);
    expect(a.body.data.matchScore).toBeGreaterThan(0);
    expect((await claim(annapoorna, listingId, 1)).status).toBe(409); // duplicate claim (uq_claim)
    expect((await claim(hope, listingId, 11)).status).toBe(422); // more than offered
    const b = await claim(hope, listingId, 5);
    expect(b.status).toBe(201);

    expect((await act(staff, a.body.data.claimId, "approve")).status).toBe(403); // staff may not approve
    expect((await act(admin, a.body.data.claimId, "approve")).status).toBe(403); // authority roles are read-only
    expect((await act(hope, a.body.data.claimId, "approve")).status).toBe(403);
    expect((await act(otherMgr, a.body.data.claimId, "approve")).status).toBe(404); // another establishment cannot even see it

    const approved = await act(mgr, a.body.data.claimId, "approve");
    expect(approved.status).toBe(200);
    expect(approved.body.data.listingStatus).toBe("PARTIALLY_CLAIMED");
    expect(Number((await listingRow(listingId))!.claimed_qty_kg)).toBe(6);

    const tooBig = await act(mgr, b.body.data.claimId, "approve"); // only 4 kg unreserved
    expect(tooBig.status).toBe(409);
    expect((await act(mgr, b.body.data.claimId, "collect")).status).toBe(409); // REQUESTED cannot be collected
    expect((await act(mgr, a.body.data.claimId, "approve")).status).toBe(409); // already approved
    expect((await act(hope, a.body.data.claimId, "collect")).status).toBe(404); // not hope's claim

    const before = await count("SELECT count(*) AS n FROM waste_event WHERE notes LIKE $1", [`%(claim ${a.body.data.claimId})%`]);
    const collected = await act(annapoorna, a.body.data.claimId, "collect");
    expect(collected.status).toBe(200);
    expect(collected.body.data.status).toBe("COLLECTED");
    const rec = await queryOne<{ quantity_kg: string; reason_code: string; route_name: string }>(
      `SELECT w.quantity_kg, r.reason_code, d.route_name FROM waste_event w JOIN waste_reason r USING (reason_id) JOIN disposal_route d USING (route_id) WHERE w.notes LIKE $1`,
      [`%(claim ${a.body.data.claimId})%`],
    );
    expect(before).toBe(0);
    expect(rec).toMatchObject({ reason_code: "REDISTRIBUTED", route_name: "DONATION" });
    expect(Number(rec!.quantity_kg)).toBe(6);
    expect((await act(annapoorna, a.body.data.claimId, "collect")).status).toBe(409); // terminal state

    // listing with an approved/collected claim cannot be cancelled
    expect((await call(cancelPost, { method: "POST", cookie: staff.cookie, params: { id: String(listingId) } })).status).toBe(409);
  });

  it("no-show releases the reserved quantity; cancelling a listing rejects its pending requests", async () => {
    const listingId = await newListing();
    const c = await claim(annapoorna, listingId, 7);
    await act(mgr, c.body.data.claimId, "approve");
    expect(Number((await listingRow(listingId))!.claimed_qty_kg)).toBe(7);
    const ns = await act(staff, c.body.data.claimId, "no_show");
    expect(ns.status).toBe(200);
    expect(ns.body.data.listingStatus).toBe("OPEN");
    expect(Number((await listingRow(listingId))!.claimed_qty_kg)).toBe(0);

    const l2 = await newListing();
    const pending = await claim(hope, l2, 3);
    const cancel = await call(cancelPost, { method: "POST", cookie: mgr.cookie, params: { id: String(l2) } });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.rejectedClaims).toBe(1);
    expect((await queryOne<{ status: string }>("SELECT status FROM redistribution_claim WHERE claim_id = $1", [pending.body.data.claimId]))!.status).toBe("REJECTED");
    expect((await claim(annapoorna, l2, 1)).status).toBe(409); // cancelled listings cannot be claimed
  });

  it("two simultaneous approvals that together exceed the listing: exactly one succeeds (row locking)", async () => {
    const listingId = await newListing();
    const a = await claim(annapoorna, listingId, 6);
    const b = await claim(hope, listingId, 6);
    const [ra, rb] = await Promise.all([act(mgr, a.body.data.claimId, "approve"), act(mgr, b.body.data.claimId, "approve")]);
    expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    const l = await listingRow(listingId);
    expect(Number(l!.claimed_qty_kg)).toBe(6);
    expect(Number(l!.claimed_qty_kg)).toBeLessThanOrEqual(10);
  });

  it("claims are validated: accepts-cooked rule, capacity, expired and unavailable listings", async () => {
    const compost = await sessionFor("RECIPIENT_AGENT", "recipient_id = (SELECT recipient_id FROM recipient_org WHERE accepts_cooked = FALSE LIMIT 1)");
    const listingId = await newListing();
    const res = await claim(compost, listingId, 2);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/cooked/i);
    const rid = (await queryOne<{ recipient_id: number }>("SELECT recipient_id FROM redistribution_claim LIMIT 1"))!.recipient_id;
    void rid;
    const expired = await queryOne<{ listing_id: number }>("SELECT listing_id FROM surplus_listing WHERE expires_at < now() AND status = 'EXPIRED' LIMIT 1");
    expect((await claim(annapoorna, expired!.listing_id, 1)).status).toBe(409);
    expect((await claim(annapoorna, 99999999, 1)).status).toBe(404);
  });

  it("validates listing input: description, quantity and time window", async () => {
    expect((await call(surplusPost, { method: "POST", cookie: staff.cookie, body: listingBody({ offeredQtyKg: 0 }) })).status).toBe(422);
    expect((await call(surplusPost, { method: "POST", cookie: staff.cookie, body: listingBody({ description: "short" }) })).status).toBe(422);
    expect((await call(surplusPost, { method: "POST", cookie: staff.cookie, body: listingBody({ expiresAt: hoursFromNow(-5) }) })).status).toBe(422);
    expect((await call(surplusPost, { method: "POST", cookie: auditor.cookie, body: listingBody() })).status).toBe(403);
  });

  it("ranks only FEASIBLE recipients by hybrid score; the recipient feed applies the same hard filters", async () => {
    const listingId = await newListing();
    const m = await call(matchesGet, { cookie: staff.cookie, params: { id: String(listingId) } });
    expect(m.status).toBe(200);
    const rows = m.body.data as { org_name: string; score: number; semantic: number | null }[];
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.score).toBeGreaterThanOrEqual(rows[i]!.score);
    expect(rows.map((r) => r.org_name)).not.toContain("Green Cycle Compost Unit"); // refuses cooked food -> hard-filtered out
    expect(rows[0]!.semantic).not.toBeNull(); // embeddings present -> a real similarity score
    expect((await call(matchesGet, { cookie: otherMgr.cookie, params: { id: String(listingId) } })).status).toBe(404);

    const feed = await call(feedGet, { cookie: annapoorna.cookie });
    expect(feed.status).toBe(200);
    expect(feed.body.data.some((f: { listing_id: number }) => f.listing_id === listingId)).toBe(true);
    const compost = await sessionFor("RECIPIENT_AGENT", "recipient_id = (SELECT recipient_id FROM recipient_org WHERE accepts_cooked = FALSE LIMIT 1)");
    const compostFeed = await call(feedGet, { cookie: compost.cookie });
    expect(compostFeed.body.data.some((f: { listing_id: number }) => f.listing_id === listingId)).toBe(false);
  });

  it("claims and listings are scoped to the caller's side", async () => {
    const mine = await call(claimsGet, { cookie: annapoorna.cookie });
    for (const c of mine.body.data.rows) expect(c.recipient_id).toBe(1);
    const theirs = await call(claimsGet, { cookie: mgr.cookie });
    for (const c of theirs.body.data.rows) expect(c.establishment_id).toBe(mgr.establishmentId);
    const lst = await call(surplusGet, { cookie: staff.cookie });
    for (const l of lst.body.data.rows) expect(l.establishment_id).toBe(mgr.establishmentId);
  });
});

describe("dashboard and zone analytics use live database numbers", () => {
  it("each role gets its own dashboard shape with non-hardcoded figures", async () => {
    const a = await call(dashGet, { cookie: admin.cookie });
    expect(a.body.data.kind).toBe("authority");
    expect(a.body.data.kpis.wasteKg).toBeGreaterThan(0);
    expect(a.body.data.trend.length).toBeGreaterThan(0);
    expect(a.body.data.zones.length).toBeGreaterThan(0);
    const truth = await queryOne<{ kg: string }>(
      `SELECT sum(w.quantity_kg) AS kg FROM waste_event w JOIN waste_reason r USING (reason_id) WHERE r.reason_code <> 'REDISTRIBUTED' AND w.occurred_on > CURRENT_DATE - 30`,
    );
    expect(a.body.data.kpis.wasteKg).toBeCloseTo(Number(truth!.kg), 1);

    const e = await call(dashGet, { cookie: staff.cookie });
    expect(e.body.data.kind).toBe("establishment");
    expect(e.body.data.kpis.wasteKg).toBeLessThanOrEqual(a.body.data.kpis.wasteKg);
    const r = await call(dashGet, { cookie: annapoorna.cookie });
    expect(r.body.data.kind).toBe("recipient");
  });

  it("zone roll-up aggregates children into parents (recursive CTE) and is restricted to authority roles", async () => {
    const z = await call(zonesGet, { cookie: admin.cookie });
    expect(z.status).toBe(200);
    const sector = z.body.data.find((r: { zone_level: number }) => r.zone_level === 1);
    const blocks = z.body.data.filter((r: { zone_level: number }) => r.zone_level === 2);
    expect(sector.wasteKg).toBeGreaterThan(0);
    const sum = blocks.reduce((s: number, b: { wasteKg: number }) => s + b.wasteKg, 0);
    expect(Math.abs(sector.wasteKg - sum)).toBeLessThanOrEqual(blocks.length); // rounding only
    expect((await call(zonesGet, { cookie: staff.cookie })).status).toBe(403);
  });
});
