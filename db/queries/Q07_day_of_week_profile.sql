-- title: Day-of-week waste profile
-- concepts: EXTRACT(DOW), GROUP BY, ORDER BY, derived average per calendar day
-- purpose: Restaurants peak on weekends, colleges drop on Sundays. The weekly rhythm tells kitchens which days to prepare less. Averages are per calendar day (total / number of distinct days), so a weekday with more occurrences is not unfairly larger.
-- mode: select
-- reading: avg_kg_per_day puts weekdays on equal footing (dow 0 = Sunday). A day well above the others is where to cut preparation.
SELECT EXTRACT(DOW FROM occurred_on)::int                    AS dow,
       TRIM(to_char(occurred_on, 'Day'))                     AS weekday,
       COUNT(DISTINCT occurred_on)                           AS days_observed,
       ROUND(SUM(total_waste_kg))                            AS total_kg,
       ROUND(SUM(total_waste_kg) / COUNT(DISTINCT occurred_on)) AS avg_kg_per_day
  FROM v_daily_waste
 WHERE occurred_on >= CURRENT_DATE - 90
 GROUP BY EXTRACT(DOW FROM occurred_on), TRIM(to_char(occurred_on, 'Day'))
 ORDER BY dow;
