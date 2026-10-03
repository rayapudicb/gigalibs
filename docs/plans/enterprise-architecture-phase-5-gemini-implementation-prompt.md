# Gemini implementation prompt — Phase 5 Universal Inventory and Warehouse

Copy everything below into the implementing agent. Do not shorten it.

---

You are implementing **GigaLibs Enterprise Architecture Phase 5: Universal Inventory and Warehouse
Operations** in `/Users/rayapudi/dev/gigalibs`.

## A. Non-negotiable execution gate

Before changing any product file:

1. Read `AGENTS.md` completely.
2. Read `.pi/NOW.md`.
3. Read only the WI-OI-112 and reserved WI-OI-091 references in `.pi/WORK_ITEMS.md`.
4. Read:
   - `docs/plans/enterprise-architecture-phase-5-universal-inventory-warehouse-implementation-plan.md`;
   - `.pi/tasks/TEMPLATE.md`;
   - ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020 and ADR-0021;
   - the accepted Phase 4 contracts and evidence;
   - `.pi/work/WI-EAM-005.md`;
   - CMMS migrations 000010 and 000019 and only their direct consumers.
5. Inspect `git status --short`. Treat every existing change as user/other-agent work.

**If WI-OI-112 is still In Progress, or another Build item is active, STOP. Do not write Phase 5 product code.**
Report that Phase 5 is ready but blocked by the one-active-Build rule. Do not change `.pi/NOW.md` to bypass the
gate.

When Phase 4 is complete, the SDLC Orchestrator must reconcile the already reserved **WI-OI-091** into
`.pi/WORK_ITEMS.md`, create/show the task card and receive owner approval. Do not invent WI-OI-113 or another ID.

## B. Mission

Build one selectable `Universal Inventory and Warehouse` module that owns warehouses, locations, stock ledger,
balances, lots/serials, reservations, receiving, putaway, transfers, issues, returns, counts, adjustments,
replenishment, maintenance kits and staging.

The module must run completely without SAP or another ERP. CMMS becomes a consumer through contracts and events.
It must use Phase 4 product/UOM authority and must not duplicate product, category, UOM or list-price masters.

## C. Architecture that must be preserved

- Target module: `modules/universal-inventory`.
- Default hosting: shared module host, extractable later through the same contracts.
- Owned PostgreSQL schema: `gigalibs_inventory` with a least-privilege role.
- `crossSchemaAccess: false`.
- Public contracts: `packages/contracts/src/inventory` and explicit exports.
- UI: manifest-contributed package/surfaces using the existing Medusa UI system and tokens.
- Mobile: publish versioned contracts only in this repository; mobile implementation remains in its separate repo.
- Integration: transactional inbox/outbox and Connector Hub adapters.
- Analytics: versioned facts; Analytics never queries Inventory schema directly.
- Tenancy: signed `PlatformContext`, module entitlement, explicit permissions, forced RLS and composite tenant FKs.
- Organization/site: server-resolved WI-OI-109 scope plus canonical Place references.

## D. Absolutely forbidden

- No mock/demo/static inventory, fallback balances or fabricated KPIs in production-reachable code.
- No default tenant, warehouse, bin, currency or UOM.
- No `Number`/floating-point arithmetic for money or persisted quantities.
- No direct imports of Phase 4, CMMS, Workforce, Procurement or Analytics implementation code.
- No cross-schema reads/writes.
- No new product, category, UOM, supplier, work-order or accounting authority.
- No runtime DDL, arbitrary SQL supplied by a tenant, `eval`, dynamic code or unregistered action handler.
- No editing applied migrations.
- No destructive migration, table drop or deletion of CMMS data.
- No uncontrolled dual writes between CMMS and Inventory.
- No SAP/ERP requirement for native workflows.
- No provider-result simulation or claim of SAP/Maximo/Oracle support without a separately approved adapter and proof.
- No hardcoded shell navigation; use the module manifest/generator.
- No product-code change outside an approved slice.
- No cleanup of unrelated dirty files.
- No commit unless the owner sends the literal word `commit`.
- No deployment, live migration or modification of owner data without explicit authorization.

## E. Required delivery sequence

Implement one approved slice at a time. At each slice, complete contracts, persistence, service, API, UI where
applicable, tests and evidence before moving forward.

### P5-0 — Reconciliation and ADR

1. Produce a machine-readable inventory of:
   - CMMS `parts`, `stock_movements`, `cmms_storerooms`, `cmms_part_balances`;
   - services/controllers/gateways/UI/reports that read or write them;
   - Phase 4 product/UOM contracts;
   - existing permissions, events, imports and tests.
2. Record source authority, target authority, mapping, compatibility period and retirement gate for every path.
3. Add an ADR covering ledger model, no-negative-stock, UOM precision, organization/site scope, valuation,
   offline replay, CMMS convergence and optional ERP authority modes.
4. Stop for owner decisions listed in plan section 17 if they are not recorded.

### P5-1 — Module and contracts

1. Follow the current accepted module template; do not copy quarantined modules.
2. Create `modules/universal-inventory/module.yaml` with truthful `implementation` maturity.
3. Register module-host composition, entitlement, health, gateway and permission catalogue through generators.
4. Add strict Zod contracts for IDs, decimal strings, products/UOM, warehouses/locations, lots/serials, ledger,
   balances, receipts, transfers, reservations, counts, kits, sync and events.
5. Reject unknown keys where platform conventions require strict payloads.
6. Add API/layer/module-manifest tests.

### P5-2 — Database and ledger

1. Add forward-only migrations under the new module only.
2. Create schema version tracking, tenant authority/replica as required by accepted module runtime conventions,
   forced RLS, composite tenant keys, audit, inbox, outbox and idempotency.
3. Implement immutable `StockLedgerTransaction` and balanced `StockLedgerEntry` records.
4. Implement `StockBalance` as a rebuildable projection.
5. Use PostgreSQL numeric/decimal and a reviewed decimal library in TypeScript.
6. Lock rows/advisory keys in deterministic order and prove concurrent issues cannot oversubscribe stock.
7. Add clean-install, upgrade, rollback/roll-forward and ledger-rebuild tests.

### P5-3 — Topology and inventory identity

1. Add warehouse/location hierarchy with org/Place scope, type, lifecycle and constraints.
2. Reference Phase 4 Product/UOM contracts by stable ID/version; never copy master fields as authority.
3. Add lots, serials, inventory/quality status and barcode aliases.
4. Add explicit CMMS part mappings without changing CMMS data.
5. Implement cursor queries and safe 404 behavior for inaccessible records.

### P5-4 — Receiving and putaway

1. Implement receipt lifecycle, partial lines, tolerances, quarantine/inspection status and compensation.
2. Implement label-adapter contract and putaway suggestions with explicit operator confirmation.
3. Build real web/tablet queues and drawers with all failure/empty/conflict states.
4. Do not create purchase orders or suppliers.

### P5-5 — Transfers, reservations, issues and returns

1. Implement transfer order states, in-transit custody and partial dispatch/receipt.
2. Implement availability and soft/hard reservations.
3. Implement operational and CMMS work-order issue/return with source references and immutable snapshots.
4. Prove lot/serial/status/UOM enforcement, substitution approval and compensating correction.

### P5-6 — Counts and adjustments

1. Implement count plan/task/snapshot, blind observation, recount, variance and reason codes.
2. Enforce accepted movement-during-count policy.
3. Require distinct maker/approver above accepted thresholds.
4. Post adjustments as compensating ledger entries only.

### P5-7 — Barcode and offline contracts

1. Implement server-side barcode resolution and label metadata.
2. Implement bounded sync pull/push with cursor, device identity, idempotency, mutation dependencies and rejection
   receipts.
3. Prove duplicate/out-of-order replay, tenant switch purge contract, revocation and media retry semantics.
4. Do not implement the mobile app inside `gigalibs`.

### P5-8 — Kitting, staging and replenishment

1. Consume CMMS demand/work-order facts through public contracts.
2. Implement reservations, kit lines, shortages, assignment, pick, stage, issue, return and close.
3. Support non-stock material tracking without creating false stock.
4. Publish ready/shortage facts to CMMS and internal transfer/external purchase suggestions.
5. Do not create procurement transactions.

### P5-9 — Valuation and Analytics facts

1. Implement only the owner-approved standard/moving-average/FIFO policies.
2. Persist immutable cost-layer and issue/return valuation evidence.
3. Publish attributable facts for accuracy, movement throughput, shortages, dwell, variance and kit readiness.
4. Do not write GL journals or claim accounting completion.

### P5-10 — CMMS convergence

1. Write a forward-only copy/reconciliation migration or bounded job; never edit existing migrations.
2. Map CMMS part to Phase 4 product and InventoryItem explicitly.
3. Reconcile row counts, base-UOM quantities, per-location totals, movement lineage and checksums.
4. Deploy Inventory producer before switching CMMS consumer code in the accepted consumer-first order.
5. Run shadow comparisons.
6. Switch reads first; switch issue/return commands only after parity.
7. Preserve CMMS TCO using immutable Inventory valuation snapshots.
8. Freeze old writes after proof; do not drop old tables or endpoints in this item.

### P5-11 — Integration framework

1. Add authority modes: `GIGALIBS`, `EXTERNAL`, `SPLIT_BY_AGGREGATE`.
2. Add mapping, checkpoints, retry, timeout, rate limit, dead letter and reconciliation UI/contracts.
3. Do not implement a named provider without its own accepted scope, credentials and test system.

### P5-12 — Certification

Run every critical scenario from plan section 15 against real PostgreSQL and exact images. Include two tenants,
two sibling organizations/sites, revocation, concurrency, ledger rebuild, offline replay, accessibility,
performance, empty install, representative upgrade, backup/restore, vulnerability scans and CMMS parity.

## F. UI requirements

- Navigation comes only from the module manifest.
- Use existing GigaLibs/Medusa components and tokens; no new design system.
- Preserve the global five-pixel left/right application content gutter.
- Desktop/tablet administration and high-density operational tables.
- No numeric card without real persisted/query provenance.
- Loading, empty, denied, not found, validation, stale version, conflict, offline/pending, retryable error, partial
  success and completed states.
- Keyboard-only operation, visible focus, logical focus restoration, live announcements, accessible tables and
  WCAG 2.1 AA contrast.

## G. Security and correctness requirements

- Validate entitlement, audience, session/revocation, permission, tenant and org/site scope before repository work.
- Do not trust client tenant/org/product/UOM assertions.
- Cache keys include every authorization and version dimension; revocation invalidates access.
- Inaccessible record response does not confirm existence.
- Restricted valuation/export/integration fields require explicit permissions.
- Logs, audit and events exclude credentials, sensitive identifiers and unrestricted payload dumps.
- Every external action has timeout, retry classification, idempotency and reconciliation.
- Every ledger mutation and approval has correlation/causation and actor evidence.

## H. Tests required before Review

At minimum:

1. strict contract and hostile-input tests;
2. domain invariant/property tests for decimal/UOM/ledger arithmetic;
3. repository tests on real PostgreSQL with forced RLS;
4. controller permission/entitlement/safe-error tests;
5. two-tenant and sibling-organization/site isolation tests;
6. idempotency, concurrency and revocation tests;
7. ledger rebuild and projection drift detection;
8. every receipt/putaway/transfer/reservation/issue/return/count/kit state transition;
9. UI component, BFF boundary, browser and accessibility tests;
10. clean-install, representative upgrade, failed-migration recovery and restore;
11. CMMS row/quantity/checksum/TCO parity and rollback;
12. exact-image vulnerability and runtime health proof;
13. full `pnpm verify`.

Do not weaken or delete a test to obtain green status. Fix the implementation or record a real blocker.

## I. Verification commands

Use focused commands during slices, then run:

```text
pnpm build
pnpm test
pnpm audit:production-data
pnpm audit:all-runtime-data
pnpm audit:package-dependencies
pnpm audit:api-boundary
pnpm audit:navigation
pnpm audit:sdlc
pnpm verify
```

Also run the Phase 5 real-database and exact-image certification scripts created by this work item. If service,
Docker or dependency access is unavailable, record the exact command/error; do not fabricate PASS evidence.

## J. Evidence and status

Maintain:

- `.pi/tasks/WI-OI-091.md` after canonical allocation;
- `.pi/work/WI-OI-091.md` with outcome → requirement → ADR → code/migration → tests → evidence → metric trace;
- `.pi/NOW.md` only when this becomes the authorized active item and again at handoff;
- the canonical `.pi/WORK_ITEMS.md` row through the SDLC Orchestrator.

Do not mark Done because code compiles. Keep status In Progress until all applicable Definition of Done evidence and
independent reviews exist. Do not claim production, cloud, external ERP, mobile application or customer release.

## K. Token-efficient working method

- Use `rg`/`sed -n` for exact symbols and sections; do not read entire large files.
- Read generated files only to diagnose generation; change their authoritative source and regenerate.
- Reuse accepted module/runtime helpers rather than copying them.
- Keep each slice small and independently verifiable.
- Show only command summaries and tails; preserve full logs in evidence paths.
- Never rewrite a whole existing file when a bounded patch is enough.

## L. Required final report

Report at most five bullets:

1. changed files and business outcome;
2. tests/certification with exact counts;
3. failures or remaining work without concealment;
4. whether `pnpm verify` passed and known drift;
5. the exact owner decision required next.

Do not commit. Wait for the owner's literal `commit`.

---
