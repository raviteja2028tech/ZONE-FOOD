/**
 * Mongo -> PostgreSQL shape adapters (Master Plan B2.8, step 2). Each establishment kind submits a
 * differently shaped `payload`; an adapter turns one of them into uniform `WasteRow`s. Pure functions:
 * no I/O, so every mapping rule is unit-tested.
 */
export type Stage =
  | "PRE_CONSUMER_PREP"
  | "PRE_CONSUMER_SPOILAGE"
  | "PRE_CONSUMER_EXPIRY"
  | "POST_CONSUMER_PLATE"
  | "POST_CONSUMER_SERVICE";

export interface WasteRow {
  rawFoodName: string | null;
  quantityKg: number;
  stage: Stage;
  reasonCode: string;
  routeName: string;
  wasEdible: boolean;
  notes: string | null;
}

export interface Submission {
  estab_kind: string;
  payload: Record<string, unknown>;
}

/** A submission that cannot be imported; the message is stored on the Mongo document as `sync_error`. */
export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterError";
  }
}

// Documented assumptions for kinds that report units rather than kilograms (no weight is in the source data).
export const RETAIL_UNIT_KG = 0.4;
export const HOSPITAL_MEAL_KG = 0.35;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads a non-negative finite number; `undefined` when absent. Throws on junk so bad data fails loudly. */
function num(v: unknown, label: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new AdapterError(`Quantity is not a positive number (${label})`);
  return v;
}

const kg = (n: number) => Math.round(n * 1000) / 1000;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null);

function push(rows: WasteRow[], row: Omit<WasteRow, "quantityKg"> & { quantityKg: number | undefined }) {
  const q = row.quantityKg === undefined ? 0 : kg(row.quantityKg);
  if (q > 0) rows.push({ ...row, quantityKg: q });
}

function commercial(p: Obj): WasteRow[] {
  const rows: WasteRow[] = [];
  const dishes = Array.isArray(p.dish_waste) ? p.dish_waste : [];
  for (const d of dishes) {
    if (!isObj(d)) throw new AdapterError("dish_waste entries must be objects");
    const plates = num(d.returned_plates, "returned_plates") ?? 0;
    const grams = num(d.avg_plate_leftover_g, "avg_plate_leftover_g") ?? 0;
    push(rows, {
      rawFoodName: text(d.dish_name),
      quantityKg: (plates * grams) / 1000,
      stage: "POST_CONSUMER_PLATE",
      reasonCode: "PLATE_LEFTOVER",
      routeName: "COMPOST",
      wasEdible: false,
      notes: text(d.reason_text),
    });
  }
  push(rows, {
    rawFoodName: null,
    quantityKg: num(p.buffet_counter_leftovers_kg, "buffet_counter_leftovers_kg"),
    stage: "POST_CONSUMER_SERVICE",
    reasonCode: "OVER_PREPARATION",
    routeName: "COMPOST",
    wasEdible: true,
    notes: "Buffet counter leftovers",
  });
  for (const s of Array.isArray(p.raw_spoilage) ? p.raw_spoilage : []) {
    if (!isObj(s)) throw new AdapterError("raw_spoilage entries must be objects");
    push(rows, {
      rawFoodName: text(s.item),
      quantityKg: num(s.kg, "raw_spoilage.kg"),
      stage: "PRE_CONSUMER_SPOILAGE",
      reasonCode: "SPOILAGE",
      routeName: "COMPOST",
      wasEdible: false,
      notes: text(s.cause),
    });
  }
  return rows;
}

function residential(p: Obj): WasteRow[] {
  if (!isObj(p.bins)) throw new AdapterError("Household submission has no bins section");
  const segregated = p.segregated === true;
  const note = text(p.free_text);
  const rows: WasteRow[] = [];
  push(rows, {
    rawFoodName: null,
    quantityKg: num(p.bins.vegetable_peels_kg, "vegetable_peels_kg"),
    stage: "PRE_CONSUMER_PREP",
    reasonCode: "TRIMMINGS_PEELS",
    routeName: segregated ? "COMPOST" : "LANDFILL",
    wasEdible: false,
    notes: note,
  });
  push(rows, {
    rawFoodName: null,
    quantityKg: num(p.bins.cooked_leftovers_kg, "cooked_leftovers_kg"),
    stage: "POST_CONSUMER_SERVICE",
    reasonCode: "OVER_PREPARATION",
    routeName: segregated ? "COMPOST" : "LANDFILL",
    wasEdible: true,
    notes: note,
  });
  push(rows, {
    rawFoodName: null,
    quantityKg: num(p.bins.expired_packaged_kg, "expired_packaged_kg"),
    stage: "PRE_CONSUMER_EXPIRY",
    reasonCode: "EXPIRED_UNUSED",
    routeName: "LANDFILL",
    wasEdible: true,
    notes: note,
  });
  return rows;
}

function educational(p: Obj): WasteRow[] {
  const rows: WasteRow[] = [];
  const slot = text(p.meal_slot) ?? "meal";
  for (const c of Array.isArray(p.counters) ? p.counters : []) {
    if (!isObj(c)) throw new AdapterError("counters entries must be objects");
    push(rows, {
      rawFoodName: null,
      quantityKg: num(c.leftover_kg, "leftover_kg"),
      stage: "POST_CONSUMER_SERVICE",
      reasonCode: "OVER_PREPARATION",
      routeName: "COMPOST",
      wasEdible: true,
      notes: `${text(c.counter) ?? "Counter"} (${slot})`,
    });
  }
  return rows;
}

function retail(p: Obj): WasteRow[] {
  const rows: WasteRow[] = [];
  for (const s of Array.isArray(p.skus) ? p.skus : []) {
    if (!isObj(s)) throw new AdapterError("skus entries must be objects");
    const units = num(s.units_discarded, "units_discarded") ?? 0;
    push(rows, {
      rawFoodName: text(s.sku_name),
      quantityKg: units * RETAIL_UNIT_KG,
      stage: "PRE_CONSUMER_EXPIRY",
      reasonCode: "EXPIRED_UNUSED",
      routeName: "LANDFILL",
      wasEdible: true,
      notes: `${units} unit(s) discarded; markdown ${typeof s.markdown_pct === "number" ? s.markdown_pct : 0}%`,
    });
  }
  return rows;
}

function organisational(p: Obj): WasteRow[] {
  const rows: WasteRow[] = [];
  push(rows, {
    rawFoodName: null,
    quantityKg: num(p.tray_returns_kg, "tray_returns_kg"),
    stage: "POST_CONSUMER_PLATE",
    reasonCode: "PLATE_LEFTOVER",
    routeName: "COMPOST",
    wasEdible: false,
    notes: text(p.feedback_note),
  });
  return rows;
}

function healthcare(p: Obj): WasteRow[] {
  const rows: WasteRow[] = [];
  for (const w of Array.isArray(p.ward_meals) ? p.ward_meals : []) {
    if (!isObj(w)) throw new AdapterError("ward_meals entries must be objects");
    const returned = num(w.meals_returned, "meals_returned") ?? 0;
    push(rows, {
      rawFoodName: null,
      quantityKg: returned * HOSPITAL_MEAL_KG,
      stage: "POST_CONSUMER_PLATE",
      reasonCode: "PLATE_LEFTOVER",
      routeName: "COMPOST",
      wasEdible: false,
      notes: `${text(w.ward) ?? "Ward"}: ${returned} meal(s) returned`,
    });
  }
  return rows;
}

function recreational(p: Obj): WasteRow[] {
  const rows: WasteRow[] = [];
  push(rows, {
    rawFoodName: null,
    quantityKg: num(p.buffet_leftover_kg, "buffet_leftover_kg"),
    stage: "POST_CONSUMER_SERVICE",
    reasonCode: "OVER_PREPARATION",
    routeName: "COMPOST",
    wasEdible: true,
    notes: text(p.event_name),
  });
  return rows;
}

/** Fallback for shapes we do not recognise: sum any top-level `*_kg` numbers, otherwise refuse. */
function generic(p: Obj): WasteRow[] {
  let total = 0;
  for (const [key, value] of Object.entries(p)) {
    if (key.endsWith("_kg")) total += num(value, key) ?? 0;
  }
  const rows: WasteRow[] = [];
  push(rows, {
    rawFoodName: null,
    quantityKg: total,
    stage: "POST_CONSUMER_SERVICE",
    reasonCode: "OVER_PREPARATION",
    routeName: "LANDFILL",
    wasEdible: false,
    notes: text(p.free_text) ?? "Imported from an unrecognised submission shape - review",
  });
  if (!rows.length) throw new AdapterError("No recognisable waste quantity in submission");
  return rows;
}

const BY_KIND: Record<string, (p: Obj) => WasteRow[]> = {
  COMMERCIAL: commercial,
  RESIDENTIAL: residential,
  EDUCATIONAL: educational,
  RETAIL_FOOD: retail,
  ORGANIZATIONAL: organisational,
  HEALTHCARE: healthcare,
  RECREATIONAL: recreational,
};

/** Routes a submission to its adapter. Returns [] when the document is valid but contains nothing to import. */
export function adaptSubmission(sub: Submission): WasteRow[] {
  if (!isObj(sub.payload)) throw new AdapterError("Submission payload must be an object");
  const adapter = BY_KIND[sub.estab_kind];
  if (!adapter) return generic(sub.payload);
  return adapter(sub.payload);
}
