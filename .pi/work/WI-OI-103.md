# WI-OI-103: Analytics engine as a common capability (ADR-0016 F13, F16, F11)

- **Status:** In Progress. The owner started it on 2026-09-29 ("yes, start 103").
- **Owner:** Analytics Studio / Developer Platform.
- **Decision record:** ADR-0016 (F13 analytics engine, F16 builder permissions, F11 Analytics owns reports).
- **Independent reviewers:** Security & Privacy, Web/Accessibility, QA/SDET, Product.

## G0: why

Every industry needs charts and reports without a developer per request. Today:
- the Analytics query engine returns one total per measure: dimensions, filters and time grain are ignored;
- measures are one-field aggregates;
- the build routes name no permission;
- the chart gallery reads stored payloads.

The owner's rule is that charts hold no data: a chart is a saved query plus a chart template. Manufacturing KPIs
(WI-OI-090) and the agriculture plan (phase 1) both build on this.

## G1: scope

**In scope:**
- the query contract and engine;
- formula measures, with maker-checker;
- fast summaries and a benchmark;
- chart templates holding no data (24 types, switchable, and a map);
- dashboards with shared filters;
- builder permissions and default roles;
- Analytics owns reports (scheduled CSV);
- a proof on manufacturing data.

**Out of scope:**
- connectors and the scheduler (WI-OI-104);
- place boundaries and enforcing place scope (WI-OI-105);
- PDF and Excel (WI-OI-106);
- AI or natural-language queries (C11).

## G2: acceptance

1. One query contract, `AnalyticsQueryV1`: measures × up to 3 dimensions × an optional time grain, filtered and
   sorted, returning typed rows. Every field is whitelisted against the published mapping, and no user text is
   put into SQL.
2. Formula measures (for example yield/ha) are defined once and published by a second person. Charts pin a
   measure version.
3. Summaries answer dashboard queries: the target is 95% under 1 s at 10M rows, measured.
4. A chart stores a query plus a visual spec, never data. One renderer covers all 24 types, and the "change chart"
   menu offers only the types that fit the data's shape. There is a map chart. The static gallery is removed.
5. Dashboards have shared filters. Reports are owned by Analytics (scheduled CSV), and the core's contained Reports
   entry is removed.
6. Seven permissions and four default roles are enforced at the gateway and in the module. Every change is
   audited.
7. The no-developer test passes on manufacturing data. The analytics image rebuild and deploy is the owner's call.

## G3: slices

| Slice | What | Size | Status |
|---|---|---|---|
| 103a | Query contract and engine (acceptance 1) | M | Done, 2026-09-29 |
| 103b | Formula measures, measure versions, maker-checker (2) | M | Done, 2026-09-29 |
| 103c | Summaries, cache, limits, benchmark (3) | M | Proposed |
| 103d | Chart templates and renderer, change-chart, map, gallery retired (4) | L | In progress: d1–d7 built, verified and deployed for review on 5190 (2026-09-29); owner's live review next |
| 103e | Dashboards, reports ownership, permissions and roles, web exposure (5, 6) | M | Proposed |
| 103f | Proof on manufacturing data and the no-developer test (7) | M | Proposed |

## 103a: query contract and engine (2026-09-29)

**Contract** (`packages/contracts/src/analytics/query.ts`, exported from `@gigalibs/contracts`):
- `AnalyticsQueryV1Schema` (zod, strict) covers:
  - 1–10 measures and 0–3 distinct dimensions;
  - an optional time `{ field, grain: day | week | month | quarter | year }`;
  - up to 20 filters (`eq`, `neq`, `in` up to 100 values, `gte`, `lte`, `between`);
  - up to 3 sort keys;
  - a limit of 1–10,000 (default 1,000).
- `AnalyticsQueryResultV1Schema` carries typed columns (role: time, dimension or measure) and rows in column order.
  The rows are also the accessible table for any chart. It also carries freshness, watermark, definition version
  and `truncated`.

**Builder** (`query-engine/query-builder.ts`, pure):
- One parameterised statement over `dataset_record_versions`.
- Field names and filter values are always bound parameters.
- Only the grain, the aggregate expressions (SUM, AVG, MIN, MAX, COUNT, COUNT_DISTINCT) and the type casts are SQL
  text, and all three come from closed switches.
- GROUP BY and ORDER BY use select positions.
- It fetches `limit + 1` rows to detect truncation.
- It refuses:
  - unknown fields and measures;
  - time on a non-date field;
  - ordered operators on string or boolean fields;
  - values that do not fit the field's type;
  - sorting by a non-output column;
  - a measure named like a dimension;
  - an unsupported aggregate.

**Service and endpoint:**
- `QueryEngineService.runSpec` validates with the contract and loads the semantic model's latest version. It
  whitelists fields and types from the dataset's published mapping (`studio_mapping_versions.field_mappings`), runs
  under tenant RLS, and returns typed cells (numeric strings become numbers, dates become ISO strings).
- 400 on a bad spec, 404 on an unknown model, and an empty UNAVAILABLE result without a READY dataset.
- `POST v1/query/spec` with `@RequirePermissions('analytics:read')`.
- The existing `POST v1/query/run` is unchanged.

**Evidence:**
- **Tests:** `query-builder.spec.ts` (shape, parameters, "no user text in SQL" with a hostile value, totals, sort,
  8 refusals, 7 schema rejections) and `query-spec.service.spec.ts` (typed rows, freshness, truncation, an
  undeclared field, a bad body, an unknown model). With the existing tests: 64 passed.
- **Real SQL check:** three generated statements ran on the local PostgreSQL schema inside `BEGIN READ ONLY … ROLLBACK`
  with a random dataset id, covering every operator, every aggregate, all type casts, week and quarter grains,
  sorting and totals. They returned 0, 1 and 0 rows. Nothing was written.
- `pnpm verify` passes (known drift only).

**Not yet:**
- The running analytics service (image `5abfa667bb10-7507432cb066`) does not have this endpoint until it is
  rebuilt; that is the owner's call, planned for 103f.
- The web proxy does not expose `v1/query/spec` yet (103e, with the permissions).

## Owner plan change (2026-09-29)

- Foundation work is time-boxed to **Sunday 2026-10-04**: close 103b, then **103d** (chart templates and the
  Explore screen), then 103e (dashboards and permissions).
- From Monday, build the **agriculture package** for a client capability pitch (date not fixed). Its pieces are
  thin first versions of the planned capabilities: a farmOS adapter shaped like WI-OI-104, fields as Geospatial
  places, and the pack as configuration. Predictions (requirements 1, 5, 9) are roadmap only.
- Afterwards, return to 103c, 103f and WI-OI-104 to WI-OI-107.

## 103b: formula measures with maker-checker (2026-09-29)

**Provenance:** implemented by the GPT (Codex) agent, which stopped before recording or committing. Claude
reviewed it, proved it and closed the slice.

**Contract** (`packages/contracts/src/analytics/formula-measure.ts`):
- A formula is a **typed expression tree**: base-measure leaves, numeric constants, and add, subtract, multiply
  and divide. It has at most 31 nodes, depth 8 and 10 base measures. No free text or SQL is stored.
- There are create, version, submit, approve and reject payloads. Version states are DRAFT, PENDING_REVIEW,
  PUBLISHED, SUPERSEDED and REJECTED.
- `AnalyticsQueryV1.measureVersions` pins formula measures to approved versions, and the result reports which
  versions were used.

**Database** (migration `000016_formula_measure_versions`, forward-only):
- `formula_measures`, `formula_measure_versions` and `formula_measure_reviews`, with forced RLS.
- Composite (id, tenant) keys bind every row to its tenant and its own formula.
- Versions and reviews are append-only: UPDATE and DELETE are revoked, and the runner's
  `MODULE_APPEND_ONLY_TABLES` includes them.
- New audit and lineage values. The expected schema version is now 16 (the runtime contract, Compose and
  `.env.example`).

**Maker-checker** (`formula-measure.service.ts`):
- The creator submits, and **a different person** approves or rejects (403 otherwise).
- Only the latest version can be reviewed, and a new version needs the previous one reviewed first.
- A formula name cannot clash with a base measure, and it may reference only known base measures.
- **Routes:** `analytics:models:write` to create and submit, `analytics:models:publish` to approve or reject, and
  `analytics:read` to read.

**Query engine:**
- Formula measures compile to SQL from the tree: constants are bound parameters, operators come from a closed
  switch, and division uses `NULLIF(…, 0)` (unknown, not an error).
- Queries use only **approved** versions of formulas in the same model and tenant (the current published one, or
  a pinned one).
- Pinning a base measure, or a version that was never approved, is refused.

**Evidence:**
- **Tests:** 79 pass (builder, service, formula service and the contract).
- **Migration on the real local PostgreSQL:** applied inside a transaction that was **rolled back**. It created 3
  formula tables, all with forced RLS; 0 remained afterwards.
- **Formula query:** "yield per hectare by field and month" executed read-only on the real schema.
- `pnpm verify` passes (known drift only).
- The migration is not applied to the running database, and the analytics image is not rebuilt; both happen at
  deploy, which is the owner's call.

**For 103e:** the permission set now also includes `analytics:models:publish`; it goes into the default roles.

## 103d: chart views, renderer and the Explore screen (2026-09-29, d1–d5)

**Correction to earlier statements:**
- `@gigalibs/charts-react` is hand-drawn SVG (single-series lines, hard-coded colours), not ECharts.
- ADR-0004 (accepted 2026-09-22) makes Apache ECharts the only charting library, so the new screens use ECharts.
- `charts-react` is a later retirement candidate (ADR-0016 F3).

**d1, model catalog:**
- `GET v1/semantic-models` and `GET v1/semantic-models/:id/catalog`, with `analytics:read`.
- The catalog returns base measures, approved formula measures (with the version a chart may pin) and typed fields.
- `dataset-fields.ts` is the single field whitelist, used by both the catalog and `runSpec`.

**d2, chart views:**
- Migration `000017_chart_views`: forced RLS, and a tenant-bound FK to the model (using the composite key from
  000016). Schema version 17 is set in the runtime contract, Compose (2 places) and `.env.example`.
- Saving runs the question, refuses a chart type that does not fit its shape, pins formula versions, and audits
  `CHART_VIEW_CREATED`.
- `GET :id/data` re-runs the stored question.
- Permissions: `analytics:charts:write` to save, `analytics:read` otherwise.
- The shape rules (`compatibleChartTypes`) live in `@gigalibs/contracts`, so the UI and the API agree.

**d3, web gateway:** `lib/analytics-proxy.ts` allows the query spec (POST, read), the model list and catalog, and
chart views. A reader saving a view gets 403; unlisted methods get 404 (`analytics-boundary.test.ts`).

**d4, renderer** (`lib/analytics/chart-render.ts`):
- Turns a result into an ECharts option for 20 types: table, KPI, line, area, stacked area, column, stacked
  column, bar, stacked bar, pie, donut, scatter, bubble, heatmap, treemap, funnel, gauge, radar, sankey, and a
  points map.
- Colours come from the `--tag-*-icon` and `--fg-*` design tokens at runtime. Missing values stay missing.

**d5, Explore screen** (`/analytics/explore`, and an Analytics sub-menu of Overview, Places and Explore):
- Pickers: model, measures (formulas marked with their unit), up to 3 group-bys, time and grain, up to 5 filters.
- One-click chart-type chips (fitting types only), a data-table toggle, save as chart view, and the saved-view
  list.
- Loading, empty, error, permission and truncation states.
- Medusa UI with `ui-*` tokens. The chart is drawn with SVG, and an accessible table is always available.
- The navigation equivalence test records this as the one intended menu change since the freeze.

**Evidence:**
- **Tests:** 336 analytics tests; renderer 9; gateway 8; navigation 66.
- **Real database:** migrations 16 and 17 applied on the real local PostgreSQL in a rolled-back transaction.
- **Chain:** `pnpm verify` passes (known drift only). One run failed a sign-up test on a 5-second timeout while the
  machine's load average was around 21; the file then passed on its own (69 tests in 28 ms), and the full run passed.

**Review deploy** (owner's OK, 2026-09-29):
- Backup first: `infra/compose/backups/gigalibs_backup_20260929_145224Z.dump`.
- The `analytics-migrations` job (recreated, `--no-deps`) exited 0 at migration 17. The four new tables
  (`formula_measures`, `formula_measure_versions`, `formula_measure_reviews`, `chart_views`) exist with forced RLS.
- `analytics-api` `4366613b86c8-1d4af1e44d20` is healthy on schema 17.
- Review web `gigalibs-review-web` on 127.0.0.1:5190 (same image tag); `/api/health/ready` returned 200.
- 5180 is unchanged (`a255e935c80e-2e98e70d8d0e`, 200). The disk guard removed 6 superseded images.

**d6, static gallery retired** (after the deploy, so not yet on 5190):
- The Analytics workbench tab "Tenant Visualizations & Telemetry" (`IndustryChartsCatalogView`, 644 lines of stored
  chart payloads) is replaced by **Saved charts** (`SavedChartViews`). Opening a saved chart re-runs its stored
  question through `GET v1/chart-views/:id/data`; the list links to Explore.
- Retired: `TelemetryService`, the `v1/metrics/charts` and `v1/metrics/charts/:id` routes, and their proxy entries.
  The gateway test now proves both paths return 404. The module-schema baseline entry is removed.
- The web no longer depends on `@gigalibs/charts-react`; the gallery was its only user. The package itself stays
  until the owner decides on it (ADR-0004, F3).
- The `telemetry_series` table and its rows are **kept**. Dropping it is a data change for the owner.
- A shared `analyticsApi` helper serves Explore and Saved charts.
- **Checks:** web and analytics typechecks pass; gateway, renderer and navigation tests pass (83); `pnpm verify`
  passes (known drift only).
- **Deploy caveat:** the 5180 web still has the old gallery tab. Deploying this analytics image without the new web
  on 5180 would leave that tab showing "not found".

**d7, sample farm source** (owner chose the Demo Lab loader, 2026-09-29; not yet deployed):
- **Why this route:** live sync is contained (no credential vault), and the agriculture plan makes Connector Hub the
  one owner of outside data (Phase 2), retiring the Analytics PostgreSQL connector (2d). So the demo data is made
  inside Analytics, for Demo Lab workspaces only, and labelled synthetic like the other Demo Lab data.
- **Migration 000018** (schema version 18): adds the `SYNTHETIC` source type and the `DEMO_SOURCE_LOADED` audit event.
  Dry-run on the real local PostgreSQL in a rolled-back transaction: the database stayed at 17 afterwards.
- **`POST v1/demo-lab/sample-farm`** (`analytics:action`, unscoped members only; the BFF allows it only in `demo-lab`
  workspaces):
  - In one transaction it writes a SYNTHETIC connection, one succeeded sync run, 960 deterministic harvest logs
    (3 farms × 4 fields × 4 seasons × 20 days; each row `data_origin: SYNTHETIC`) and an audit event.
  - It then calls the real services: schema discovery, create and publish the mapping, build the dataset, create the
    model (yield, area harvested, input cost, harvest logs).
  - It creates "Yield per hectare" (yield ÷ area, kg/ha) and submits it for review as the loading member.
  - Each step reuses what an earlier run produced, so a second run writes nothing new.
- `GET v1/demo-lab/sample-farm` reports the state. Sync refuses a SYNTHETIC connection.
- **Web:**
  - Explore now checks the session like Places. In Demo Lab workspaces it shows a "Sample farm data" panel with the
    load button.
  - A "Waiting for review" panel lists pending formula versions with Approve and Reject.
  - Proxy: `v1/formula-measures/model/:id` (`analytics:read`), and `.../versions/:id/approve|reject`
    (`analytics:models:publish`). Analytics still refuses a review by the creator.
- **Wording:** the runtime-data audit rejects "sample data" in runtime code. The feature therefore reuses Demo Lab's
  audited term "synthetic data".
- **Checks:** sample-farm 5, ingestion (sample refusal), Demo Lab route and gateway tests; `pnpm verify` passes
  (known drift only).

**Open for the owner:**
- **Reset:** the raw and dataset records are append-only by design, so the sample source has no reset. A Demo Lab
  workspace delete purges only synthetic place facts today, so its Analytics sources, models and chart views remain
  under the cancelled tenant. This gap predates d7.
- **Demo setup:** every existing Demo Lab workspace is cancelled. A new one is needed (no agriculture industry pack
  exists yet), plus a second member with `analytics:models:publish` to approve the formula.
- **5180 caveat:** the 5180 web still has the retired gallery tab, which now answers "not found".

**Review deploy of d6 and d7** (owner's "deploy", 2026-09-29):
- Backup first: `infra/compose/backups/gigalibs_backup_20260929_161251Z.dump`.
- The `analytics-migrations` job exited 0 at migration 18; the schema version is 18.
- `analytics-api` `4cc55442219a-7c0b64d63cfd` is healthy.
- Review web `gigalibs-review-web` on 127.0.0.1:5190 (same tag): ready 200. Without a session, Explore redirects to
  login and the Analytics APIs answer 401.
- 5180 is unchanged (`a255e935c80e-2e98e70d8d0e`, 200). The disk guard ran.
