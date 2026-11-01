-- title: Semantic top-5 recipients for a listing (pgvector)
-- concepts: pgvector cosine distance operator <=> with an HNSW index, LATERAL join, hard filters before ranking, recursive zone_root()
-- purpose: Match surplus food to the organisations that can use it. Hard constraints are applied first in WHERE (same locality, cooked-food policy, enough capacity); only the survivors are ordered by meaning (1 - cosine distance between the listing description and the recipient's need profile). Needs embeddings: run `npm run demo:prepare` once.
-- mode: select
-- reading: The top 5 recipients that pass the hard filters, ordered by cosine similarity between the listing text and their need profile (1 = identical meaning).
SELECT sl.listing_id,
       LEFT(sl.description, 50)                                 AS listing,
       r.org_name,
       ROUND((1 - (r.need_embedding <=> sl.desc_embedding))::numeric, 3) AS similarity,
       r.daily_capacity_kg
  FROM surplus_listing sl
  JOIN establishment e ON e.establishment_id = sl.establishment_id
  CROSS JOIN LATERAL (
        SELECT r2.*
          FROM recipient_org r2
         WHERE zone_root(r2.zone_id) = zone_root(e.zone_id)
           AND (NOT sl.is_cooked OR r2.accepts_cooked)
           AND r2.daily_capacity_kg >= sl.offered_qty_kg * 0.5
           AND r2.need_embedding IS NOT NULL
         ORDER BY r2.need_embedding <=> sl.desc_embedding
         LIMIT 5) r
 WHERE sl.listing_id = (SELECT listing_id FROM surplus_listing WHERE desc_embedding IS NOT NULL ORDER BY listing_id DESC LIMIT 1)
 ORDER BY similarity DESC;
