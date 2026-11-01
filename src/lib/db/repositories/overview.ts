import "server-only";
import { queryOne } from "@/lib/db/postgres";

export interface DatasetCounts {
  zones: number;
  establishments: number;
  recipientOrgs: number;
  wasteEvents: number;
  surplusListings: number;
  claims: number;
}

/**
 * Row counts for the headline tables, in a single round trip. All values are synthetic seed
 * data from Part 1. Scalar sub-selects keep this one explicit statement instead of six queries.
 */
export async function getDatasetCounts(): Promise<DatasetCounts> {
  const row = await queryOne<Record<string, number>>(
    `SELECT (SELECT count(*) FROM zone)::int                  AS zones,
            (SELECT count(*) FROM establishment)::int         AS establishments,
            (SELECT count(*) FROM recipient_org)::int         AS recipient_orgs,
            (SELECT count(*) FROM waste_event)::int           AS waste_events,
            (SELECT count(*) FROM surplus_listing)::int       AS surplus_listings,
            (SELECT count(*) FROM redistribution_claim)::int  AS claims`,
  );
  return {
    zones: row?.zones ?? 0,
    establishments: row?.establishments ?? 0,
    recipientOrgs: row?.recipient_orgs ?? 0,
    wasteEvents: row?.waste_events ?? 0,
    surplusListings: row?.surplus_listings ?? 0,
    claims: row?.claims ?? 0,
  };
}
