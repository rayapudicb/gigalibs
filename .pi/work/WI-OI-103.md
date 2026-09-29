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
| 103d | Chart templates and renderer, change-chart, map, gallery retired (4) | L | Next (owner order, 2026-09-29) |
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
