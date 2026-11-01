import "server-only";
import { query, queryOne } from "@/lib/db/postgres";
import { n } from "@/lib/db/sql";

/**
 * Analytics for the /analytics page. Each function is the application form of a catalogue query (db/queries/Qnn),
 * parameterised by scope: `establishmentId` pins it to one establishment, undefined means the whole zone.
 * Integration tests assert these agree with the catalogue queries on the same data.
 */
export interface Scope {
  establishmentId?: number;
}
const est = (s: Scope) => s.establishmentId ?? null;

/** Q16 - daily waste with a rolling 7-day average, one row per calendar day (no gaps). */
export async function dailyTrend(scope: Scope, days = 56) {
  const rows = await query<{ day: string; kg: string; rolling: string }>(
    `WITH cal AS (SELECT d::date AS day FROM generate_series(CURRENT_DATE - ($1::int - 1) - 6, CURRENT_DATE, interval '1 day') d),
          daily AS (SELECT c.day, COALESCE(SUM(v.total_waste_kg), 0) AS kg
                      FROM cal c LEFT JOIN v_daily_waste v ON v.occurred_on = c.day AND ($2::int IS NULL OR v.establishment_id = $2)
                     GROUP BY c.day),
          roll AS (SELECT day, kg, AVG(kg) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling FROM daily)
     SELECT day::text, ROUND(kg, 1) AS kg, ROUND(rolling, 1) AS rolling
       FROM roll WHERE day > CURRENT_DATE - $1::int AND (day < CURRENT_DATE OR kg > 0) ORDER BY day`,
    [days, est(scope)],
  );
  return rows.map((r) => ({ day: r.day, kg: n(r.kg), rolling: n(r.rolling) }));
}

/** Q15 - days far above the establishment's own trailing four weeks (z-score > 2.5), most recent first. */
export async function anomalies(scope: Scope, days = 60, limit = 8) {
  const rows = await query<{ establishment_id: number; name: string; day: string; kg: string; expected: string; z: string }>(
    `WITH stats AS (
        SELECT establishment_id, name, occurred_on, total_waste_kg AS kg,
               AVG(total_waste_kg) OVER w AS m, STDDEV_SAMP(total_waste_kg) OVER w AS sd
          FROM v_daily_waste WHERE ($1::int IS NULL OR establishment_id = $1)
        WINDOW w AS (PARTITION BY establishment_id ORDER BY occurred_on ROWS BETWEEN 28 PRECEDING AND 1 PRECEDING))
      SELECT establishment_id, name, occurred_on::text AS day, ROUND(kg, 1) AS kg, ROUND(m, 1) AS expected, ROUND((kg - m) / NULLIF(sd, 0), 2) AS z
        FROM stats WHERE sd > 0 AND (kg - m) / sd > 2.5 AND occurred_on >= CURRENT_DATE - $2::int
       ORDER BY occurred_on DESC, z DESC LIMIT $3`,
    [est(scope), days, limit],
  );
  return rows.map((r) => ({ establishmentId: r.establishment_id, name: r.name, day: r.day, kg: n(r.kg), expectedKg: n(r.expected), z: n(r.z) }));
}

/** Q07 - average kg per observed day for each weekday (0 = Sunday). */
export async function weekdayProfile(scope: Scope) {
  const rows = await query<{ dow: number; avg_kg: string }>(
    `SELECT EXTRACT(DOW FROM occurred_on)::int AS dow, ROUND(SUM(total_waste_kg) / COUNT(DISTINCT occurred_on)) AS avg_kg
       FROM v_daily_waste WHERE occurred_on >= CURRENT_DATE - 90 AND ($1::int IS NULL OR establishment_id = $1)
      GROUP BY 1 ORDER BY 1`,
    [est(scope)],
  );
  const byDow = new Map(rows.map((r) => [r.dow, n(r.avg_kg)]));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, dow) => ({ label, dow, avgKg: byDow.get(dow) ?? 0 }));
}

/** Q13 - diversion rate by month. The zone-wide figure reads the materialised view; an establishment's the daily view. */
export async function diversionTrend(scope: Scope) {
  const rows = scope.establishmentId
    ? await query<{ month: string; waste: string; diverted: string }>(
        `SELECT to_char(date_trunc('month', occurred_on), 'YYYY-MM') AS month, SUM(total_waste_kg) AS waste, SUM(diverted_kg) AS diverted
           FROM v_daily_waste WHERE establishment_id = $1 GROUP BY 1 ORDER BY 1`,
        [scope.establishmentId],
      )
    : await query<{ month: string; waste: string; diverted: string }>(
        `SELECT to_char(month, 'YYYY-MM') AS month, SUM(waste_kg) AS waste, SUM(diverted_kg) AS diverted FROM mv_zone_monthly GROUP BY month ORDER BY month`,
      );
  return rows.map((r) => ({ month: r.month, wasteKg: Math.round(n(r.waste)), pct: n(r.waste) > 0 ? Math.round((n(r.diverted) / n(r.waste)) * 1000) / 10 : 0 }));
}

/** Q17 - per-capita waste ranked within each category. Zone: the two worst per category; establishment: its own row. */
export async function peerRanking(scope: Scope, limit = 10) {
  const rows = await query<{ establishment_id: number; name: string; category_name: string; kg_per_capita: string; worst_rank: number; peers: number; pct_rank: string; cat_avg: string }>(
    `WITH per AS (
        SELECT e.establishment_id, e.name, ec.category_id, ec.category_name, SUM(w.quantity_kg) / e.capacity AS kpc
          FROM waste_event w
          JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
          JOIN establishment e ON e.establishment_id = w.establishment_id
          JOIN establishment_category ec ON ec.category_id = e.category_id
         WHERE w.occurred_on >= CURRENT_DATE - 90 AND e.is_active
         GROUP BY e.establishment_id, e.name, e.capacity, ec.category_id, ec.category_name),
      ranked AS (
        SELECT *, RANK() OVER (PARTITION BY category_id ORDER BY kpc DESC) AS worst_rank,
               COUNT(*) OVER (PARTITION BY category_id) AS peers,
               PERCENT_RANK() OVER (PARTITION BY category_id ORDER BY kpc) AS pct_rank,
               AVG(kpc) OVER (PARTITION BY category_id) AS cat_avg
          FROM per)
      SELECT establishment_id, name, category_name, ROUND(kpc, 3) AS kg_per_capita, worst_rank, peers, ROUND(pct_rank::numeric, 2) AS pct_rank, ROUND(cat_avg, 3) AS cat_avg
        FROM ranked
       WHERE ($1::int IS NULL AND worst_rank <= 2 AND peers >= 3) OR establishment_id = $1
       ORDER BY pct_rank DESC, kpc DESC LIMIT $2`,
    [est(scope), limit],
  );
  return rows.map((r) => ({
    establishmentId: r.establishment_id, name: r.name, category: r.category_name, kgPerCapita: n(r.kg_per_capita),
    rank: r.worst_rank, peers: r.peers, percentile: n(r.pct_rank), categoryAvg: n(r.cat_avg),
  }));
}

/** Preparation efficiency from v_preparation_efficiency over the last 90 days. */
export async function prepSummary(scope: Scope) {
  const row = await queryOne<{ sessions: number; poor: number; util: string | null; turnout: string | null; unconsumed: string | null }>(
    `SELECT COUNT(*)::int AS sessions, COUNT(*) FILTER (WHERE utilisation_pct < 75)::int AS poor,
            ROUND(AVG(utilisation_pct), 1) AS util, ROUND(AVG(turnout_pct), 1) AS turnout, ROUND(SUM(unconsumed_kg)) AS unconsumed
       FROM v_preparation_efficiency WHERE service_date >= CURRENT_DATE - 90 AND ($1::int IS NULL OR establishment_id = $1)`,
    [est(scope)],
  );
  return { sessions: row?.sessions ?? 0, poorSessions: row?.poor ?? 0, avgUtilisation: n(row?.util), avgTurnout: n(row?.turnout), unconsumedKg: n(row?.unconsumed) };
}

export async function utilisationWeekly(scope: Scope) {
  const rows = await query<{ wk: string; util: string; turnout: string }>(
    `SELECT to_char(date_trunc('week', service_date), 'YYYY-MM-DD') AS wk, ROUND(AVG(utilisation_pct), 1) AS util, ROUND(AVG(turnout_pct), 1) AS turnout
       FROM v_preparation_efficiency WHERE service_date >= CURRENT_DATE - 84 AND ($1::int IS NULL OR establishment_id = $1)
      GROUP BY 1 ORDER BY 1`,
    [est(scope)],
  );
  return rows.map((r) => ({ week: r.wk, utilisation: n(r.util), turnout: n(r.turnout) }));
}

/** Q05 - kitchens below 75% utilisation on at least 10 sessions (zone view). */
export async function overPreparers(limit = 6) {
  const rows = await query<{ name: string; category_name: string; poor: number; util: string; kg: string }>(
    `SELECT e.name, ec.category_name, COUNT(*)::int AS poor, ROUND(AVG(v.utilisation_pct), 1) AS util, ROUND(SUM(v.unconsumed_kg)) AS kg
       FROM v_preparation_efficiency v JOIN establishment e ON e.establishment_id = v.establishment_id
       JOIN establishment_category ec ON ec.category_id = e.category_id
      WHERE v.utilisation_pct < 75 AND v.service_date >= CURRENT_DATE - 90
      GROUP BY e.establishment_id, e.name, ec.category_name HAVING COUNT(*) >= 10 ORDER BY poor DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ name: r.name, category: r.category_name, poorSessions: r.poor, avgUtilisation: n(r.util), unconsumedKg: n(r.kg) }));
}

/** Q10/Q12 - the rescue funnel: offered -> reserved -> collected, plus the median time to pickup. */
export async function rescueFunnel(scope: Scope) {
  const row = await queryOne<{ listings: string; offered: string; reserved: string; collected: string }>(
    `SELECT COALESCE(SUM(listings), 0) AS listings, COALESCE(SUM(offered_kg), 0) AS offered, COALESCE(SUM(reserved_kg), 0) AS reserved, COALESCE(SUM(collected_kg), 0) AS collected
       FROM v_redistribution_performance WHERE ($1::int IS NULL OR establishment_id = $1)`,
    [est(scope)],
  );
  const med = await queryOne<{ hours: string | null }>(
    `SELECT ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (rc.collected_at - sl.created_at)) / 3600))::numeric, 1) AS hours
       FROM redistribution_claim rc JOIN surplus_listing sl ON sl.listing_id = rc.listing_id
      WHERE rc.status = 'COLLECTED' AND rc.collected_at IS NOT NULL AND ($1::int IS NULL OR sl.establishment_id = $1)`,
    [est(scope)],
  );
  const offered = n(row?.offered);
  return {
    listings: n(row?.listings), offeredKg: Math.round(offered), reservedKg: Math.round(n(row?.reserved)), collectedKg: Math.round(n(row?.collected)),
    ratePct: offered > 0 ? Math.round((n(row?.collected) / offered) * 1000) / 10 : 0, medianHours: med?.hours === null || med?.hours === undefined ? null : n(med.hours),
  };
}

/** Q20 - suppliers ranked by the share of delivered stock later written off as spoilage (zone view). */
export async function supplierSpoilage(limit = 6) {
  const rows = await query<{ supplier: string; received: string; spoiled: string; rate: string }>(
    `SELECT s.name AS supplier, ROUND(SUM(l.received_qty)) AS received, ROUND(COALESCE(SUM(sp.kg), 0)) AS spoiled,
            ROUND(100.0 * COALESCE(SUM(sp.kg), 0) / SUM(l.received_qty), 2) AS rate
       FROM supplier s JOIN procurement p ON p.supplier_id = s.supplier_id JOIN procurement_line pl ON pl.procurement_id = p.procurement_id
       JOIN inventory_lot l ON l.source_line_id = pl.line_id
       LEFT JOIN LATERAL (SELECT SUM(w.quantity_kg) AS kg FROM waste_event w JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code = 'SPOILAGE' WHERE w.lot_id = l.lot_id) sp ON TRUE
      GROUP BY s.supplier_id, s.name HAVING SUM(l.received_qty) > 500 ORDER BY rate DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ supplier: r.supplier, receivedKg: n(r.received), spoiledKg: n(r.spoiled), ratePct: n(r.rate) }));
}

/** Q21 - how the figures were captured (provenance), for one establishment or the whole zone. */
export async function provenance(scope: Scope) {
  const rows = await query<{ src: string; kg: string }>(
    `SELECT w.measurement_source AS src, SUM(w.quantity_kg) AS kg
       FROM waste_event w JOIN waste_reason wr ON wr.reason_id = w.reason_id AND wr.reason_code <> 'REDISTRIBUTED'
      WHERE ($1::int IS NULL OR w.establishment_id = $1) GROUP BY 1`,
    [est(scope)],
  );
  const total = rows.reduce((s, r) => s + n(r.kg), 0) || 1;
  const get = (k: string) => Math.round((n(rows.find((r) => r.src === k)?.kg) / total) * 1000) / 10;
  return { manualPct: get("MANUAL"), etlPct: get("ETL_IMPORT"), systemPct: get("SYSTEM") };
}

/** Last N days of daily waste for sparklines on KPI cards. */
export async function sparkline(scope: Scope, days = 14): Promise<number[]> {
  const rows = await dailyTrend(scope, days);
  return rows.map((r) => r.kg);
}

/** fn_waste_intensity - kg wasted per kg served (stored function), last 30 days. */
export async function wasteIntensity(establishmentId: number): Promise<number | null> {
  const row = await queryOne<{ v: string | null }>("SELECT fn_waste_intensity($1, CURRENT_DATE - 30, CURRENT_DATE) AS v", [establishmentId]);
  return row?.v === null || row?.v === undefined ? null : n(row.v);
}
