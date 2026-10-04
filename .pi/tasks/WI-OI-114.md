# WI-OI-114: Fixed Assets Management, Asset Register & Depreciation Engine

- **Status:** Review
- **Work item:** WI-OI-114 (row in `.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-114.md`.
- **Size:** L
- **Domain:** SDLC Orchestrator / Fixed Assets & Capital Accounting Domain (`modules/financial-operations`)

## Goal

Deliver authoritative Fixed Assets Management extending Phase 8 General Ledger and Phase 9 Treasury (`gigalibs_finance`), providing fixed asset classification, asset register and acquisition capitalization, multi-method depreciation calculation (Straight-Line, Declining Balance), monthly schedule projection, automated GL depreciation journal runs, disposals/retirements with gain/loss recognition, and real-time Net Book Value (NBV) reporting.

## Scope

- **May change:**
  - `docs/architecture/ADR-0028-fixed-assets-depreciation-engine.md`
  - `packages/contracts/src/finance/` (new fixed asset schemas, depreciation DTOs, disposal contracts, CloudEvents)
  - `modules/financial-operations/db/migrations/` (new forward migration `000003_finance_fixed_assets.up.sql`)
  - `modules/financial-operations/apps/api/src/` (fixed assets service, depreciation calculator, disposal engine, controllers)
  - `modules/financial-operations/web/src/` (Fixed Assets & Depreciation Studio tabs in `FinancialOperationsWorkspace`)
  - `scripts/verify-fixed-assets.mjs`
  - `.pi/tasks/WI-OI-114.md`, `.pi/work/WI-OI-114.md`, `.pi/WORK_ITEMS.md`, `.pi/NOW.md`, `config/sdlc-governance.json`
- **Must not change:** Never, on any card:
  - the CMMS import/export files;
  - another agent's work;
  - secrets;
  - the web on port 5180;
  - existing migrations in other modules.

## Read first

- `docs/plans/deferred-finance-ops-bigcapital-benchmark-roadmap.md` (§Stage F2 & F8)
- `docs/architecture/ADR-0025-financial-operations-subledgers-general-ledger-module.md`
- `docs/architecture/ADR-0027-treasury-bank-reconciliation.md`
- `modules/financial-operations/module.yaml`
- `AGENTS.md`

## Delivery Slices

| Slice | Phase | Deliverable |
|---|---|---|
| **FA-0** | Architecture & Threat Model | Author ADR-0028 establishing Fixed Assets domain boundaries, asset lifecycle state machines, depreciation formulas (Straight-Line, Declining Balance), and GL journal posting invariants. |
| **FA-1** | Contracts & Types | Deliver `@gigalibs/contracts/finance` fixed asset extensions (`AssetClassV1`, `FixedAssetV1`, `DepreciationScheduleV1`, `DepreciationRunV1`, `AssetDisposalV1`, input DTOs, and CloudEvents). |
| **FA-2** | Forward Migrations | Apply `000003_finance_fixed_assets.up.sql` to `gigalibs_finance` provisioning `fixed_asset_classes`, `fixed_assets`, `asset_depreciation_schedules`, `asset_depreciation_runs`, `asset_disposals` with hardware RLS, immutability triggers, and check constraints. |
| **FA-3** | Asset Classes & Register | Asset classification setup, GL account linkage (Asset Cost, Depreciation Expense, Accumulated Depreciation, Gain/Loss on Disposal), acquisition capitalization, and serial/tag metadata. |
| **FA-4** | Depreciation Schedule Engine | Deterministic multi-method depreciation calculation (Straight-Line, Declining Balance) computing periodic depreciation amounts and cumulative schedules with exact BigInt integer minor unit precision. |
| **FA-5** | Periodic Depreciation Run Engine | Batch fiscal period depreciation runner creating balanced double-entry GL journal vouchers (`FinanceService.postJournal`) with immutability locking of posted schedule lines. |
| **FA-6** | Asset Disposal & Retirement Engine | Asset sale/scrap/write-off processing, automated net book value (NBV) offset, disposal proceeds booking, and gain/loss recognition GL journal posting. |
| **FA-7** | Revaluation & Net Book Value Reporting | Net book value tracking, asset impairment adjustments, and consolidated fixed asset register statement generation. |
| **FA-8** | Web Assets & Depreciation Workspace | Add "Fixed Assets" and "Depreciation Studio" tabs to `FinancialOperationsWorkspace` with asset registry cards, schedule forecast views, and batch depreciation posting interface with Safe AST validation. |
| **FA-9** | Real Database ACID Proof & Audits | Standalone verification script (`scripts/verify-fixed-assets.mjs`) certifying 10+ PostgreSQL 16 database scenarios and full `pnpm verify`. |

## Done when

- [x] ADR-0028 is authored and accepted.
- [x] Fixed asset masters, depreciation schedules, and disposal schemas are compiled in `@gigalibs/contracts`.
- [x] Migration `000003` applies cleanly to `gigalibs_finance` with RLS policies and immutability triggers.
- [x] Straight-Line and Declining Balance depreciation calculators pass comprehensive unit tests with zero floating-point arithmetic.
- [x] Period depreciation runs post balanced double-entry vouchers to General Ledger.
- [x] Asset disposal correctly clears asset cost, accumulated depreciation, recognizes cash proceeds, and posts gain/loss entries.
- [x] Web workspace renders fixed asset register and depreciation run controls with Safe AST validation.
- [x] Standalone test script verifies 10+ real PostgreSQL 16 database scenarios.
- [x] `pnpm verify` passes cleanly with zero failures.
- [x] Evidence recorded in `.pi/work/WI-OI-114.md`, `.pi/WORK_ITEMS.md`, and `.pi/NOW.md`.

## Stop and ask if

- a decision is needed that the vision or the owner has not settled;
- a step would change a running service, the database or the owner's data.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
