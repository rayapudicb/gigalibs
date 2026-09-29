# WI-OI-103d: chart templates that hold no data, and the Explore screen

- **Status:** In progress. d1–d5 are done (2026-09-29). The review deploy is done: analytics-api
  `4366613b86c8-1d4af1e44d20` at schema 17, and the review web on 127.0.0.1:5190. d6 and d7 (the Demo Lab sample farm
  loader, migration 18) are built and verified but not deployed. Next: deploy them with the owner's OK, then the live
  review. Evidence is in `.pi/work/WI-OI-103.md`.
- **Work item:** WI-OI-103. Evidence goes in `.pi/work/WI-OI-103.md`, under "103d".
- **Size:** L. The owner's deadline for foundation work is 2026-10-04.

## Goal

The owner can **see** the engine working. Pick a measure, group-by and time, get a chart, switch chart types in one
click, and save it as a chart view that stores the question, never the data.

## Decisions already made

- **Charting library:** Apache ECharts, per ADR-0004 (accepted 2026-09-22). The web already depends on
  `echarts` ^6.1.0; a small wrapper avoids a new dependency.
- **`@gigalibs/charts-react`** is hand-drawn SVG: single-series lines and hard-coded colours. It duplicates
  ADR-0004, so it becomes a later retirement candidate under ADR-0016 F3 (one engine per job). It is not used by the
  new screens.
- **Colours** come from the `ui-*` design tokens at runtime; no hard-coded palette in new code.

## Pieces (each verified and committable)

1. **d1 Catalog API:**
   - `GET v1/semantic-models` lists the tenant's models.
   - `GET v1/semantic-models/:id/catalog` returns the measures (base, plus the approved formulas with their
     versions) and the fields (name and type, from the published mapping).
   - Both need `analytics:read`, with tests.
2. **d2 Chart views:**
   - `ChartViewV1` = name + `AnalyticsQueryV1` (with pinned formula versions) + a visual spec (type and
     encoding), in a new table: migration 000017, forced RLS, schema version 17.
   - Routes: `POST`/`GET v1/chart-views` and `GET v1/chart-views/:id/data` (runs the stored query).
   - Permissions: `analytics:charts:write` to save, `analytics:read` to view.
3. **d3 Web proxy:** allow the routes above in `lib/analytics-proxy.ts`, each with its permission.
4. **d4 Renderer** (`apps/workflow-platform`):
   - `compatibleChartTypes(shape)` offers only the types that fit the data's shape (time, dimensions, measures).
   - `toEChartsOption(result, visual)` covers: table, KPI, line, area, stacked area, column, stacked column,
     bar, stacked bar, pie, donut, scatter, bubble, heatmap, treemap, funnel, gauge, radar, sankey, and a map
     (points, when latitude and longitude fields exist).
   - An `AnalyticsChart` component, with a data-table fallback for accessibility.
   - Unit tests.
5. **d5 Explore screen** (`/analytics/explore`, in the Analytics menu):
   - model picker, measures, up to 3 group-bys, time and grain, simple filters;
   - chart-type chips (compatible only), a one-click switch, a data table toggle;
   - "Save as chart view";
   - Medusa UI with `ui-*` tokens.
6. **d6 Retire the static gallery:** the Industry Charts gallery (stored payloads, `telemetry_series`) is replaced
   by a list of saved chart views.
7. **d7 Demo:**
   - a clearly labelled **sample farm dataset** loaded through the real pipeline (source, mapping, dataset,
     model, formula "yield per hectare" with maker-checker);
   - a review deploy of the analytics and web images on port **5190**, which needs the owner's OK.

   5180 stays untouched.

## Done when

- [x] Pieces d1–d6 pass `pnpm verify`, with tests (2026-09-29).
- [ ] On 5190 the owner builds a chart live, switches its type, and saves it.
- [ ] Evidence is recorded, and `.pi/NOW.md` is updated.

## Stop and ask if

- a deploy, migration or data load would touch the running 5180 stack or the owner's data;
- ADR-0004's `echarts-for-react` wrapper is required, rather than a small in-house wrapper.
