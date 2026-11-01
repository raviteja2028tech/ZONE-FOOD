import "server-only";
import { query, queryOne } from "@/lib/db/postgres";
import { Params, paged, type Page } from "@/lib/db/sql";

export interface AuditRow {
  audit_id: number;
  changed_at: string;
  table_name: string;
  record_pk: string;
  action: "I" | "U" | "D";
  who: string | null;
  role: string | null;
  changes: { field: string; from: unknown; to: unknown }[];
}

const SKIP = new Set(["created_at", "last_login_at"]);

/** Field-level difference between the before and after images stored by trigger T4. */
function diff(oldRow: Record<string, unknown> | null, newRow: Record<string, unknown> | null) {
  if (!oldRow || !newRow) return [];
  return Object.keys(newRow)
    .filter((k) => !SKIP.has(k) && JSON.stringify(oldRow[k]) !== JSON.stringify(newRow[k]))
    .map((k) => ({ field: k, from: oldRow[k], to: newRow[k] }));
}

export async function listAudit(f: { table?: string; action?: string }, page: Page) {
  const params = new Params();
  const where: string[] = [];
  if (f.table) where.push(`a.table_name = ${params.add(f.table)}`);
  if (f.action) where.push(`a.action = ${params.add(f.action)}`);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM audit_log a ${clause}`, params.values);
  const rows = await query<{ audit_id: number; changed_at: string; table_name: string; record_pk: string; action: "I" | "U" | "D"; who: string | null; role: string | null; old_row: Record<string, unknown> | null; new_row: Record<string, unknown> | null }>(
    `SELECT a.audit_id, a.changed_at, a.table_name, a.record_pk, a.action, u.full_name AS who, u.role::text AS role, a.old_row, a.new_row
       FROM audit_log a LEFT JOIN app_user u ON u.user_id = a.changed_by ${clause}
      ORDER BY a.audit_id DESC LIMIT ${params.add(page.pageSize)} OFFSET ${params.add(page.offset)}`,
    params.values,
  );
  const mapped: AuditRow[] = rows.map((r) => ({
    audit_id: r.audit_id, changed_at: r.changed_at, table_name: r.table_name, record_pk: r.record_pk, action: r.action, who: r.who, role: r.role,
    changes: r.action === "U" ? diff(r.old_row, r.new_row) : [],
  }));
  return paged(mapped, total?.n ?? 0, page);
}

export const auditTables = () => query<{ table_name: string }>("SELECT DISTINCT table_name FROM audit_log ORDER BY 1");
