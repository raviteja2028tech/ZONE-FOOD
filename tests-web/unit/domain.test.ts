import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLES, can, type Permission, type Role } from "@/lib/auth/permissions";
import { FailureLimiter } from "@/lib/auth/rate-limit";
import { allowedActions, deriveListingStatus, holdsQuantity, nextClaimStatus, roleMayPerform, type ClaimAction, type ClaimStatus } from "@/lib/domain/claims";
import { WEIGHTS, capacityFit, haversineKm, hybridScore, proximityScore, similarityFromDistance } from "@/lib/domain/matching";
import { CACHE_MIN_CONFIDENCE, decideResolution, normaliseName } from "@/lib/domain/names";
import { AdapterError, adaptSubmission } from "@/lib/domain/etl-adapters";
import { deltaPct, fmtRelative } from "@/lib/format";
import { navFor } from "@/components/layout/nav-config";
import { listingSchema, passwordSchema, procurementSchema, registerRecipientSchema, submissionPayloadSchemas } from "@/lib/validation/schemas";

describe("role-based permissions", () => {
  const allowed = (p: Permission) => ROLES.filter((r) => can(r, p));

  it("auditors can read but hold no write permission anywhere", () => {
    const writes = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => /:(write|manage|create|review|handover|collect|run|update-own)$/.test(p));
    for (const p of writes) expect(can("AUDITOR", p), p).toBe(false);
    expect(can("AUDITOR", "waste:read")).toBe(true);
    expect(can("AUDITOR", "zone:read")).toBe(true);
  });

  it("only recipients can claim; only establishment roles can write kitchen data", () => {
    expect(allowed("claim:create")).toEqual(["RECIPIENT_AGENT"]);
    for (const p of ["procurement:write", "waste:write", "service:write", "surplus:write", "submission:write"] as Permission[]) {
      expect(allowed(p).sort(), p).toEqual(["ESTAB_MANAGER", "ESTAB_STAFF"]);
    }
    expect(can("RECIPIENT_AGENT", "waste:read")).toBe(false);
  });

  it("approving claims is a manager-only power; staff can only hand over", () => {
    expect(allowed("claim:review")).toEqual(["ESTAB_MANAGER"]);
    expect(can("ESTAB_STAFF", "claim:handover")).toBe(true);
    expect(can("ESTAB_STAFF", "claim:review")).toBe(false);
  });

  it("administration (ETL, embeddings, zones, establishment management) is zone-admin only", () => {
    for (const p of ["etl:run", "embeddings:manage", "zone:manage", "establishment:manage", "recipient:manage", "food:manage"] as Permission[]) expect(allowed(p), p).toEqual(["ZONE_ADMIN"]);
  });

  it("Part 3 pages: the DBMS Lab and audit log are authority-only; refreshing the materialised view is admin-only; analytics is for everyone but recipients", () => {
    expect(allowed("lab:use")).toEqual(["ZONE_ADMIN", "AUDITOR"]);
    expect(allowed("audit:read")).toEqual(["ZONE_ADMIN", "AUDITOR"]);
    expect(allowed("lab:refresh")).toEqual(["ZONE_ADMIN"]);
    expect(allowed("analytics:view").sort()).toEqual(["AUDITOR", "ESTAB_MANAGER", "ESTAB_STAFF", "ZONE_ADMIN"]);
    expect(can("RECIPIENT_AGENT", "analytics:view")).toBe(false);
  });

  it("navigation mirrors permissions: a role sees exactly the links it may open", () => {
    const labels = (role: Role) => navFor({ role, establishmentId: role.startsWith("ESTAB") ? 1 : null, recipientId: role === "RECIPIENT_AGENT" ? 1 : null }).flatMap((g) => g.items.map((i) => i.label));
    expect(labels("RECIPIENT_AGENT")).toContain("Available surplus");
    expect(labels("RECIPIENT_AGENT")).not.toContain("Waste");
    expect(labels("ESTAB_STAFF")).toContain("Procurement");
    expect(labels("ESTAB_STAFF")).not.toContain("Data sync");
    expect(labels("ZONE_ADMIN")).toContain("Data sync");
    expect(labels("AUDITOR")).not.toContain("Available surplus");
    expect(labels("ESTAB_MANAGER")).toContain("My establishment");
    expect(labels("ZONE_ADMIN")).toEqual(expect.arrayContaining(["DBMS Lab", "Audit log", "Analytics"]));
    expect(labels("ESTAB_STAFF")).toContain("Analytics");
    expect(labels("ESTAB_STAFF")).not.toContain("DBMS Lab");
    expect(labels("RECIPIENT_AGENT")).not.toContain("Analytics");
  });
});

describe("claim state machine", () => {
  const all: ClaimStatus[] = ["REQUESTED", "APPROVED", "COLLECTED", "NO_SHOW", "REJECTED"];
  const actions: ClaimAction[] = ["approve", "reject", "collect", "no_show"];

  it("allows exactly the documented transitions", () => {
    const legal: [ClaimStatus, ClaimAction, ClaimStatus][] = [
      ["REQUESTED", "approve", "APPROVED"], ["REQUESTED", "reject", "REJECTED"], ["APPROVED", "collect", "COLLECTED"], ["APPROVED", "no_show", "NO_SHOW"],
    ];
    for (const s of all) for (const a of actions) {
      const hit = legal.find(([from, act]) => from === s && act === a);
      expect(nextClaimStatus(s, a), `${s}+${a}`).toBe(hit ? hit[2] : null);
    }
  });

  it("terminal states accept no action", () => {
    for (const s of ["COLLECTED", "NO_SHOW", "REJECTED"] as ClaimStatus[]) expect(allowedActions(s)).toEqual([]);
  });

  it("only approved/collected claims hold quantity", () => {
    expect(all.filter(holdsQuantity)).toEqual(["APPROVED", "COLLECTED"]);
  });

  it("roles may only perform their actions", () => {
    expect(roleMayPerform("ESTAB_MANAGER", "approve")).toBe(true);
    expect(roleMayPerform("ESTAB_STAFF", "approve")).toBe(false);
    expect(roleMayPerform("RECIPIENT_AGENT", "collect")).toBe(true);
    expect(roleMayPerform("RECIPIENT_AGENT", "no_show")).toBe(false);
    expect(roleMayPerform("AUDITOR", "reject")).toBe(false);
    expect(roleMayPerform("ZONE_ADMIN", "collect")).toBe(false);
  });

  it("derives listing status from quantities, expiry and cancellation", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    const later = new Date("2026-11-01T12:00:00Z");
    const earlier = new Date("2026-11-01T08:00:00Z");
    expect(deriveListingStatus({ offeredKg: 10, claimedKg: 0, expiresAt: later, now })).toBe("OPEN");
    expect(deriveListingStatus({ offeredKg: 10, claimedKg: 4, expiresAt: later, now })).toBe("PARTIALLY_CLAIMED");
    expect(deriveListingStatus({ offeredKg: 10, claimedKg: 10, expiresAt: later, now })).toBe("FULLY_CLAIMED");
    expect(deriveListingStatus({ offeredKg: 10, claimedKg: 10, expiresAt: earlier, now })).toBe("FULLY_CLAIMED");
    expect(deriveListingStatus({ offeredKg: 10, claimedKg: 2, expiresAt: earlier, now })).toBe("EXPIRED");
    expect(deriveListingStatus({ offeredKg: 10, claimedKg: 0, expiresAt: later, now, cancelled: true })).toBe("CANCELLED");
  });
});

describe("matching score", () => {
  it("weights sum to 1 and combine as 0.60 / 0.25 / 0.15", () => {
    expect(WEIGHTS.semantic + WEIGHTS.capacity + WEIGHTS.proximity).toBeCloseTo(1, 10);
    expect(hybridScore({ semantic: 1, capacity: 1, proximity: 1 })).toBeCloseTo(1, 10);
    expect(hybridScore({ semantic: 0.5, capacity: 0.4, proximity: 0.2 })).toBeCloseTo(0.6 * 0.5 + 0.25 * 0.4 + 0.15 * 0.2, 10);
  });
  it("treats a missing embedding as zero semantic contribution (never invents one)", () => {
    expect(hybridScore({ semantic: null, capacity: 1, proximity: 1 })).toBeCloseTo(0.4, 10);
  });
  it("converts cosine distance to similarity and clamps", () => {
    expect(similarityFromDistance(0.13)).toBeCloseTo(0.87, 10);
    expect(similarityFromDistance(1.4)).toBe(0);
  });
  it("capacity fit peaks when the offer equals capacity and falls off both ways", () => {
    expect(capacityFit(50, 50)).toBe(1);
    expect(capacityFit(25, 50)).toBeCloseTo(0.5, 10);
    expect(capacityFit(500, 50)).toBe(0);
    expect(capacityFit(5, 0)).toBe(0);
  });
  it("haversine distance and proximity", () => {
    expect(haversineKm(12.97, 77.59, 12.97, 77.59)).toBe(0);
    expect(haversineKm(12.9716, 77.5946, 13.0827, 80.2707)).toBeGreaterThan(280); // Bengaluru -> Chennai ~290 km
    expect(proximityScore(0, 5)).toBe(1);
    expect(proximityScore(5, 5)).toBe(0);
    expect(proximityScore(9, 5)).toBe(0);
  });
});

describe("food-name resolution policy", () => {
  it("normalises case, punctuation and bracketed qualifiers", () => {
    expect(normaliseName("VEG. BIRYANI")).toBe("veg biryani");
    expect(normaliseName("Veg Biriyani (Special)")).toBe("veg biriyani");
    expect(normaliseName("  Masala   Dosa!! ")).toBe("masala dosa");
  });
  it("applies the cascade in order with the documented thresholds", () => {
    const c = (score: number) => ({ foodId: 1, name: "X", score });
    expect(decideResolution({ exact: c(1), trigram: c(0.9) }).method).toBe("EXACT");
    expect(decideResolution({ alias: { ...c(0.8), confidence: 0.8 }, trigram: c(0.9) }).method).toBe("ALIAS");
    expect(decideResolution({ trigram: c(0.46) }).method).toBe("TRIGRAM");
    expect(decideResolution({ trigram: c(0.45) }).method).toBe("NONE"); // strictly greater than 0.45
    expect(decideResolution({ trigram: c(0.3), vector: c(0.72) }).method).toBe("VECTOR"); // >= 0.72
    expect(decideResolution({ trigram: c(0.3), vector: c(0.71) }).method).toBe("NONE");
    expect(decideResolution({}).foodId).toBeNull();
    expect(CACHE_MIN_CONFIDENCE).toBeGreaterThan(0.45);
  });
});

describe("ETL shape adapters", () => {
  const sub = (estab_kind: string, payload: Record<string, unknown>) => ({ estab_kind, payload });

  it("commercial: plates x grams -> kg, buffet and spoilage rows with their stages", () => {
    const rows = adaptSubmission(sub("COMMERCIAL", {
      dish_waste: [{ dish_name: "Dal Tadka", returned_plates: 10, avg_plate_leftover_g: 80 }, { dish_name: "Idli", returned_plates: 0, avg_plate_leftover_g: 50 }],
      buffet_counter_leftovers_kg: 2.5,
      raw_spoilage: [{ item: "tomatoes", kg: 1.5, cause: "fridge fault" }],
    }));
    expect(rows).toHaveLength(3); // zero-quantity dish is skipped
    expect(rows[0]).toMatchObject({ rawFoodName: "Dal Tadka", quantityKg: 0.8, stage: "POST_CONSUMER_PLATE", reasonCode: "PLATE_LEFTOVER" });
    expect(rows[1]).toMatchObject({ rawFoodName: null, quantityKg: 2.5, stage: "POST_CONSUMER_SERVICE", wasEdible: true });
    expect(rows[2]).toMatchObject({ rawFoodName: "tomatoes", stage: "PRE_CONSUMER_SPOILAGE", notes: "fridge fault" });
  });

  it("residential: bins map to stages; routing depends on segregation", () => {
    const seg = adaptSubmission(sub("RESIDENTIAL", { bins: { vegetable_peels_kg: 3, cooked_leftovers_kg: 1, expired_packaged_kg: 0.5 }, segregated: true }));
    expect(seg.map((r) => r.stage)).toEqual(["PRE_CONSUMER_PREP", "POST_CONSUMER_SERVICE", "PRE_CONSUMER_EXPIRY"]);
    expect(seg[0]).toMatchObject({ routeName: "COMPOST", wasEdible: false, reasonCode: "TRIMMINGS_PEELS" });
    const mixed = adaptSubmission(sub("RESIDENTIAL", { bins: { vegetable_peels_kg: 3 }, segregated: false }));
    expect(mixed[0]!.routeName).toBe("LANDFILL");
  });

  it("educational, retail, organisational, healthcare and recreational shapes", () => {
    expect(adaptSubmission(sub("EDUCATIONAL", { meal_slot: "LUNCH", counters: [{ counter: "C1", leftover_kg: 4 }, { counter: "C2", leftover_kg: 0 }] }))).toHaveLength(1);
    expect(adaptSubmission(sub("RETAIL_FOOD", { skus: [{ sku_name: "Curd 400g", units_discarded: 5 }] }))[0]).toMatchObject({ rawFoodName: "Curd 400g", quantityKg: 2 });
    expect(adaptSubmission(sub("ORGANIZATIONAL", { tray_returns_kg: 12 }))[0]!.quantityKg).toBe(12);
    expect(adaptSubmission(sub("HEALTHCARE", { ward_meals: [{ ward: "ICU", meals_returned: 4 }] }))[0]!.quantityKg).toBeCloseTo(1.4, 10);
    expect(adaptSubmission(sub("RECREATIONAL", { event_name: "Brunch", buffet_leftover_kg: 7 }))[0]!.quantityKg).toBe(7);
  });

  it("rejects junk quantities and unknown shapes without guessing", () => {
    expect(() => adaptSubmission(sub("COMMERCIAL", { dish_waste: [{ dish_name: "X", returned_plates: "many", avg_plate_leftover_g: 5 }] }))).toThrow(AdapterError);
    expect(() => adaptSubmission(sub("COMMERCIAL", { dish_waste: [{ dish_name: "X", returned_plates: -1, avg_plate_leftover_g: 5 }] }))).toThrow(/not a positive number/);
    expect(() => adaptSubmission(sub("RESIDENTIAL", { segregated: true }))).toThrow(/no bins/);
    expect(() => adaptSubmission(sub("UNKNOWN_KIND", { note: "nothing numeric" }))).toThrow(/No recognisable/);
    expect(adaptSubmission(sub("UNKNOWN_KIND", { total_kg: 3 }))[0]!.quantityKg).toBe(3);
    expect(adaptSubmission(sub("COMMERCIAL", { dish_waste: [] }))).toEqual([]); // valid but nothing to import
  });
});

describe("login rate limiter", () => {
  it("locks after N failures inside the window and unlocks as failures age out", () => {
    let t = 1_000_000;
    const l = new FailureLimiter(3, 60_000, () => t);
    for (let i = 0; i < 2; i++) l.recordFailure("a");
    expect(l.retryAfterSeconds("a")).toBe(0);
    l.recordFailure("a");
    expect(l.retryAfterSeconds("a")).toBeGreaterThan(0);
    expect(l.retryAfterSeconds("b")).toBe(0); // other keys unaffected
    t += 61_000;
    expect(l.retryAfterSeconds("a")).toBe(0);
  });
  it("a success resets the counter", () => {
    const l = new FailureLimiter(2, 60_000);
    l.recordFailure("a"); l.recordFailure("a");
    expect(l.retryAfterSeconds("a")).toBeGreaterThan(0);
    l.reset("a");
    expect(l.retryAfterSeconds("a")).toBe(0);
  });
});

describe("input validation schemas", () => {
  it("passwords need length, a letter and a number", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("alllettersonly").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890123").success).toBe(false);
    expect(passwordSchema.safeParse("Sup3rSecret-pass").success).toBe(true);
    expect(passwordSchema.safeParse("a1".repeat(40)).success).toBe(false); // > 72 bytes (bcrypt limit)
  });
  it("procurement needs lines, positive quantities and unique foods", () => {
    expect(procurementSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(procurementSchema.safeParse({ lines: [{ foodId: 1, quantity: 0, unitCost: 1 }] }).success).toBe(false);
    expect(procurementSchema.safeParse({ lines: [{ foodId: 1, quantity: 1, unitCost: 1 }, { foodId: 1, quantity: 2, unitCost: 1 }] }).success).toBe(false);
    expect(procurementSchema.safeParse({ lines: [{ foodId: "2", quantity: "1.5", unitCost: "10" }] }).success).toBe(true);
  });
  it("listing window must end after it starts", () => {
    const base = { description: "Cooked vegetable pulao for pickup tonight", offeredQtyKg: 5 };
    expect(listingSchema.safeParse({ ...base, availableFrom: "2026-11-01T10:00:00Z", expiresAt: "2026-11-01T09:00:00Z" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...base, availableFrom: "2026-11-01T10:00:00Z", expiresAt: "2026-11-01T12:00:00Z" }).success).toBe(true);
  });
  it("recipient registration validates the pickup window and need-profile length", () => {
    const ok = { email: "a@b.example", password: "Sup3rSecret-pass", fullName: "A", org: { zoneId: 1, orgName: "N", orgType: "NGO", needProfile: "We feed about eighty people each night.", dailyCapacityKg: 10, pickupWindowStart: "18:00", pickupWindowEnd: "21:00" } };
    expect(registerRecipientSchema.safeParse(ok).success).toBe(true);
    expect(registerRecipientSchema.safeParse({ ...ok, org: { ...ok.org, pickupWindowEnd: "17:00" } }).success).toBe(false);
    expect(registerRecipientSchema.safeParse({ ...ok, org: { ...ok.org, needProfile: "too short" } }).success).toBe(false);
  });
  it("each establishment kind has its own submission shape", () => {
    expect(submissionPayloadSchemas.COMMERCIAL.safeParse({ dish_waste: [] }).success).toBe(false);
    expect(submissionPayloadSchemas.RESIDENTIAL.safeParse({ bins: { vegetable_peels_kg: 2 } }).success).toBe(true);
    expect(submissionPayloadSchemas.RESIDENTIAL.safeParse({ dish_waste: [] }).success).toBe(false);
  });
});

describe("formatting helpers", () => {
  it("computes period-over-period change and relative times", () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(50, 100)).toBe(-50);
    expect(deltaPct(5, 0)).toBeNull();
    const now = Date.parse("2026-11-01T10:00:00Z");
    expect(fmtRelative("2026-11-01T13:20:00Z", now)).toBe("in 3h 20m");
    expect(fmtRelative("2026-10-30T06:00:00Z", now)).toBe("2d 4h ago");
  });
});
