-- title: Recipients with idle capacity while surplus expired unclaimed nearby
-- concepts: NOT EXISTS anti-join, LATERAL subquery, stored function zone_root() (recursive CTE), compatibility predicate
-- purpose: A matching failure report. For each recipient with no claim in progress, how many listings in its own locality expired with nobody claiming them - listings it could legally have taken (cooked-food policy respected). A high number means the marketplace is not reaching that organisation.
-- mode: select
-- reading: Each row is a recipient with nothing in progress while compatible surplus in its locality expired unclaimed; unclaimed_kg quantifies the missed opportunity.
SELECT r.org_name,
       r.org_type,
       r.daily_capacity_kg,
       x.expired_listings,
       ROUND(x.lost_kg)  AS unclaimed_kg
  FROM recipient_org r
  JOIN LATERAL (
        SELECT COUNT(*) AS expired_listings, SUM(sl.offered_qty_kg) AS lost_kg
          FROM surplus_listing sl
          JOIN establishment e ON e.establishment_id = sl.establishment_id
         WHERE sl.status = 'EXPIRED'
           AND sl.claimed_qty_kg = 0
           AND sl.expires_at >= now() - interval '30 days'
           AND zone_root(e.zone_id) = zone_root(r.zone_id)
           AND (NOT sl.is_cooked OR r.accepts_cooked)) x ON x.expired_listings > 0
 WHERE NOT EXISTS (SELECT 1 FROM redistribution_claim rc
                    WHERE rc.recipient_id = r.recipient_id AND rc.status IN ('REQUESTED', 'APPROVED'))
 ORDER BY x.lost_kg DESC;
