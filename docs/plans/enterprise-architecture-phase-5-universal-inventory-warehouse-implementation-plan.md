# Enterprise Architecture Phase 5 — Universal Inventory and Warehouse Operations

- **Status:** Proposed implementation plan; not authorized for Build while WI-OI-112 is active
- **Recorded:** 2026-10-03
- **Reserved roadmap item:** WI-OI-091, subject to SDLC Orchestrator reconciliation in `.pi/WORK_ITEMS.md`
- **Depends on:** WI-OI-109 Organization Hierarchy, WI-OI-105 Places, WI-OI-110 Application Dictionary,
  WI-OI-111 Core Parties, WI-OI-112 Product/UOM Catalogue, ADR-0013, ADR-0016, ADR-0018–ADR-0021
- **Existing source to converge:** CMMS migrations 000010 and 000019 plus WI-EAM-005
- **Requirements:** FR-01, FR-04, FR-05, FR-08–FR-12, FR-14 and FR-15; applicable security,
  data, reliability, performance, accessibility, observability and operational NFRs

## 1. Outcome

Phase 5 creates one selectable, tenant-isolated **Universal Inventory and Warehouse** business module. It
becomes the canonical authority for warehouses, zones, bins, stock identity, balances, reservations, lots,
serials, movements, receiving, putaway, transfers, issues, returns, counts, adjustments, replenishment,
maintenance kits and staging.

It works without SAP, another ERP, Procurement or Finance. When a client already uses SAP, Oracle, Maximo,
Dynamics or another system, Connector Hub synchronizes explicitly assigned records and commands without making
the external system a GigaLibs runtime dependency.

The module consumes Phase 4 product and UOM contracts. It must never create a second product, category, UOM or
price master.

## 2. Business outcomes

| Outcome | Observable result |
| --- | --- |
| Trusted stock | Every on-hand balance is reproducible from an immutable movement ledger |
| Right item, place and quantity | Barcode validation prevents wrong-product, wrong-bin and invalid-quantity transactions |
| Material-ready maintenance | Released CMMS work can reserve, kit, stage, issue and return material without CMMS owning stock |
| Faster warehouse execution | Receiving, putaway, picking, transfer and counting are task-driven and mobile-ready |
| Controlled loss and adjustment | Variances require reason, authorization and attributable evidence |
| Lot/serial traceability | A tenant can trace receipt, movement, issue, return, expiry and current custody |
| Tenant and organization isolation | No tenant, sibling organization or unauthorized site can discover inventory |
| ERP-optional operation | The complete native workflow functions with GigaLibs as the system of record |
| ERP coexistence | A declared authority matrix drives idempotent synchronization and reconciliation |
| Measured operations | Accuracy, shortages, dwell time, count variance and kit readiness trace to real facts |

## 3. Personas and primary actions

| Persona | Primary actions |
| --- | --- |
| Inventory administrator | Configure warehouse structure, policies, reason codes, barcode rules and permissions |
| Receiving clerk | Receive, inspect, label and place inbound material |
| Warehouse operator | Put away, move, pick, issue, return and count using tablet/mobile scanning |
| Storeroom coordinator | Allocate work, resolve shortages, manage kits and approve bounded exceptions |
| Inventory controller | Review variances, approve adjustments, close counts and reconcile balances |
| Maintenance planner | See reservation and kit readiness without editing inventory records |
| Maintenance technician | Collect/return staged material and record actual consumption |
| Operations manager | Monitor throughput, accuracy, aging, shortages and service levels |
| Integration operator | Monitor external mappings, checkpoints, conflicts, retries and dead letters |
| Auditor | Reconstruct each movement, approval, balance and external acknowledgement |

## 4. Canonical ownership

| Concept | Owner after Phase 5 |
| --- | --- |
| Product/service, category, identifier and UOM definitions | Phase 4 Product Catalogue |
| Warehouse, zone, bin and staging location | Universal Inventory |
| Lot, serial, stock state and custody | Universal Inventory |
| Stock ledger and on-hand/available/reserved projections | Universal Inventory |
| Receipt, putaway, transfer, issue, return and adjustment | Universal Inventory |
| Reservation, kit, staging and shortage | Universal Inventory |
| Asset and maintenance work order | CMMS/EAM |
| Maintenance labour and staffing | GigaOps Workforce |
| Supplier/customer identity | Core Parties |
| Purchase order and supplier agreement | Future Procurement & Vendors module |
| Product list price | Phase 4 Product Catalogue |
| Inventory cost layers and operational valuation | Universal Inventory |
| General-ledger posting and accounting policy | Future Finance module |
| Tax calculation | Tax module |
| Organization scope and site/place identity | Organization Hierarchy and Places |

Modules consume contracts, commands and events. They do not import Inventory implementation code or read its
schema.

## 5. Existing CMMS convergence

CMMS currently owns `parts`, `stock_movements`, `cmms_storerooms` and `cmms_part_balances`. WI-EAM-005 also
implements work-order issue/return and TCO. These are valid bounded maintenance capabilities, but ADR-0013
assigns parts and stock to the independent Inventory module.

Convergence is additive and reversible:

1. inventory all CMMS rows, APIs, permissions, UI consumers and reports;
2. establish Phase 4 product/UOM mappings for every eligible CMMS part;
3. deploy Inventory contracts and persistence without changing CMMS behavior;
4. copy and reconcile warehouse/bin/balance/movement history with row counts, totals and checksums;
5. dual-read in shadow comparison mode; do not dual-author writes;
6. switch CMMS reads to Inventory APIs/projections;
7. switch CMMS issue/return to idempotent Inventory commands;
8. prove parity, failure recovery, TCO snapshot compatibility and rollback;
9. freeze legacy CMMS stock writes;
10. retire legacy tables/routes only under a later owner-approved migration.

Never edit applied CMMS migrations. Never delete or reinterpret owner data. Never claim extraction is complete
while a production-reachable path still writes the old authority.

## 6. Functional scope

### 6.1 Warehouse topology

- tenant-defined warehouses/storerooms;
- organization and Place links;
- zones, aisles, racks, shelves, bins and staging locations;
- receiving, quarantine, inspection, available, blocked, returns and dispatch location types;
- effective status, capacity constraints and allowed-product policies;
- no magic `DEFAULT` warehouse or bin in production paths.

### 6.2 Inventory identity and state

- Phase 4 product and base/transaction UOM references;
- stock/non-stock classification without duplicating product identity;
- owner/custodian, quality status and inventory status;
- lot/batch, serial, manufacture/expiry and supplier-lot references;
- tenant barcode aliases and external-system mappings;
- unrestricted, quality-hold, blocked, reserved, staged and available quantities.

### 6.3 Immutable stock ledger

Every quantity change posts an immutable, balanced ledger transaction. Corrections are compensating entries,
never updates or deletes.

Supported movement reasons include:

```text
RECEIPT | PUTAWAY | TRANSFER | RESERVE | RELEASE | PICK | STAGE |
ISSUE | RETURN | COUNT_GAIN | COUNT_LOSS | ADJUSTMENT | SCRAP | STATUS_CHANGE
```

Each entry records tenant, organization, product, UOM, normalized base quantity, from/to location and status,
lot/serial where applicable, source document/line, idempotency key, actor, reason, correlation, timestamp and
resulting projection version.

### 6.4 Receiving and putaway

- expected or blind receipt with permission;
- manual/external document reference without requiring Procurement;
- quantity/UOM/lot/serial/expiry capture;
- optional inspection/quarantine disposition;
- over/under receipt tolerance and approval;
- barcode/label generation and printing adapter;
- rule-driven suggested bin with human confirmation;
- partial receipt and partial putaway;
- receipt reversal through controlled compensation.

### 6.5 Transfer, issue and return

- bin-to-bin, warehouse-to-warehouse and organization-authorized transfer;
- transfer order, pick, dispatch, in-transit and receipt states;
- work-order issue/return through CMMS contracts;
- general operational issue/return with authorized purpose;
- partial quantities, substitution approval and shortage handling;
- serial/lot enforcement and negative-stock prevention;
- custody and proof-of-handoff evidence.

### 6.6 Reservations, kits and staging

- hard/soft reservation policy;
- reservation by work order and work-order task;
- automatic availability/shortage calculation;
- kit creation, multi-order waves and picker assignment;
- pick verification, missing/substitute/damaged disposition;
- staged location, readiness status and expiry;
- technician pickup/signature, issue, unused return and kit close;
- non-stock material tracking without inventing on-hand quantity;
- no automatic procurement creation in this phase.

### 6.7 Counts and adjustments

- annual, cycle, spot and event-triggered count plans;
- blind count and optional recount;
- freeze policy or movement-aware snapshot;
- serialized/lot-aware entries;
- variance calculation and reason codes;
- maker-checker approval above configured thresholds;
- compensating ledger adjustment after approval;
- immutable count and approval evidence.

### 6.8 Replenishment

- min/max, reorder point and safety-stock policy;
- demand from reservations, open kits and recent consumption;
- internal transfer recommendation and task;
- external purchase suggestion event for future Procurement;
- no fake purchase order or supplier action.

### 6.9 Operational valuation

- exact decimal currency and quantity values;
- explicit policy per inventory-owning organization: standard, moving average or FIFO;
- immutable receipt cost and cost layers where policy requires;
- issue/return valuation trace and period-safe corrections;
- valuation facts for analytics/future Finance;
- no general-ledger account, journal entry or accounting claim.

### 6.10 Import, export and external integration

- preview, column mapping, validation, quarantine and idempotent commit;
- durable jobs for large imports/exports;
- spreadsheet formula-injection protection and auditable download grants;
- declared authority per aggregate/field for external systems;
- checkpoints, inbox/outbox, retry, dead letter, reconciliation and conflict workbench;
- no embedded credential or default tenant.

## 7. Canonical data model

Physical names are finalized in the Phase 5 ADR and G2 design.

| Aggregate/record | Purpose |
| --- | --- |
| `InventoryWarehouse` | Organization/place-bound warehouse or storeroom |
| `InventoryLocation` | Versioned zone/bin/staging hierarchy with type and capacity |
| `InventoryItem` | Inventory behavior referencing a Phase 4 product; never a product duplicate |
| `InventoryLot` | Lot/batch identity, dates, quality status and source references |
| `InventorySerial` | Individually controlled unit, status, location and custody |
| `StockLedgerTransaction` | Command-level immutable transaction header |
| `StockLedgerEntry` | Balanced quantity/value movement line |
| `StockBalance` | Rebuildable projection by product/location/status/lot/serial |
| `InventoryReservation` | Soft/hard allocation for a source demand line |
| `Receipt` / `ReceiptLine` | Inbound lifecycle and received evidence |
| `PutawayTask` | Suggested/confirmed movement from receipt/quarantine to storage |
| `TransferOrder` / `TransferLine` | Controlled source-to-destination movement lifecycle |
| `CountPlan` / `CountTask` / `CountEntry` | Snapshot, assignment, observations and variance |
| `InventoryAdjustment` | Approved reason and compensating ledger reference |
| `InventoryKit` / `InventoryKitLine` | Work-demand grouping, pick/stage/issue/return lifecycle |
| `ReplenishmentPolicy` / `ReplenishmentTask` | Threshold and internal replenishment execution |
| `InventoryCostLayer` | FIFO/average/standard operational valuation evidence |
| `InventoryReferenceMapping` | External/module identifier mapping and authority metadata |
| `InventoryIdempotencyRecord` | Bounded replay protection |
| `InventoryInboxReceipt` / `InventoryOutboxEvent` | Reliable integration evidence |

All mutable rows are tenant-bound, use stable UUIDs, optimistic versions, actor/timestamps and lifecycle state.
Composite tenant foreign keys and forced RLS are mandatory.

## 8. Invariants

- Ledger entries are immutable and balance within a transaction.
- `StockBalance` is a projection and can be rebuilt from the ledger.
- Quantity uses bounded decimal precision; never JavaScript floating-point arithmetic.
- Transaction UOM must resolve through the published Phase 4 UOM contract.
- Negative stock is rejected unless an explicitly approved future policy says otherwise.
- Serial-controlled quantity is integral and one serial cannot occupy conflicting custody states.
- Lot/serial/product/location references cannot cross tenant boundaries.
- Reserved plus staged quantity cannot exceed eligible physical quantity.
- Archived locations/items remain resolvable for history but cannot accept new movement.
- Idempotency replay returns the original result and creates no additional ledger/outbox entry.
- A stale expected version cannot silently overwrite concurrent warehouse activity.
- Organization/Place assignment narrows authority but never grants tenant membership.
- External acknowledgement never changes stock without an accepted mapped command.

## 9. API surface

All endpoints are versioned, authenticated, entitled and permission checked.

```text
GET/POST/PATCH  /v1/inventory/warehouses[/{id}]
GET/POST/PATCH  /v1/inventory/locations[/{id}]
GET/POST/PATCH  /v1/inventory/items[/{id}]
GET             /v1/inventory/balances
GET             /v1/inventory/ledger
POST            /v1/inventory/receipts
POST            /v1/inventory/receipts/{id}/lines
POST            /v1/inventory/receipts/{id}/complete
POST            /v1/inventory/putaway-tasks/{id}/confirm
POST            /v1/inventory/transfers
POST            /v1/inventory/transfers/{id}/pick|dispatch|receive|cancel
POST            /v1/inventory/issues
POST            /v1/inventory/returns
POST            /v1/inventory/reservations
POST            /v1/inventory/reservations/{id}/release
GET/POST         /v1/inventory/count-plans
POST             /v1/inventory/count-tasks/{id}/entries
POST             /v1/inventory/count-tasks/{id}/submit|recount
POST             /v1/inventory/adjustments/{id}/approve|reject
GET/POST         /v1/inventory/kits
POST             /v1/inventory/kits/{id}/assign|pick|stage|issue|return|close
GET/POST         /v1/inventory/replenishment
POST             /v1/inventory/barcodes/resolve
POST             /v1/inventory/sync/pull
POST             /v1/inventory/sync/push
```

List endpoints use cursor pagination, bounded pages, indexed filters and deterministic ordering. Mutations require
idempotency keys; versioned aggregates require ETags/expected versions. Bulk actions are bounded or become durable
jobs. Errors use safe problem details without record-presence disclosure.

## 10. Permissions

```text
inventory:read
inventory:ledger.read
inventory:warehouses.manage
inventory:items.manage
inventory:receive
inventory:putaway
inventory:transfer
inventory:issue
inventory:return
inventory:reserve
inventory:count
inventory:counts.approve
inventory:adjust
inventory:adjust.approve
inventory:kits.read
inventory:kits.manage
inventory:valuation.read
inventory:imports.manage
inventory:export
inventory:integrations.manage
```

Adjustment maker and approver must be distinct above the accepted threshold. Valuation, export and integration
permissions are separately governed. UI visibility is never authorization.

## 11. Web/tablet experience

The module manifest contributes **Inventory & Warehouse** navigation:

- Control centre;
- Products & stock;
- Warehouses & bins;
- Receiving;
- Putaway;
- Transfers;
- Issues & returns;
- Reservations;
- Kits & staging;
- Counts & adjustments;
- Replenishment;
- Ledger & traceability;
- Integrations & reconciliation;
- Settings and audit.

Use the established GigaLibs Medusa UI tokens and five-pixel application content gutter. Provide high-density
tables, saved filters, accessible drawers, bulk-selection summaries and no fabricated counters.

Every surface implements loading, genuine empty, denied, inaccessible/not-found, validation, version conflict,
offline/pending, retryable error, partial completion and success states. WCAG 2.1 AA keyboard navigation, focus,
announcements, contrast and accessible tables are mandatory.

## 12. Mobile/tablet execution contract

Mobile is a separate client repository and consumes versioned contracts. This work item defines the contract and
server behavior; it does not place mobile implementation inside this repository.

Required mobile tasks:

- assigned work queue and warehouse/site context;
- scan product, lot/serial, bin, work order and kit;
- receive, put away, move, pick, stage, issue, return and count;
- photo/signature/reason evidence;
- encrypted offline store and bounded download scope;
- ordered mutation queue with idempotency keys;
- delta pull, conflict/rejection inbox and resumable media upload;
- remote revocation, session expiry and tenant switch data purge;
- battery/network-aware synchronization and visible last-sync state.

Offline success is `PENDING_SYNC`, never falsely represented as server-confirmed.

## 13. Events and integrations

Versioned post-commit facts include:

```text
inventory.receipt.completed.v1
inventory.stock.moved.v1
inventory.balance.changed.v1
inventory.reservation.changed.v1
inventory.shortage.detected.v1
inventory.kit.ready.v1
inventory.kit.issued.v1
inventory.count.closed.v1
inventory.adjustment.posted.v1
inventory.replenishment.requested.v1
inventory.valuation.changed.v1
```

CMMS sends versioned demand/reservation/issue/return commands and consumes kit/shortage/readiness facts. Future
Procurement consumes replenishment suggestions and publishes expected receipts. Analytics consumes attribution-
safe facts. External ERP adapters live under Connector Hub and translate into the same canonical contracts.

## 14. Implementation slices

### P5-0 — Governance, inventory and ADR

- Reconcile reserved WI-OI-091 into `.pi/WORK_ITEMS.md`; do not invent another ID.
- Complete CMMS/database/API/UI/consumer inventory and migration risk assessment.
- Accept authority, valuation, negative-stock, offline and external-system decisions.
- Write the Phase 5 ADR, threat model and data-classification record.

### P5-1 — Module skeleton and contracts

- Create `modules/universal-inventory` with module manifest, health, entitlement and shared-host registration.
- Add public DTOs/events/snapshots in `packages/contracts/src/inventory`.
- Add permission catalogue, gateway allowlist and layer-boundary tests.

### P5-2 — Persistence and immutable ledger

- Add forward-only `gigalibs_inventory` migrations, RLS, tenant composite keys and indexes.
- Implement ledger transaction, entries, rebuildable balances, idempotency, audit, inbox and outbox.
- Prove arithmetic, concurrency, empty install, upgrade and roll-forward recovery.

### P5-3 — Warehouse topology and Phase 4 adoption

- Implement warehouse/location hierarchy and org/Place scope.
- Implement InventoryItem references to Product/UOM contracts and mappings from CMMS parts.
- Implement lots, serials, statuses and barcode resolution.

### P5-4 — Receiving and putaway

- Implement receipts, lines, tolerances, quarantine/inspection dispositions, labels and putaway tasks.
- Add accessible web/tablet work queues and real PostgreSQL tests.

### P5-5 — Transfers, reservations, issues and returns

- Implement transfer lifecycle, availability, reservations and operational/work-order issue/return.
- Prove partial operations, compensation, shortage, substitution and custody.

### P5-6 — Counts and adjustments

- Implement plans, snapshots, blind count, recount, variance and maker-checker adjustments.
- Prove movement-during-count policy and immutable evidence.

### P5-7 — Barcode and offline execution foundation

- Implement scan resolution, label adapter contract and sync pull/push APIs.
- Prove ordered replay, duplicate suppression, revocation, conflict handling and device-scope isolation.
- Publish contracts for the separate mobile repository; do not add a mock mobile screen.

### P5-8 — Kitting, staging and replenishment

- Implement CMMS demand/reservation handshake, kit workflow, non-stock control and staging.
- Implement internal replenishment and future-Procurement suggestion facts.

### P5-9 — Valuation and analytics

- Implement accepted valuation policies and immutable cost evidence without GL posting.
- Publish Analytics facts for accuracy, throughput, shortages, dwell time, variance and kit readiness.

### P5-10 — CMMS convergence

- Copy/reconcile CMMS stock history; deploy Inventory before switching consumers.
- Shadow-compare balances and work-order TCO.
- Switch CMMS reads, then commands, to Inventory contracts.
- Freeze legacy writes only after parity and rollback proof. Do not drop tables in this item.

### P5-11 — Optional Connector Hub adapters

- Add the generic authority/mapping/reconciliation framework first.
- Implement SAP/Maximo/Oracle adapters only under separately accepted provider work and real test access.
- Native Inventory certification must not depend on an external ERP.

### P5-12 — Integrated local certification

- Complete two-tenant/two-organization/site, revocation, RLS, ledger-rebuild and concurrency tests.
- Complete accessibility, bounded performance, migration/restore, exact-image scan and failure-recovery evidence.
- Run full `pnpm verify` and independent reviews.

## 15. Critical verification scenarios

1. Tenant A cannot discover Tenant B products, warehouses, balances, serials, ledger or jobs.
2. Sibling organization/site access is denied server-side and at RLS where applicable.
3. Receipt → putaway → reserve → pick → stage → issue → return reproduces every balance.
4. Retrying every command with the same idempotency key changes nothing twice.
5. Concurrent issues cannot oversubscribe eligible stock.
6. UOM conversion uses Phase 4 published precision and rejects incompatible dimensions.
7. Lot expiry, quality hold and serial custody prevent invalid picking/issue.
8. A count variance cannot affect stock until accepted policy/approval completes.
9. Offline commands replay in order; rejection/conflict is visible and never silently discarded.
10. Revoked user/device cannot sync or reveal cached data after the defined boundary.
11. Ledger rebuild equals materialized balances and valuation projections exactly.
12. CMMS work-order issue/return and TCO remain correct after authority switches.
13. Connector duplicate/out-of-order events do not duplicate movements or regress state.
14. Import/export neutralizes hostile spreadsheet cells and respects masking/scope.
15. UI passes keyboard, focus, announcement, contrast and responsive tablet certification.
16. Clean installation, representative upgrade and restore certification pass.

## 16. Definition of Done

Phase 5 is not Done merely because tables or screens exist. Done requires:

- one documented canonical Inventory authority;
- real PostgreSQL persistence and no production-reachable mock/fallback;
- ledger-derived, deterministic stock and valuation;
- server/RLS tenant and organization/site enforcement;
- accessible web/tablet operations and versioned mobile contracts;
- durable audit, inbox/outbox, jobs, telemetry and reconciliation;
- Phase 4 product/UOM references without duplication;
- CMMS consumer convergence with row/total/checksum and rollback evidence;
- no remaining production-reachable legacy CMMS stock write path;
- no false claim that legacy tables are retired or that SAP is integrated;
- full verification and named independent review;
- separate human authorization for deployment, external integration and production release.

## 17. Decisions required before Build

1. Confirm reserved WI-OI-091 is the canonical Phase 5 work item.
2. Confirm Inventory is a selectable business module hosted in the shared module host by default.
3. Confirm no-negative-stock as the initial invariant.
4. Approve operational valuation policies and precision; Finance/GL remains excluded.
5. Approve count behavior while movements continue: bounded freeze or movement-aware snapshot.
6. Approve barcode standards/label printer adapter boundary.
7. Confirm CMMS is the first consumer and its existing tables remain during the compatibility period.
8. Confirm the first release is native GigaLibs only; external ERP adapters are later provider slices.
9. Define quantitative performance/scale targets at G2 using an accepted tenant profile.

## 18. First end-to-end vertical slice

Using UI and real APIs, for one tenant and two sibling organizations:

1. select an active Phase 4 product and UOM;
2. create a warehouse, receiving zone, storage bin and staging location;
3. receive a lot-controlled quantity with an idempotency key;
4. put it away by scan;
5. create a CMMS work-order reservation and material kit;
6. pick and stage the exact lot;
7. issue part of the kit and return the unused quantity;
8. run a blind count and approve a variance with distinct actors;
9. rebuild balances from the ledger;
10. prove sibling/second-tenant denial, audit, outbox and Analytics facts.

This slice proves the architecture before bulk operations, offline execution, valuation and external adapters
expand the surface.
