# Screenshots

Captured from the running application (production build, headless Chromium) against the seeded synthetic data. Files prefixed `p5-` show the final UI after the premium visual layer; `p3-` were taken for Part 3; the others are from Part 2 and still accurate.

| File | Shows |
|---|---|
| `p5-login.png`, `p5-login-dark.png` | cinematic sign-in: GSAP headline reveal, animated food-lifecycle path with travelling pulse (illustration), parallax orbs, demo-account picker |
| `p5-dashboard.png`, `p5-dashboard-mid.png`, `-low`, `p5-dashboard-dark*.png` | final dashboard: glass KPI cards with pointer spotlight, **Zone pulse** rings (diversion rate per block), **Redistribution pipeline** (offered / reserved / collected), animated counters |
| `p5-phone-dashboard.png` | 390 px phone layout of the final dashboard (no horizontal scroll) |
| `p3-admin-dashboard.png`, `p3-admin-dashboard-dark.png` | zone dashboard: count-up KPIs, sparklines, waste intensity, zone chart (light / dark) |
| `p3-analytics-top.png`, `-mid`, `-low`, `p3-analytics-dark.png` | Analytics: anomaly-marked daily trend, weekday rhythm, diversion rate, peer benchmark (rank + percentile), preparation efficiency, rescue funnel, supplier spoilage, data provenance |
| `p3-lab-catalogue.png`, `p3-lab-query-result.png`, `p3-lab-explain.png` | DBMS Lab: SQL catalogue, result of Q01, EXPLAIN (ANALYZE, BUFFERS) of Q03 with the plan |
| `p3-lab-demos.png` | live constraint demos: D01 refused by trigger T1 (SQLSTATE 23514), rolled back |
| `p3-lab-objects.png` | every table, index, view, function and trigger from the live catalog |
| `p3-audit.png` | audit log with who / what / before-after (trigger T4) |
| `p3-establishments.png`, `p3-claims.png`, `p3-surplus.png` | list screens with filters |
| `p3-manager-dashboard.png` | establishment manager view (own establishment only) |
| `p3-phone-dashboard.png`, `p3-phone-analytics.png`, `p3-phone-lab.png` | 390 px phone layout, no horizontal scroll |
| `login.png`, `v-register.png`, `v-access-denied.png` | authentication and RBAC refusal |
| `admin-*.png`, `manager-claims.png`, `staff-*.png`, `recipient-*.png`, `v-*.png` | Part 2 role walkthroughs (ETL run, matching, trigger refusal in the UI, validation, ranked feed, claims, dark mode, phone) |

Note: the chart animations restart when a full-page capture is taken, so chart screenshots are viewport captures taken after the animation finished.
