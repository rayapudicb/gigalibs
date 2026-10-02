# WI-WFO-006: Industry Packs, Workforce Analytics & End-to-End Proof

- **Status:** Review
- **Work item:** WI-WFO-006 (Industry Packs & End-to-End Proof). Evidence goes in `.pi/work/WI-WFO-006.md`.
- **Size:** M

## Goal

Deliver pre-packaged industry packs (Live Events & Sports, Manufacturing, Healthcare), pack listing and tenant activation APIs, 7 workforce analytics reporting endpoints and workbench integration, and author the comprehensive 21-stage end-to-end verification proof script (`scripts/verify-wfo-end-to-end.mjs`) validating the entire Universal WorkforceOps platform.

## Scope

- **May change:**
  - `packages/industry-packs/live-events-sports/*` (pack.json, terminology.json, compliance-docs.json, earning-types.json, rule-definitions.json, seed-data/roles.json)
  - `packages/industry-packs/manufacturing/*` (pack.json, terminology.json, compliance-docs.json, earning-types.json, rule-definitions.json, seed-data/roles.json)
  - `packages/industry-packs/healthcare/*` (pack.json, terminology.json, compliance-docs.json, earning-types.json, rule-definitions.json, seed-data/roles.json)
  - `packages/contracts/src/workforce/universal.ts` (pack and report DTO schemas)
  - `modules/gigaops/apps/api/src/packs/*` (pack listing & activation endpoints: `GET /api/v1/wfo/packs`, `POST /api/v1/wfo/packs/:packId/activate`)
  - `modules/gigaops/apps/api/src/reports/*` (analytics reporting endpoints: Staffing, Time & Labour, Payroll Summary, Compliance Status, Expense, Utilisation, Absenteeism)
  - `apps/workflow-platform/components/gigaops/*` (IndustryPackLibrary.tsx, WfoReportsHub.tsx)
  - `scripts/verify-wfo-end-to-end.mjs` (21-stage certification script)
  - `.pi/work/WI-WFO-006.md`, `config/sdlc-governance.json`, `.pi/WORK_ITEMS.md`, and `.pi/NOW.md`
- **Must not change:**
  - Core tenancy or organization hierarchy tables and migrations from `WI-OI-109`;
  - Uncommitted changes in `.pi/work/WI-OI-103.md` and `scripts/verify-manufacturing-no-developer.mjs`;
  - CMMS import/export;
  - Secrets;
  - Production-reachable mock data or fake provider bypasses.

## Read first

- `AGENTS.md`
- `WI_WFO_DELIVERY_MANIFEST.md` §WI-WFO-006
- `UNIVERSAL_WORKFORCEOPS_COMPLETE_DESIGN.md` §E-09, §5.3, §8
- `solutions/packs/industry/*`

## Steps

1. **Governance & Task Alignment:**
   - Record `WI-WFO-006` in `.pi/WORK_ITEMS.md` and initialize `.pi/work/WI-WFO-006.md`.
2. **Industry Pack Packages:**
   - Author packages/configs for `live-events-sports`, `manufacturing`, and `healthcare`.
   - Provide pack manifests, terminology mappings, compliance doc definitions, earning types, and RBAC seed roles.
3. **Pack & Reporting APIs:**
   - Implement pack listing (`GET /api/v1/wfo/packs`) and activation (`POST /api/v1/wfo/packs/:packId/activate`).
   - Implement 7 reporting queries in `WfoReportsService` / `WfoReportsController`.
4. **UI Workbench Integration:**
   - Add Pack Library view and Reports Hub in `apps/workflow-platform/components/gigaops/`.
5. **End-to-End Verification Harness:**
   - Author and verify `scripts/verify-wfo-end-to-end.mjs` executing all 21 lifecycle stages.
   - Run `pnpm verify` and capture evidence.

## Done when

- [x] 3 Industry packs defined with valid schemas, terminology, compliance docs, and rules.
- [x] Pack listing and tenant activation APIs operational.
- [x] 7 Workforce analytics report queries functioning with tenant isolation.
- [x] Industry pack and reporting UI views integrated into GigaOps workbench.
- [x] End-to-end certification script `scripts/verify-wfo-end-to-end.mjs` passes.
- [x] `pnpm verify` passes cleanly with only known drift.
- [x] Evidence recorded in `.pi/work/WI-WFO-006.md` and `.pi/NOW.md` updated.

## Stop and ask if

- A decision is needed that the vision or owner has not settled;
- A step would change a running production service or live owner data without authorization.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
