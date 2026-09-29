# WI-OI-103a: the analytics query contract and engine

- **Status:** Done (2026-09-29). Evidence is in `.pi/work/WI-OI-103.md` under "103a".
- **Work item:** WI-OI-103. Evidence goes in `.pi/work/WI-OI-103.md`, under "103a".
- **Size:** M.

## Goal

Answer "measure(s) by dimension(s), per time grain, filtered by field values" as typed rows. This replaces the
totals-only engine for new callers.

## Scope

- **May change:**
  - `packages/contracts/src/analytics/` (the new `AnalyticsQueryV1` contract);
  - `modules/analytics-studio/apps/api/src/query-engine/` (a new builder, service method and endpoint, and tests).
- **Must not change:**
  - the existing `POST v1/query/run` behaviour;
  - database schemas;
  - the running analytics service (no rebuild in this slice).

## Steps

1. **Contract:** `AnalyticsQueryV1Schema` and `AnalyticsQueryResultV1Schema` (zod), covering:
   - measures (1–10) and dimensions (0–3);
   - time `{ field, grain: day | week | month | quarter | year }`;
   - filters: `eq`, `neq`, `in`, `gte`, `lte`, `between` (up to 20);
   - sort (up to 3);
   - limit (1–10,000, default 1,000).
2. **Builder:** a pure `buildAnalyticsQuery()` returns `{ text, params }`.
   - Field names and values are **bound parameters**.
   - Only the grain and the aggregate expressions come from closed switches.
   - It fetches `limit + 1` rows to detect truncation.
3. **Service:** `runSpec(principal, spec)`:
   - load the semantic model (its latest version) and its READY dataset version;
   - whitelist fields and types from the published mapping;
   - validate every field, type and operator (400 on any mismatch);
   - run under tenant RLS;
   - return typed columns and rows, with freshness and watermark.
4. **Endpoint:** `POST v1/query/spec`, with `analytics:read`.
5. **Tests:**
   - the builder: grains, filters, parameters, truncation, and no user text in SQL;
   - validation: unknown field, wrong type, time on a non-date field;
   - the service with a mocked database.

## Done when

- [ ] The contract, builder, service and endpoint exist with tests, and `pnpm verify` passes.
- [ ] The evidence is recorded, and `.pi/NOW.md` is updated.

## Stop and ask if

- the mapping does not carry field types for existing datasets;
- the change would alter the existing `run` endpoint's responses.
