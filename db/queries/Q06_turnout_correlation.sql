-- title: Turnout versus utilisation correlation per establishment
-- concepts: CORR() statistical aggregate, view, HAVING on sample size
-- purpose: If kitchens cooked in proportion to who actually turned up, utilisation would not depend on turnout. A strongly positive correlation means the kitchen's quantities are not following attendance - its forecasts are the problem. Establishments with fewer than 30 sessions are skipped (too little evidence).
-- mode: select
-- reading: A strongly positive turnout_utilisation_corr means utilisation rises and falls with attendance: the kitchen prepares roughly the same amount whoever turns up. A value near 0 means preparation already adapts to attendance.
SELECT e.name,
       COUNT(*)                                          AS sessions,
       ROUND(CORR(v.turnout_pct, v.utilisation_pct)::numeric, 3) AS turnout_utilisation_corr,
       ROUND(AVG(v.turnout_pct), 1)                      AS avg_turnout_pct
  FROM v_preparation_efficiency v
  JOIN establishment e ON e.establishment_id = v.establishment_id
 WHERE v.turnout_pct IS NOT NULL AND v.utilisation_pct IS NOT NULL
 GROUP BY e.establishment_id, e.name
HAVING COUNT(*) >= 30
 ORDER BY turnout_utilisation_corr DESC NULLS LAST
 LIMIT 15;
