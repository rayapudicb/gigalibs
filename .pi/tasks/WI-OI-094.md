# WI-OI-094: Financial Operations, Subledgers, and General Ledger Integration (Phase 8)

- **Status:** In progress (Approved by owner, 2026-10-04)
- **Work item:** WI-OI-094 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-094.md`.
- **Size:** XL, delivered across 10 slices P8-0 through P8-9
- **Depends on:** WI-OI-109, WI-OI-110, WI-OI-111, WI-OI-112, WI-OI-091, WI-OI-092, WI-OI-093, ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021, ADR-0022, ADR-0023, ADR-0024, ADR-0025

### Architectural constraints & agreements recorded (2026-10-04)

- **Module isolation:** Selectable capability module `modules/financial-operations` owning isolated schema `gigalibs_finance` (`crossSchemaAccess: false`).
- **Bigcapital Parity + iDempiere Rigor:** Reconciles Bigcapital accounting workflows with iDempiere §3.5 enterprise posting standards (`Fact_Acct`, `C_AcctSchema`, `C_ElementValue`, `C_PeriodControl`, `reverseCorrectIt()`).
- **Zero JS float arithmetic:** All money amounts stored as exact integer minor units (cents) or BigInt-safe strings.
- **Double-Entry Invariant:** Mathematical enforcement:
  $$\sum \text{Base Debits} - \sum \text{Base Credits} = 0$$
  Enforced both in application validation and via database trigger / check constraints.
- **Strict Immutability & Anti-Tamper:** Posted journal lines cannot be updated or deleted (`trg_gl_journal_lines_immutable`). Corrections require reversal entries (`reverseCorrectIt`) referencing `reversed_journal_id`.
- **Period Control Lockout:** Postings targeting `LOCKED` fiscal periods are fail-closed and rejected by database trigger.
- **Subledger Ingestion:** Contract-driven event ingestion from Phase 6 AP Bills (`AP_BILL_POSTED`), Phase 7 AR Invoices (`AR_INVOICE_ISSUED`), and Phase 5 Inventory Receipts (`RECEIPT_PROCESSED`).
- **Metadata extensibility:** Core financial math and ledger immutability in PostgreSQL + Application Dictionary metadata embedding (`FinancialConfigurationAdapterV1`, Safe AST validation, `<DictionaryRenderer />`).

## Goal

Build one tenant- and organization-aware authority for multi-book accounting schemas, hierarchical chart of accounts, fiscal periods, immutable double-entry general ledger journal facts, subledger ingestion (AP, AR, inventory), and real-time financial statements (Trial Balance, Balance Sheet, Income Statement), consumable via versioned contracts and manageable via a manifest-contributed web workspace.

## Scope

- **May change after approval:** `modules/financial-operations` module skeleton, contracts in `packages/contracts/src/finance`, schema `gigalibs_finance` migrations, API controllers/services, `FinancialConfigurationAdapterV1`, manifest-contributed web workspace (`FinancialOperationsWorkspace.tsx`), gateway registration, and PostgreSQL verification harness.
- **Must not change:** Never, on any card:
  - Phase 3 Party master ownership (`@gigalibs/contracts/parties`);
  - Phase 4 Product/UOM master ownership (`@gigalibs/contracts/catalogue`);
  - Phase 5 Universal Inventory ledger ownership (`@gigalibs/contracts/inventory`);
  - Phase 6 Universal Procurement ownership (`@gigalibs/contracts/procurement`);
  - Phase 7 Universal Orders ownership (`@gigalibs/contracts/orders`);
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180.

## Read first

- `docs/plans/enterprise-architecture-phase-8-financial-operations-gl-implementation-plan.md`
- `docs/architecture/ADR-0025-financial-operations-subledgers-general-ledger-module.md`
- `docs/plans/deferred-finance-ops-bigcapital-benchmark-roadmap.md`
- `docs/iDempiere_to_Gigalibs_Enterprise_Architecture_Spec.docx` §3.5

## Steps

1. **P8-0:** Author ADR-0025 (`docs/architecture/ADR-0025-financial-operations-subledgers-general-ledger-module.md`) and threat model.
2. **P8-1:** Add versioned public contracts in `packages/contracts/src/finance` and module skeleton `modules/financial-operations`.
3. **P8-2:** Implement forward-only migrations for schema `gigalibs_finance` (books, COA, periods, journals, lines, RLS, double-entry triggers, immutability triggers).
4. **P8-3:** Implement Accounting Books & Hierarchical Chart of Accounts service (natural classes, sub-types, reconcilable control accounts).
5. **P8-4:** Implement Fiscal Periods & Period Control service (calendar bounds, `OPEN`/`SOFT_CLOSED`/`LOCKED` lifecycle, fail-closed lockout).
6. **P8-5:** Implement Double-Entry Journal Engine (balanced postings, zero float minor units, multi-currency support, `reverseCorrectIt()` counter-document generator).
7. **P8-6:** Implement Subledger Ingestion Handlers (Phase 6 AP Bills, Phase 7 AR Invoices, Phase 5 Goods Receipts mapped to balanced GL facts).
8. **P8-7:** Implement Real-Time Financial Statements Engine (Trial Balance, Balance Sheet, Income Statement with transaction drill-down).
9. **P8-8:** Implement Application Dictionary metadata adapter (`FinancialConfigurationAdapterV1`) and `<FinancialOperationsWorkspace />`.
10. **P8-9:** Deliver real PostgreSQL multi-tenant certification harness (`real-database-proof.ts`) and verify all SDLC audits.

## Done when

- [ ] All 10 slices P8-0 through P8-9 are implemented and verified.
- [ ] Contracts in `packages/contracts/src/finance` export all schemas and pass Zod validation.
- [ ] PostgreSQL migration `gigalibs_finance` applies cleanly with forced RLS and immutability triggers.
- [ ] Double-entry balance invariant $\sum \text{Debits} = \sum \text{Credits}$ is verified at DB trigger and application boundary.
- [ ] Immutability trigger rejects `UPDATE` and `DELETE` on posted entries.
- [ ] Subledger ingestion generates balanced GL facts for AP bills, AR invoices, and inventory receipts.
- [ ] Financial statements (Trial Balance, Balance Sheet, Income Statement) calculate in real-time.
- [ ] Metadata adapter and `<FinancialOperationsWorkspace />` render with `<DictionaryRenderer />`.
- [ ] 10+ real-database proof scenarios pass on PostgreSQL 16.
- [ ] `pnpm verify` passes (or reports only known deployment-profile drift).
- [ ] Evidence recorded in `.pi/work/WI-OI-094.md` and `.pi/NOW.md` updated.

## Stop and ask if

- A decision is needed that the vision, ADR-0025, or the owner has not settled.
- A step would change a running service, the database outside `gigalibs_finance`, or the owner's data.

## Report

At most five short bullets: what changed, the evidence, what's next, and what the owner must decide.
