-- title: Median hours from listing to pickup, per establishment kind
-- concepts: ordered-set aggregate PERCENTILE_CONT, interval arithmetic, multi-table JOIN
-- purpose: Speed of rescue. The median is used instead of the mean because a few listings collected days later would distort an average. A slow kind needs earlier listing or better matching.
-- mode: select
-- reading: median_hours is the typical time from listing to pickup; p90_hours shows the slow tail.
SELECT ec.kind,
       COUNT(*)                                                                        AS pickups,
       ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (rc.collected_at - sl.created_at)) / 3600))::numeric, 2) AS median_hours,
       ROUND((PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (rc.collected_at - sl.created_at)) / 3600))::numeric, 2) AS p90_hours
  FROM redistribution_claim rc
  JOIN surplus_listing sl        ON sl.listing_id = rc.listing_id
  JOIN establishment e           ON e.establishment_id = sl.establishment_id
  JOIN establishment_category ec ON ec.category_id = e.category_id
 WHERE rc.status = 'COLLECTED' AND rc.collected_at IS NOT NULL
 GROUP BY ec.kind
 ORDER BY median_hours;
