import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { getPool } from "@/lib/db/postgres";
import { AppError } from "@/lib/http/errors";

/**
 * The "DBMS Lab": lets a zone administrator or auditor RUN the documented catalogue queries and live constraint
 * demonstrations against the real database.
 *
 * Safety model - nobody can run arbitrary SQL here:
 *  - queries are looked up BY ID from db/queries/*.sql (files in the repository), never taken from the request;
 *  - SELECTs run in a READ ONLY transaction; DML runs in a transaction that is ALWAYS rolled back;
 *  - a statement timeout and a row cap bound the cost.
 */
export interface LabQuery {
  id: string;
  title: string;
  concepts: string;
  purpose: string;
  reading: string;
  mode: "select" | "dml";
  sql: string;
}

const QUERY_DIR = path.join(process.cwd(), "db", "queries");
const HEADER = /^--\s*(title|concepts|purpose|mode|reading):\s*(.*)$/;
let cache: LabQuery[] | undefined;

export async function loadCatalogue(): Promise<LabQuery[]> {
  if (cache) return cache;
  const files = (await fs.readdir(QUERY_DIR)).filter((f) => /^Q\d\d_.*\.sql$/.test(f)).sort();
  const out: LabQuery[] = [];
  for (const f of files) {
    const meta: Record<string, string> = {};
    const body: string[] = [];
    for (const line of (await fs.readFile(path.join(QUERY_DIR, f), "utf8")).split(/\r?\n/)) {
      const m = HEADER.exec(line);
      if (m && body.length === 0) meta[m[1]!] = m[2]!.trim();
      else if (line.trim() || body.length) body.push(line);
    }
    out.push({
      id: f.slice(0, 3), title: meta.title ?? f, concepts: meta.concepts ?? "", purpose: meta.purpose ?? "", reading: meta.reading ?? "",
      mode: meta.mode === "dml" ? "dml" : "select", sql: body.join("\n").trim(),
    });
  }
  cache = out;
  return out;
}

export interface RunOutcome {
  id: string;
  mode: "select" | "dml";
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  millis: number;
  plan?: string[];
  rolledBack: boolean;
}

const ROW_CAP = 200;

export async function runCatalogueQuery(id: string, explain: boolean): Promise<RunOutcome> {
  const q = (await loadCatalogue()).find((x) => x.id === id);
  if (!q) throw new AppError(404, "NOT_FOUND", "Unknown catalogue query.");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (q.mode === "select") await client.query("SET TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '20s'");
    const started = performance.now();
    const res = await client.query({ text: q.sql, rowMode: "array" });
    const millis = Math.round((performance.now() - started) * 10) / 10;
    const plan = explain
      ? (await client.query({ text: `EXPLAIN (ANALYZE, BUFFERS) ${q.sql}`, rowMode: "array" })).rows.map((r) => String(r[0]))
      : undefined;
    return {
      id, mode: q.mode, columns: res.fields.map((f) => f.name), rows: (res.rows as unknown[][]).slice(0, ROW_CAP), rowCount: res.rows.length,
      truncated: res.rows.length > ROW_CAP, millis, plan, rolledBack: true,
    };
  } catch (err) {
    if ((err as { code?: string }).code === "57014") throw new AppError(408, "TIMEOUT", "The query took longer than 20 seconds and was cancelled.");
    throw err;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined); // always: nothing the lab runs is ever kept
    client.release();
  }
}

/* ---------------------------------------------------------------------------------- constraint demonstrations */

export interface Demo {
  id: string;
  title: string;
  concept: string;
  explanation: string;
  expect: "refused" | "ok";
  steps: { sql: string; show?: string }[];
}

const SPOILAGE = "(SELECT reason_id FROM waste_reason WHERE reason_code = 'SPOILAGE')";
const COMPOST = "(SELECT route_id FROM disposal_route WHERE route_name = 'COMPOST')";
const LOT = "(SELECT min(lot_id) FROM inventory_lot WHERE remaining_qty > 5)";

export const DEMOS: Demo[] = [
  {
    id: "D01", title: "Trigger T1: served + leftover may not exceed what was prepared", concept: "BEFORE trigger (cross-table rule a CHECK cannot express)",
    explanation: "Someone edits a consumption record to claim 1,000 kg leftover from a batch that was never that big. The trigger compares it with preparation_batch and refuses.",
    expect: "refused",
    steps: [{ sql: "UPDATE consumption_record SET leftover_qty_kg = leftover_qty_kg + 1000 WHERE batch_id = (SELECT min(batch_id) FROM consumption_record)" }],
  },
  {
    id: "D02", title: "CHECK constraint: a waste quantity must be positive", concept: "CHECK constraint on a partitioned table",
    explanation: "A negative quantity is rejected by the table's own rule, whichever application or console wrote it.", expect: "refused",
    steps: [{ sql: `INSERT INTO waste_event (establishment_id, reason_id, route_id, stage, quantity_kg, occurred_on) VALUES (1, ${SPOILAGE}, ${COMPOST}, 'PRE_CONSUMER_PREP', -5, CURRENT_DATE)` }],
  },
  {
    id: "D03", title: "Trigger T3: cannot write off more stock than the lot holds", concept: "BEFORE trigger + row lock (inventory ledger)",
    explanation: "A write-off larger than the lot's remaining quantity is refused by the stock-ledger trigger, so inventory can never go negative.", expect: "refused",
    steps: [{ sql: `INSERT INTO waste_event (establishment_id, food_id, lot_id, reason_id, route_id, stage, quantity_kg, occurred_on)
SELECT l.establishment_id, l.food_id, l.lot_id, ${SPOILAGE}, ${COMPOST}, 'PRE_CONSUMER_SPOILAGE', l.remaining_qty + 1, CURRENT_DATE FROM inventory_lot l WHERE l.lot_id = ${LOT}` }],
  },
  {
    id: "D04", title: "Trigger T3: stock is deducted exactly once", concept: "Inventory consistency",
    explanation: "A 2.5 kg write-off against one lot. The first result is the stock before, the last the stock after: exactly 2.5 kg lower - not 5. The transaction is then rolled back, so your stock is untouched.", expect: "ok",
    steps: [
      { sql: `SELECT lot_id, remaining_qty AS before_kg FROM inventory_lot WHERE lot_id = ${LOT}`, show: "Stock before" },
      { sql: `INSERT INTO waste_event (establishment_id, food_id, lot_id, reason_id, route_id, stage, quantity_kg, occurred_on)
SELECT l.establishment_id, l.food_id, l.lot_id, ${SPOILAGE}, ${COMPOST}, 'PRE_CONSUMER_SPOILAGE', 2.5, CURRENT_DATE FROM inventory_lot l WHERE l.lot_id = ${LOT}` },
      { sql: `SELECT lot_id, remaining_qty AS after_kg FROM inventory_lot WHERE lot_id = ${LOT}`, show: "Stock after (2.5 kg lower)" },
    ],
  },
  {
    id: "D05", title: "Trigger T5: illegal claim status change", concept: "State-machine trigger",
    explanation: "A REJECTED claim cannot jump to COLLECTED. Only REQUESTED → APPROVED/REJECTED and APPROVED → COLLECTED/NO_SHOW are legal, whoever issues the UPDATE.", expect: "refused",
    steps: [{ sql: "UPDATE redistribution_claim SET status = 'COLLECTED', collected_at = now() WHERE claim_id = (SELECT min(claim_id) FROM redistribution_claim WHERE status = 'REJECTED')" }],
  },
  {
    id: "D06", title: "Trigger T6: a cancelled listing cannot be reopened", concept: "BEFORE UPDATE guard", explanation: "Cancellation is final.", expect: "refused",
    steps: [{ sql: "UPDATE surplus_listing SET status = 'OPEN' WHERE listing_id = (SELECT min(listing_id) FROM surplus_listing WHERE status = 'CANCELLED')" }],
  },
  {
    id: "D07", title: "UNIQUE constraint: one session per establishment, date and meal", concept: "UNIQUE (composite)",
    explanation: "Re-inserting an existing (establishment, date, slot) combination is refused.", expect: "refused",
    steps: [{ sql: "INSERT INTO service_session (establishment_id, service_date, slot, expected_headcount) SELECT establishment_id, service_date, slot, 10 FROM service_session LIMIT 1" }],
  },
  {
    id: "D08", title: "FOREIGN KEY … ON DELETE RESTRICT: a zone with establishments cannot be deleted", concept: "Referential integrity",
    explanation: "Deleting a street zone that still has establishments is refused instead of orphaning them.", expect: "refused",
    steps: [{ sql: "DELETE FROM zone WHERE zone_id = (SELECT zone_id FROM establishment ORDER BY establishment_id LIMIT 1)" }],
  },
  {
    id: "D09", title: "CHECK ck_user_scope: a manager must belong to an establishment", concept: "Role/tenant coherence in the database",
    explanation: "The application also checks this, but the database refuses it independently - a console or script cannot create an orphan manager.", expect: "refused",
    steps: [{ sql: "INSERT INTO app_user (email, password_hash, full_name, role) VALUES ('orphan.manager@example.test', 'not-a-real-hash', 'No Establishment', 'ESTAB_MANAGER')" }],
  },
  {
    id: "D10", title: "Function fn_claim_surplus: cooked food cannot go to an organisation that refuses it", concept: "Stored function with business rules + row lock",
    explanation: "A cooked-food listing is created in the transaction, then claimed on behalf of an organisation that does not accept cooked food. The function refuses with a specific message.", expect: "refused",
    steps: [
      { sql: "INSERT INTO surplus_listing (establishment_id, description, offered_qty_kg, is_cooked, is_vegetarian, available_from, expires_at) VALUES ((SELECT min(establishment_id) FROM establishment), 'lab demo: cooked rice and dal', 5, TRUE, TRUE, now() - interval '1 hour', now() + interval '5 hours')" },
      { sql: "SELECT fn_claim_surplus((SELECT max(listing_id) FROM surplus_listing), (SELECT recipient_id FROM recipient_org WHERE NOT accepts_cooked ORDER BY recipient_id LIMIT 1), 1, NULL)" },
    ],
  },
  {
    id: "D11", title: "Trigger T4: the audit trail records who changed what", concept: "AFTER trigger + session variable (app.current_user_id)",
    explanation: "A listing is edited inside a transaction tagged with an administrator's id. The audit trigger writes a row with that user, the table, the action and the new values. (Rolled back, so no audit noise is left behind.)", expect: "ok",
    steps: [
      { sql: "SELECT set_config('app.current_user_id', (SELECT min(user_id)::text FROM app_user WHERE role = 'ZONE_ADMIN'), true)" },
      { sql: "UPDATE surplus_listing SET description = description || ' (edited in the lab)' WHERE listing_id = (SELECT max(listing_id) FROM surplus_listing)" },
      { sql: "SELECT a.table_name, a.action, u.full_name AS changed_by, LEFT(a.new_row ->> 'description', 70) AS new_description FROM audit_log a JOIN app_user u ON u.user_id = a.changed_by ORDER BY a.audit_id DESC LIMIT 1", show: "Audit row written by the trigger" },
    ],
  },
  {
    id: "D12", title: "Trigger T2: provenance and cost are derived by the database", concept: "BEFORE INSERT enrichment trigger",
    explanation: "A redistribution waste event is inserted as 'MANUAL' with no cost. The trigger overrides the provenance to SYSTEM and fills the cost and CO₂e from the food item.", expect: "ok",
    steps: [
      { sql: `INSERT INTO waste_event (establishment_id, food_id, reason_id, route_id, stage, quantity_kg, occurred_on, measurement_source)
SELECT 1, (SELECT min(food_id) FROM food_item), (SELECT reason_id FROM waste_reason WHERE reason_code = 'REDISTRIBUTED'), (SELECT route_id FROM disposal_route WHERE route_name = 'DONATION'), 'POST_CONSUMER_SERVICE', 4, CURRENT_DATE, 'MANUAL'` },
      { sql: "SELECT waste_id, measurement_source, cost_estimate, co2e_estimate FROM waste_event ORDER BY waste_id DESC LIMIT 1", show: "Row as stored (source set by the trigger)" },
    ],
  },
];

export interface DemoOutcome {
  id: string;
  expect: "refused" | "ok";
  refused: boolean;
  error?: { sqlstate: string; message: string; constraint?: string | null };
  shown: { label: string; columns: string[]; rows: unknown[][] }[];
}

export async function runDemo(id: string): Promise<DemoOutcome> {
  const demo = DEMOS.find((d) => d.id === id);
  if (!demo) throw new AppError(404, "NOT_FOUND", "Unknown demonstration.");
  const client = await getPool().connect();
  const outcome: DemoOutcome = { id, expect: demo.expect, refused: false, shown: [] };
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '10s'");
    for (const step of demo.steps) {
      const res = await client.query({ text: step.sql, rowMode: "array" });
      if (step.show) outcome.shown.push({ label: step.show, columns: res.fields.map((f) => f.name), rows: (res.rows as unknown[][]).slice(0, 5) });
    }
  } catch (err) {
    const e = err as { code?: string; message?: string; constraint?: string };
    outcome.refused = true;
    outcome.error = { sqlstate: e.code ?? "?", message: e.message ?? "refused", constraint: e.constraint ?? null };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
  return outcome;
}

/** Refreshes the zone roll-up. CONCURRENTLY: readers keep reading the old contents until the new ones are ready. */
export async function refreshZoneMonthly() {
  const started = performance.now();
  await getPool().query("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_zone_monthly");
  const rows = (await getPool().query<{ n: number }>("SELECT count(*)::int AS n FROM mv_zone_monthly")).rows[0]!.n;
  return { rows, millis: Math.round(performance.now() - started) };
}
