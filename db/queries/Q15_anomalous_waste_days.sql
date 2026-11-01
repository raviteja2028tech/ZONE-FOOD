-- title: Anomalous waste days (z-score above 2.5 against the trailing 28 days)
-- concepts: CTE chain, window frame ROWS BETWEEN 28 PRECEDING AND 1 PRECEDING, AVG/STDDEV_SAMP OVER, z-score
-- purpose: Detect a bad day without machine learning. Each day is compared with that establishment's own previous four weeks (excluding the day itself); a z-score above 2.5 means "far above normal" - a fridge failure, a cancelled event. It feeds the anomaly list on the analytics page.
-- mode: select
-- reading: Each row is one establishment-day far above its own four-week norm (expected_kg); z_score is how many standard deviations above.
WITH stats AS (
  SELECT establishment_id, name, occurred_on, total_waste_kg AS kg,
         AVG(total_waste_kg)         OVER w AS roll_mean,
         STDDEV_SAMP(total_waste_kg) OVER w AS roll_sd
    FROM v_daily_waste
  WINDOW w AS (PARTITION BY establishment_id ORDER BY occurred_on ROWS BETWEEN 28 PRECEDING AND 1 PRECEDING)
)
SELECT name,
       occurred_on,
       ROUND(kg, 1)                                         AS kg,
       ROUND(roll_mean, 1)                                  AS expected_kg,
       ROUND((kg - roll_mean) / NULLIF(roll_sd, 0), 2)      AS z_score
  FROM stats
 WHERE roll_sd > 0 AND (kg - roll_mean) / roll_sd > 2.5
 ORDER BY z_score DESC
 LIMIT 15;
