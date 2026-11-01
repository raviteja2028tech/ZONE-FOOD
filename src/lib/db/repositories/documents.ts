import "server-only";
import { ObjectId, type Filter, type Document } from "mongodb";
import { getMongoDb } from "@/lib/db/mongo";
import { AppError } from "@/lib/http/errors";
import { log } from "@/lib/log/logger";
import { queryOne } from "@/lib/db/postgres";
import { parseWith } from "@/lib/validation/parse";
import { submissionPayloadSchemas, type inspectionSchema } from "@/lib/validation/schemas";
import type { SessionUser } from "@/lib/auth/guard";
import type { z } from "zod";

/**
 * MongoDB-backed documents: variable-shape daily field submissions (`waste_submissions`), inspection reports
 * (`inspection_reports`) and the user activity stream (`activity_stream`). PostgreSQL stays the system of record:
 * submissions are raw input that the ETL (repositories/etl.ts) validates and projects into `waste_event`.
 */

export interface SubmissionDoc {
  _id: string;
  establishment_id: number;
  estab_kind: string;
  service_date: string;
  submitted_at: string;
  sync_status: "PENDING" | "SYNCED" | "FAILED";
  sync_error?: string;
  sync_attempts?: number;
  sql_waste_ids?: number[];
  synced_at?: string;
  payload: Record<string, unknown>;
}

const toPlain = (d: Document): SubmissionDoc => ({
  ...(d as unknown as SubmissionDoc),
  _id: String(d._id),
  submitted_at: new Date(d.submitted_at).toISOString(),
  synced_at: d.synced_at ? new Date(d.synced_at).toISOString() : undefined,
});

/** Inserts a daily submission as PENDING. The payload is validated against the shape for the establishment's kind. */
export async function createSubmission(user: SessionUser, establishmentId: number, input: { serviceDate: string; payload: Record<string, unknown> }) {
  const est = await queryOne<{ kind: string }>(
    "SELECT c.kind FROM establishment e JOIN establishment_category c USING (category_id) WHERE e.establishment_id = $1",
    [establishmentId],
  );
  if (!est) throw new AppError(404, "NOT_FOUND", "Establishment not found.");
  const kind = est.kind as keyof typeof submissionPayloadSchemas;
  const payload = parseWith(submissionPayloadSchemas[kind], input.payload) as Record<string, unknown>;

  const today = new Date().toISOString().slice(0, 10);
  if (input.serviceDate > today) throw new AppError(422, "VALIDATION_FAILED", "Input validation failed.", { serviceDate: "Cannot be in the future" });

  const db = await getMongoDb();
  const doc = {
    establishment_id: establishmentId,
    estab_kind: kind,
    service_date: input.serviceDate,
    submitted_at: new Date(),
    sync_status: "PENDING",
    submitted_by: user.userId,
    payload,
  };
  const res = await db.collection("waste_submissions").insertOne(doc);
  return { id: String(res.insertedId), kind };
}

export interface SubmissionFilters {
  establishmentId?: number;
  status?: string;
  limit?: number;
}

export async function listSubmissions(f: SubmissionFilters): Promise<SubmissionDoc[]> {
  const db = await getMongoDb();
  const filter: Filter<Document> = {};
  if (f.establishmentId) filter.establishment_id = f.establishmentId;
  if (f.status) filter.sync_status = f.status;
  const docs = await db.collection("waste_submissions").find(filter).sort({ submitted_at: -1 }).limit(Math.min(f.limit ?? 25, 100)).toArray();
  return docs.map(toPlain);
}

export async function getSubmission(id: string, scope: { establishmentId?: number }): Promise<SubmissionDoc> {
  if (!ObjectId.isValid(id)) throw new AppError(400, "BAD_REQUEST", "Invalid document id.");
  const db = await getMongoDb();
  const filter: Filter<Document> = { _id: new ObjectId(id) };
  if (scope.establishmentId) filter.establishment_id = scope.establishmentId;
  const doc = await db.collection("waste_submissions").findOne(filter);
  if (!doc) throw new AppError(404, "NOT_FOUND", "Submission not found.");
  return toPlain(doc);
}

/** Aggregation pipeline ($facet, one round trip) behind the status cards on the submissions page. */
export async function submissionStats(scope: { establishmentId?: number }) {
  const db = await getMongoDb();
  const match = scope.establishmentId ? [{ $match: { establishment_id: scope.establishmentId } }] : [];
  const [r] = await db
    .collection("waste_submissions")
    .aggregate([
      ...match,
      { $facet: { by_status: [{ $group: { _id: "$sync_status", n: { $sum: 1 } } }], by_kind: [{ $group: { _id: "$estab_kind", n: { $sum: 1 } } }, { $sort: { n: -1 } }] } },
    ])
    .toArray();
  const byStatus = Object.fromEntries((r?.by_status ?? []).map((x: { _id: string; n: number }) => [x._id, x.n]));
  return {
    pending: (byStatus.PENDING as number) ?? 0,
    synced: (byStatus.SYNCED as number) ?? 0,
    failed: (byStatus.FAILED as number) ?? 0,
    byKind: (r?.by_kind ?? []).map((x: { _id: string; n: number }) => ({ kind: x._id, count: x.n })),
  };
}

/* ------------------------------------------------------------------- inspections */

export interface InspectionDoc {
  _id: string;
  establishment_id: number;
  inspected_at: string;
  template_version?: string;
  sections: { name: string; items: Record<string, unknown>[] }[];
  inspector_notes?: string;
  photos?: string[];
  created_by?: number;
}

const toInspection = (d: Document): InspectionDoc => ({
  ...(d as unknown as InspectionDoc),
  _id: String(d._id),
  inspected_at: new Date(d.inspected_at).toISOString(),
});

export async function createInspection(user: SessionUser, establishmentId: number, input: z.infer<typeof inspectionSchema>) {
  const exists = await queryOne("SELECT 1 FROM establishment WHERE establishment_id = $1", [establishmentId]);
  if (!exists) throw new AppError(404, "NOT_FOUND", "Establishment not found.");
  const db = await getMongoDb();
  const doc = {
    establishment_id: establishmentId,
    inspected_at: input.inspectedAt ? new Date(input.inspectedAt) : new Date(),
    template_version: input.templateVersion ?? (input.sections.length > 2 ? "v2" : "v1"),
    sections: input.sections,
    ...(input.inspectorNotes ? { inspector_notes: input.inspectorNotes } : {}),
    created_by: user.userId,
  };
  const res = await db.collection("inspection_reports").insertOne(doc);
  return { id: String(res.insertedId) };
}

export async function listInspections(scope: { establishmentId?: number }, limit = 25): Promise<(InspectionDoc & { establishment_name?: string })[]> {
  const db = await getMongoDb();
  const docs = await db
    .collection("inspection_reports")
    .find(scope.establishmentId ? { establishment_id: scope.establishmentId } : {})
    .sort({ inspected_at: -1 })
    .limit(Math.min(limit, 100))
    .toArray();
  return docs.map(toInspection);
}

/* ------------------------------------------------------------------ activity stream */

/** Best-effort audit trail in the capped `activity_stream` collection. Never allowed to break the request. */
export async function logActivity(user: SessionUser, event: string, details: Record<string, unknown> = {}) {
  try {
    const db = await getMongoDb();
    await db.collection("activity_stream").insertOne({ user_id: user.userId, ts: new Date(), event, details });
  } catch (err) {
    log.warn("activity log failed", { event, err });
  }
}
