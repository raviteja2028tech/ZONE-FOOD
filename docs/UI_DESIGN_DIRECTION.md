# UI/UX design direction (for Parts 2–3 — nothing is built in Part 1)

Goal: a contemporary SaaS-quality product, not a college-style CRUD UI. Functionality, accessibility and performance come before effects;
no fake buttons or decorative widgets; every chart reads real query results.

## Principles
* **Clear hierarchy:** one primary action per screen, KPI cards → trend charts → detail tables. Generous spacing on a 4/8 px scale.
* **Design tokens first:** CSS variables for colour, radius, spacing, shadow, type; light and dark themes from day one; WCAG AA contrast.
* **Typography:** one variable sans (e.g. Inter or Geist) with tabular numerals for figures; a restrained scale (12/14/16/20/28).
* **Palette:** neutral slate surfaces with a single confident accent (green/teal suits a food-resource product) plus semantic
  colours for status (OPEN, CLAIMED, EXPIRING, FAILED). Colour is never the only signal (icons/labels too).
* **Components:** cards, data tables (server-side filter/sort/pagination, sticky header, row actions), command-style search, sheet/dialog for
  forms, toasts for results, skeleton loaders, purposeful empty states with the next action, inline + summary error states.
* **Charts (Recharts):** stacked area (waste by stage), ranked bars (top foods), grouped bars (kind comparison), expiry countdown bands;
  accessible tooltips, a data-table fallback, colour-blind-safe palette.
* **Motion:** short (150–250 ms) transitions for state changes, list/route transitions, count-up on KPI load; honour `prefers-reduced-motion`.
* **Navigation:** role-aware sidebar (collapses on laptop/tablet, bottom bar on phone) that mirrors server-side permissions exactly.
* **Responsive:** designed for ≥1280 px laptops, fully usable down to phone width.

## Stack (installed in Phase 2.1; Next 16 approved)
Next.js 16.4.3 · React 19.3.1 · TypeScript · Tailwind CSS 4.3.3 (`@tailwindcss/postcss`) ·
Recharts 3.10.1 · `motion` 14.9.0 · lucide-react · zod 4.6.7 · jose 6.2.14 · bcryptjs 3.0.3 · `pg` 8.23.1 · `mongodb` 7.8.0.
Component primitives: accessible headless primitives (e.g. Radix UI) styled with Tailwind rather than a heavy opinionated kit.
Each API will be verified against its installed version's docs when used.

## Part 3 additions

* **Analytics** page: every chart is backed by a catalogue query (the same SQL), has a *Chart / Data* toggle, a legend for two or more series, and states for loading, empty and error. Anomaly days are marked from SQL (z-score), not computed in the browser.
* **DBMS Lab**: a two-pane catalogue (list + SQL + result + EXPLAIN), cards for live constraint demos that show the database's own refusal and SQLSTATE, and an object browser. Wording always states that nothing changes the data.
* **Motion**: count-up KPIs and chart entry animation only; both respect `prefers-reduced-motion`.
* **Command palette** (Ctrl+K) lists only destinations the role may open.
* **Responsive**: tables scroll inside their card (`minWidth`), grids use `min-w-0`; verified at 390 / 820 / 1440 px with no horizontal page scroll. Light and dark themes share tokens.
