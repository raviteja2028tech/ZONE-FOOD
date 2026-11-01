import "server-only";
import { query } from "@/lib/db/postgres";

/** Live inventory of the database objects behind the advanced features (the same catalogue queries as docs/DB_OBJECTS.md). */
export async function getDbObjects() {
  const [tables, views, indexes, routines, triggers, partitions, extensions, mv] = await Promise.all([
    query<{ name: string; kind: string; rows: string }>(
      `SELECT c.relname AS name, CASE c.relkind WHEN 'p' THEN 'partitioned' ELSE 'table' END AS kind, c.reltuples::bigint AS rows
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY c.relname`),
    query<{ name: string; kind: string; comment: string }>(
      `SELECT c.relname AS name, CASE c.relkind WHEN 'm' THEN 'materialized view' ELSE 'view' END AS kind, coalesce(obj_description(c.oid), '') AS comment
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('v','m') ORDER BY 1`),
    query<{ name: string; table: string; method: string; partial: boolean; unique: boolean; size: string }>(
      `SELECT i.indexname AS name, i.tablename AS table, am.amname AS method, (ix.indpred IS NOT NULL) AS partial, ix.indisunique AS unique,
              pg_size_pretty(pg_relation_size(c.oid)) AS size
         FROM pg_indexes i JOIN pg_class c ON c.relname = i.indexname AND c.relnamespace = 'public'::regnamespace
         JOIN pg_index ix ON ix.indexrelid = c.oid JOIN pg_am am ON am.oid = c.relam
        WHERE i.schemaname = 'public' AND NOT c.relispartition AND i.tablename !~ '_20[0-9]{2}_[0-9]{2}$' AND i.tablename NOT LIKE '%_default'
        ORDER BY i.tablename, i.indexname`),
    query<{ name: string; kind: string; args: string; purpose: string }>(
      `SELECT p.proname AS name, CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS kind, pg_get_function_identity_arguments(p.oid) AS args,
              coalesce(obj_description(p.oid, 'pg_proc'), '') AS purpose
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prokind IN ('f','p') AND p.proname NOT LIKE 'trg\\_%' AND p.proname NOT LIKE 'gtrgm%' ORDER BY 2 DESC, 1`),
    query<{ name: string; table: string; timing: string; events: string; fn: string }>(
      `SELECT t.tgname AS name, c.relname AS table, CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
              concat_ws(' OR ', CASE WHEN t.tgtype & 4 = 4 THEN 'INSERT' END, CASE WHEN t.tgtype & 8 = 8 THEN 'DELETE' END, CASE WHEN t.tgtype & 16 = 16 THEN 'UPDATE' END) AS events,
              p.proname AS fn
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY c.relname, t.tgname`),
    query<{ name: string; bound: string; rows: string }>(
      `SELECT c.relname AS name, pg_get_expr(c.relpartbound, c.oid) AS bound, c.reltuples::bigint AS rows
         FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'waste_event'::regclass ORDER BY c.relname`),
    query<{ name: string; version: string }>("SELECT extname AS name, extversion AS version FROM pg_extension ORDER BY 1"),
    query<{ rows: number }>("SELECT count(*)::int AS rows FROM mv_zone_monthly"),
  ]);
  return { tables, views, indexes, routines, triggers, partitions, extensions, mvRows: mv[0]?.rows ?? 0 };
}

export type DbObjects = Awaited<ReturnType<typeof getDbObjects>>;
