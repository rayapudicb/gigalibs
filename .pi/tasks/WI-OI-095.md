# WI-OI-095: Treasury Operations, Bank Accounts, Statement Ingestion & Automated Bank Reconciliation

- **Status:** Approved (owner, 2026-10-04) | Review
- **Work item:** WI-OI-095 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-095.md`.
- **Size:** L
- **Domain:** SDLC Orchestrator / Treasury & Cash Management Domain (`modules/financial-operations`)

## Goal

Deliver complete cash and treasury operations extending Phase 8 General Ledger (`gigalibs_finance`), providing authoritative bank account masters, electronic bank statement parsing (OFX, MT940, CAMT.053, CSV), automated matching rule engine, interactive reconciliation workspace, and immutable GL cash clearing vouchers.

## Scope

- **May change:**
  - `docs/architecture/ADR-0027-treasury-bank-reconciliation.md`
  - `packages/contracts/src/finance/` (new treasury/bank schemas, statement parsing contracts, reconciliation events)
  - `modules/financial-operations/db/migrations/` (new forward migration `000002_finance_treasury_reconciliation.up.sql`)
  - `modules/financial-operations/apps/api/src/` (treasury service, statement parser, reconciliation engine, controllers)
  - `modules/financial-operations/web/src/` (Banking & Bank Reconciliation tabs, statement upload, transaction match view)
  - `scripts/verify-treasury-reconciliation.mjs`
  - `.pi/tasks/WI-OI-095.md`, `.pi/work/WI-OI-095.md`, `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `config/sdlc-governance.json`
- **Must not change:** Never, on any card:
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180;
  - existing migrations in other modules.

## Read first

- `docs/plans/deferred-finance-ops-bigcapital-benchmark-roadmap.md` (§Stage F6)
- `docs/architecture/ADR-0025-financial-operations-subledgers-general-ledger-module.md`
- `modules/financial-operations/module.yaml`
- `AGENTS.md`

## Delivery Slices

| Slice | Phase | Deliverable |
|---|---|---|
| **T-0** | Architecture & Threat Model | Author ADR-0027 establishing Treasury domain boundaries, statement line state machines, matching rule taxonomy, and cryptographic reconciliation seals. |
| **T-1** | Contracts & Types | Deliver `@gigalibs/contracts/finance` treasury extensions (`BankAccountV1`, `BankStatementV1`, `BankStatementLineV1`, `BankReconciliationSessionV1`, `MatchRuleV1`). |
| **T-2** | Forward Migrations | Apply `000002_finance_treasury_reconciliation.up.sql` to `gigalibs_finance` with hardware RLS, immutable statement lines, and balance verification triggers. |
| **T-3** | Bank Accounts & Balances | Bank Account setup, IBAN/Routing validation, GL Cash Account binding, and real-time book balance calculation. |
| **T-4** | Statement Ingestion Engine | Multi-format statement parser supporting OFX, MT940, CAMT.053 XML, and standardized CSV with idempotency checksums. |
| **T-5** | Auto-Matching Rule Engine | Automated reconciliation matcher executing deterministic rules (Exact Amount + Reference match, Date-window fuzzy match, Toleranced fee adjustments). |
| **T-6** | Manual Match & Adjustment Journal | Interactive match/unmatch API, discrepancy resolution, and automated GL bank fee/interest journal creation via Phase 8 double-entry engine. |
| **T-7** | Reconciliation Seal & Audit Proof | Close reconciliation session, generate cryptographic SHA-256 seal of reconciled statement lines, and produce Bank Reconciliation Report. |
| **T-8** | Web Treasury Workspace | Add "Treasury & Banking" and "Reconciliation Studio" tabs to `FinancialOperationsWorkspace` with statement import dropzone and split-screen matching. |
| **T-9** | Real Database ACID Proof & Audits | Standalone verification script (`scripts/verify-treasury-reconciliation.mjs`) certifying 10+ PostgreSQL 16 database scenarios and full `pnpm verify`. |

## Done when

- [x] ADR-0027 is authored and accepted.
- [x] Bank account masters and electronic statement ingestion schemas are compiled in `@gigalibs/contracts`.
- [x] Migration `000002` applies cleanly to `gigalibs_finance` with RLS policies and immutability triggers.
- [x] OFX, MT940, CAMT.053, and CSV statement parsers pass comprehensive unit and integration tests.
- [x] Auto-matching engine correctly matches ledger cash movements with bank statement lines.
- [x] Reconciliation sessions compute exact cleared balances, outstanding deposits, and outstanding checks with zero floating-point arithmetic.
- [x] Session closure generates a cryptographic seal and updates GL cash account reconciliation status.
- [x] Web workspace renders banking overview and transaction matching with Safe AST validation.
- [x] Standalone test script verifies 10+ real PostgreSQL 16 database scenarios.
- [x] `pnpm verify` passes cleanly with zero failures.
- [x] Evidence recorded in `.pi/work/WI-OI-095.md`, `.pi/WORK_ITEMS.md`, and `.pi/NOW.md`.

## Stop and ask if

- a decision is needed that the vision or the owner has not settled;
- a step would change a running service, the database or the owner's data.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
