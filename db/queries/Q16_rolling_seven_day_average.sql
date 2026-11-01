-- title: Rolling 7-day average waste for one establishment
-- concepts: AVG() OVER (ORDER BY ... ROWS 6 PRECEDING), window frame, LAG for day-on-day change, generate_series calendar
-- purpose: Smooths daily noise so a kitchen can see its trend (the line on the establishment performance chart). A generated calendar guarantees one row per day, so a day with no waste counts as 0 instead of silently shortening the window.
-- mode: select
-- reading: Newest day first. rolling_7d_avg smooths the daily kg; change_vs_prev_day shows jumps. The oldest displayed row's change is NULL only if no earlier day exists in the calendar CTE.
WITH calendar AS (
  SELECT d::date AS day FROM generate_series(CURRENT_DATE - 27, CURRENT_DATE - 1, interval '1 day') d
), daily AS (
  SELECT c.day, COALESCE(v.total_waste_kg, 0) AS kg
    FROM calendar c
    LEFT JOIN v_daily_waste v ON v.occurred_on = c.day AND v.establishment_id = 1
)
SELECT day,
       ROUND(kg, 1)                                                              AS kg,
       ROUND(AVG(kg) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 1) AS rolling_7d_avg,
       ROUND(kg - LAG(kg) OVER (ORDER BY day), 1)                                AS change_vs_prev_day
  FROM daily
 ORDER BY day DESC
 LIMIT 21;
