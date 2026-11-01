import "server-only";
import { ObjectId, type Document } from "mongodb";
import { getMongoDb } from "@/lib/db/mongo";
import { query, queryOne, withTransaction } from "@/lib/db/postgres";
import { adaptSubmission, AdapterError, type WasteRow } from "@/lib/domain/etl-adapters";
import { CACHE_MIN_CONFIDENCE } from "@/lib/domain/names";
import { resolveFoodName } from "@/lib/db/repositories/name-resolution";
import { mapPgError } from "@/lib/db/errors";
import { AppError } from "@/lib/http/errors";
import { log } from "@/lib/log/logger";
import { n } from "@/lib/db/sql";

/**
 * Mongo -> PostgreSQL ETL (Master Plan s6.4 / B2.8).
 *
 * Source of truth: PostgreSQL's `waste_event` is the system of record; `waste_submissions` is the raw input.
 *
 * Safe to retry (idempotent):
 *  - every row written from document D carries `source_doc_id = D._id`. Before writing, the ETL checks whether
 *    rows for D already exist; if so it only (re)marks D as SYNCED. A crash between the PostgreSQL COMMIT and the
 *    Mongo update therefore never creates duplicates - the next run finds the rows and finishes the bookkeeping.
 *  - all rows of one document are written in ONE transaction (all or nothing).
 *  - each document is claimed with an atomic `findOneAndUpdate` lease (`sync_lock`), so two overlapping runs
 *    never process the same document; an abandoned lease expires after 5 minutes.
 *
 * Failures: the document becomes FAILED with a safe `sync_error` and an incremented `sync_attempts`; it stays in
 * Mongo for the admin to inspect and retry (max 5 attempts via RETRY runs).
 */
const LEASE_MS = 5 * 60_000;
export const MAX_ATTEMPTS = 5;

export interface EtlOutcome {
  docId: string;
  result: "synced" | "skipped" | "failed";
  rows: number;
  error?: string;
}

export interface EtlRunSummary {
  runId: number;
  mode: "PENDING" | "RETRY";
  seen: number;
  synced: number;
  skipped: number;
  failed: number;
  rowsWritten: number;
  outcomes: EtlOutcome[];
}

interface Lookups {
  reasons: Map<string, number>;
  routes: Map<string, number>;
}

async function loadLookups(): Promise<Lookups> {
  const reasons = await query<{ reason_code: string; reason_id: number }>("SELECT reason_code, reason_id FROM waste_reason");
  const routes = await query<{ route_name: string; route_id: number }>("SELECT route_name, route_id FROM disposal_route");
  return { reasons: new Map(reasons.map((r) => [r.reason_code, r.reason_id])), routes: new Map(routes.map((r) => [r.route_name, r.route_id])) };
}

/** Error text stored on the document: specific for known problems, generic otherwise (never raw driver internals). */
function safeError(err: unknown): string {
  if (err instanceof AdapterError) return err.message;
  const mapped = mapPgError(err);
  if (mapped) return mapped.message;
  if (err instanceof AppError) return err.message;
  return "Unexpected error while importing this submission";
}

async function processDocument(doc: Document, lookups: Lookups, runId: number, userId: number | null): Promise<EtlOutcome> {
  const docId = String(doc._id);
  const mongo = await getMongoDb();
  const coll = mongo.collection("waste_submissions");
  const release = { $unset: { sync_lock: "" } } as const;

  try {
    // Idempotency: rows for this document already in PostgreSQL? Then only the bookkeeping is missing.
    const existing = await query<{ waste_id: number }>("SELECT waste_id FROM waste_event WHERE source_doc_id = $1 ORDER BY waste_id", [docId]);
    if (existing.length) {
      await coll.updateOne(
        { _id: doc._id },
        { $set: { sync_status: "SYNCED", sql_waste_ids: existing.map((e) => e.waste_id), synced_at: new Date() }, $unset: { sync_error: "", sync_lock: "" } },
      );
      return { docId, result: "skipped", rows: 0 };
    }

    const rows: WasteRow[] = adaptSubmission({ estab_kind: String(doc.estab_kind), payload: doc.payload });
    const occurredOn = String(doc.service_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) throw new AdapterError("service_date is not a valid date");

    // Step 3 of the plan: resolve messy food names (exact -> alias -> trigram -> vector) outside the DB transaction.
    const resolved: { row: WasteRow; foodId: number | null; flag: string | null }[] = [];
    for (const row of rows) {
      if (!row.rawFoodName) {
        resolved.push({ row, foodId: null, flag: null });
        continue;
      }
      const r = await resolveFoodName(row.rawFoodName);
      const weak = r.foodId !== null && (r.method === "TRIGRAM" || r.method === "VECTOR") && r.confidence < CACHE_MIN_CONFIDENCE;
      const flag = r.foodId === null ? `[UNRESOLVED NAME: ${row.rawFoodName}]` : weak ? `[LOW-CONFIDENCE MATCH: "${row.rawFoodName}" -> ${r.name} (${r.confidence.toFixed(2)})]` : null;
      resolved.push({ row, foodId: r.foodId, flag });
    }

    // Step 4: one transaction; the enrich trigger fills cost and CO2e.
    const ids = await withTransaction(async (c) => {
      const out: number[] = [];
      for (const { row, foodId, flag } of resolved) {
        const reasonId = lookups.reasons.get(row.reasonCode);
        const routeId = lookups.routes.get(row.routeName);
        if (!reasonId || !routeId) throw new AdapterError(`Unknown reason/route (${row.reasonCode}/${row.routeName})`);
        const notes = [flag, row.notes].filter(Boolean).join(" ") || null;
        const ins = await c.query<{ waste_id: number }>(
          `INSERT INTO waste_event (establishment_id, food_id, reason_id, route_id, stage, quantity_kg, was_edible, notes, occurred_on, source_doc_id)
           VALUES ($1, $2, $3, $4, $5::waste_stage, $6, $7, $8, $9::date, $10) RETURNING waste_id`,
          [doc.establishment_id, foodId, reasonId, routeId, row.stage, row.quantityKg, row.wasEdible, notes, occurredOn, docId],
        );
        out.push(ins.rows[0]!.waste_id);
      }
      return out;
    });

    // Step 5: close the loop in Mongo. If this fails the doc stays PENDING and the next run takes the "skipped" path above.
    await coll.updateOne(
      { _id: doc._id },
      { $set: { sync_status: "SYNCED", sql_waste_ids: ids, synced_at: new Date(), etl_run_id: runId }, $unset: { sync_error: "", sync_lock: "" } },
    );
    return { docId, result: "synced", rows: ids.length };
  } catch (err) {
    const message = safeError(err);
    log.warn("etl document failed", { docId, runId, userId, err });
    try {
      await coll.updateOne({ _id: doc._id }, { $set: { sync_status: "FAILED", sync_error: message }, $inc: { sync_attempts: 1 }, ...release });
    } catch (markErr) {
      log.error("etl could not mark document failed", { docId, err: markErr });
    }
    return { docId, result: "failed", rows: 0, error: message };
  }
}

/** Atomically leases the next eligible document (PENDING, or FAILED with attempts left in RETRY mode). */
async function leaseNext(mode: "PENDING" | "RETRY", runId: number, onlyId?: ObjectId) {
  const mongo = await getMongoDb();
  const now = new Date();
  const filter: Document = {
    ...(onlyId ? { _id: onlyId } : {}),
    sync_status: mode === "RETRY" ? "FAILED" : "PENDING",
    ...(mode === "RETRY" ? { $or: [{ sync_attempts: { $lt: MAX_ATTEMPTS } }, { sync_attempts: { $exists: false } }] } : {}),
    $and: [{ $or: [{ sync_lock: { $exists: false } }, { "sync_lock.until": { $lt: now } }] }],
  };
  return mongo
    .collection("waste_submissions")
    .findOneAndUpdate(filter, { $set: { sync_lock: { owner: runId, until: new Date(now.getTime() + LEASE_MS) } } }, { sort: { submitted_at: 1 }, returnDocument: "after" });
}

export async function runEtl(opts: { mode: "PENDING" | "RETRY"; userId: number | null; limit?: number; onlyDocId?: string }): Promise<EtlRunSummary> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const run = await queryOne<{ run_id: number }>("INSERT INTO etl_run_log (triggered_by, mode) VALUES ($1, $2) RETURNING run_id", [opts.userId, opts.mode]);
  const runId = run!.run_id;
  const lookups = await loadLookups();
  const outcomes: EtlOutcome[] = [];

  const onlyId = opts.onlyDocId ? new ObjectId(opts.onlyDocId) : undefined;
  for (let i = 0; i < (onlyId ? 1 : limit); i++) {
    const doc = await leaseNext(opts.mode, runId, onlyId);
    if (!doc) break;
    outcomes.push(await processDocument(doc, lookups, runId, opts.userId));
  }

  const summary: EtlRunSummary = {
    runId,
    mode: opts.mode,
    seen: outcomes.length,
    synced: outcomes.filter((o) => o.result === "synced").length,
    skipped: outcomes.filter((o) => o.result === "skipped").length,
    failed: outcomes.filter((o) => o.result === "failed").length,
    rowsWritten: outcomes.reduce((s, o) => s + o.rows, 0),
    outcomes,
  };
  await query(
    `UPDATE etl_run_log SET finished_at = now(), docs_seen = $2, docs_synced = $3, docs_skipped = $4, docs_failed = $5, rows_written = $6 WHERE run_id = $1`,
    [runId, summary.seen, summary.synced, summary.skipped, summary.failed, summary.rowsWritten],
  );
  return summary;
}

/** Re-queues ONE failed document and processes it immediately (the "retry" button on the admin page). */
export async function retryDocument(docId: string, userId: number | null): Promise<EtlRunSummary> {
  if (!ObjectId.isValid(docId)) throw new AppError(400, "BAD_REQUEST", "Invalid document id.");
  const mongo = await getMongoDb();
  const doc = await mongo.collection("waste_submissions").findOne({ _id: new ObjectId(docId) });
  if (!doc) throw new AppError(404, "NOT_FOUND", "Submission not found.");
  if (doc.sync_status !== "FAILED") throw new AppError(409, "CONFLICT", `Only failed submissions can be retried (this one is ${String(doc.sync_status).toLowerCase()}).`);
  if (n(doc.sync_attempts) >= MAX_ATTEMPTS) throw new AppError(409, "CONFLICT", `This submission already failed ${MAX_ATTEMPTS} times; fix the data and re-submit.`);
  return runEtl({ mode: "RETRY", userId, onlyDocId: docId });
}

export async function recentRuns(limit = 8) {
  const rows = await query<{ run_id: number; started_at: string; finished_at: string | null; mode: string; docs_seen: number; docs_synced: number; docs_skipped: number; docs_failed: number; rows_written: number; who: string | null }>(
    `SELECT r.run_id, r.started_at, r.finished_at, r.mode, r.docs_seen, r.docs_synced, r.docs_skipped, r.docs_failed, r.rows_written, u.full_name AS who
       FROM etl_run_log r LEFT JOIN app_user u ON u.user_id = r.triggered_by ORDER BY r.run_id DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function failedDocuments(limit = 25) {
  const mongo = await getMongoDb();
  const docs = await mongo.collection("waste_submissions").find({ sync_status: "FAILED" }).sort({ submitted_at: -1 }).limit(limit).toArray();
  return docs.map((d) => ({
    id: String(d._id),
    establishmentId: d.establishment_id as number,
    kind: d.estab_kind as string,
    serviceDate: d.service_date as string,
    error: (d.sync_error as string | undefined) ?? "Unknown error",
    attempts: n(d.sync_attempts),
    retryable: n(d.sync_attempts) < MAX_ATTEMPTS,
  }));
}
