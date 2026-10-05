# ADR-0033: Metadata-driven windows, one document lifecycle and event-to-ledger posting

- **Status:** Accepted in direction by the owner (2026-10-05: "every screen should be metadata foundation driven …
  go with your recommendation"). Independent Architecture and Security review pending (named humans, D7).
- **Date:** 2026-10-05
- **Work item:** WI-OI-120 (cards F0, F1, F2)
- **Amends:** ADR-0019 (completes its `AD_Window`/`AD_Tab`/`AD_Field` design).
- **Supersedes:** "Option A: Enhanced Enterprise Hybrid Standard" in ADR-0021, ADR-0022, ADR-0023 and ADR-0024, and
  every other ADR that lets a module hand-code its screens.
- **Reference:** `docs/architecture/IDEMPIERE_FUNCTIONAL_MAP.md` (iDempiere is GPL v2: concepts only, no code).

## Context

The WI-OI-119 audit and the owner's UAT review found:

- **Hand-written screens.** The Phase 4–14 screens are hand-written with hard-coded figures and dead buttons.
- **Custom fields only.** The Application Dictionary (ADR-0019, WI-OI-110) is used only for custom fields, fed by
  constants inside each screen; Product Catalogue alone loads the published dictionary.
- **No window engine.** The renderer draws one record form. It has no grid, no parent-child tabs bound to records, no
  lookups and no document actions. The window contract `DictionarySurfaceV1` was never built.
- **No shared document lifecycle.** Each module invents its own states.
- **No posting.** No completed document posts to the ledger, because no event is relayed or consumed.

iDempiere delivers business outcomes through exactly the three mechanisms GigaLibs lacks:

- windows rendered from the dictionary (`AD_Window`, `AD_Tab`, `AD_Field`);
- one document lifecycle (`DocAction`: prepare, complete, void, close, reverse-correct, reverse-accrual, re-activate,
  approve, reject);
- accounting documents (`Doc_*`) that post every completed document according to an accounting schema.

## Decision

### D1. Every screen is a metadata-driven window (F0)

- A module declares its windows as versioned metadata in its own repository folder (`modules/<m>/dictionary/*.json`),
  compiled by `@gigalibs/configuration-core`:
  - `WindowV1`: title, menu entry, entity, tabs;
  - `TabV1`: entity, parent link, level, grid columns, form sections, default sort and filters, read-only rules;
  - `FieldV1`: column binding, reference type, display rule, mandatory rule, read/write/mask permission;
  - `ReferenceV1`: list, table lookup through a registered resolver;
  - `ActionV1`: document actions and processes bound to API commands.
- The web app has **one** window renderer (`@gigalibs/configuration-react`). It provides:
  - a grid with search, filter, sort and server paging;
  - a form with sections;
  - parent-child tabs;
  - lookups;
  - document-action buttons enabled by the record's state and the user's permissions;
  - loading, empty, validation, permission-denied, conflict (412), stale and dependency-failure states;
  - design tokens only.
- Each entity is served by a **generic, permission-checked record API** in its module, built on the module SDK:
  - `list`, `get`, `create`, `update` and `action` endpoints with tenant and organization scope from the signed
    platform context;
  - optimistic concurrency (`If-Match`) and `Idempotency-Key` on every write;
  - field-level permission and masking on the server.
- The module keeps ownership of its invariants (ledgers, balances, matching, posting) in its domain services. Metadata
  never carries SQL, scripts or DDL (ADR-0019 tenets kept).
- Tenants extend windows and fields through Configuration Studio (draft, approve, publish, roll back) within the
  existing limits. Tenants never remove module-owned fields or bypass module rules.
- **Hand-written screens are allowed only** for capabilities a window cannot express (map canvas, chart builder,
  workflow canvas). Each needs an ADR exception.

### D2. One document lifecycle (F1)

- `@gigalibs/document-lifecycle` (new shared package) defines states `DRAFTED → IN_PROGRESS → COMPLETED → CLOSED`,
  with `VOIDED`, `REVERSED`, `APPROVED`/`NOT_APPROVED` and `INVALID`, and the actions `prepare`, `approve`, `reject`,
  `complete`, `void`, `close`, `reverseCorrect`, `reverseAccrual` and `reactivate`.
- Every transactional document uses it, through one transaction per action:
  - Inventory: receipt, shipment, movement, physical count, internal use;
  - Procurement: requisition, purchase order, vendor invoice, debit memo;
  - Orders: quotation, sales order, credit memo;
  - AR: customer invoice, payment, allocation;
  - Treasury: bank statement;
  - Finance: journal;
  - Fixed assets: addition, disposal, depreciation run;
  - Budgeting: budget revision;
  - CMMS: work order;
  - Workforce: timesheet.
- `prepare` always checks:
  - the period is open for the document's subledger and date (closes P1-07);
  - the approval rules (delegation of authority, segregation of duties);
  - budget availability where configured;
  - credit limits where configured.

  `complete` applies the document's effects and writes its event in the same transaction.
- Completed documents are immutable. Corrections are reversals that reference the original.

### D3. Every completed document posts to the ledger (F2)

- **Relays.** Module outbox relays (module SDK) deliver `*.completed.v1`, `*.voided.v1` and `*.reversed.v1` events.
- **Posting.** Finance consumes them through a durable inbox, which gives deduplication, retry with backoff,
  dead-letter handling and replay. Its posting engine creates a balanced journal from the tenant's accounting schema
  (default rules: `docs/architecture/MODULE_ACTION_OUTCOMES.md`). Posting is idempotent per source document and line.
- **Reconciliation.** A daily job compares documents with journals and reports mismatches.

## Consequences

- **Module cards change shape.** U7–U18 become: entity and window metadata, record API, domain rules, lifecycle,
  posting rules and a Playwright flow. They no longer hand-write screens. The hand-written Phase 4–14 screens are
  replaced, not restyled.
- **Order of work:** U2, then F0 (window engine, proven on Inventory), then F1 and F2, then the module cards.
- **Security.** The record API widens the attack surface. Field-level permissions, tenant scope and object
  authorization are enforced on the server, and each card carries negative tests.
- **Accounting review.** Default posting rules need review by a qualified accountant before any production release
  (WI-OI-119 P1-28).
