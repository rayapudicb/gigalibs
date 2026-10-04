# ADR-0025: Financial Operations, Subledgers, and General Ledger Integration — Ownership, Immutability, and Metadata Architecture

- **Status:** Proposed
- **Date:** 2026-10-04
- **Work item:** WI-OI-094
- **Depends on:** ADR-0002, ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020, ADR-0021, ADR-0022, ADR-0023, ADR-0024

## Context

Financial integrity and enterprise operational intelligence require a hardened, auditable, double-entry General Ledger (GL) and Subledger engine that bridges operational events (procurement, inventory receipts, sales order fulfillment, customer invoicing, supplier billing) into real-time financial statements.

Historically:
- Earlier billing slices (`modules/accounts-receivable`, `modules/spend-management`) provided basic standalone document tables without a unified general ledger or balanced double-entry journal fact store.
- Independent benchmark analysis of Bigcapital (`/Users/rayapudi/Downloads/bigcapital-develop`) demonstrated comprehensive accounting workflows (Chart of Accounts, multi-currency transactions, manual journals, banking, financial statements). However, Bigcapital lacks enterprise tenant isolation, row-level security, organization hierarchies, and immutable audit seals.
- Architectural evaluation of iDempiere (§3.5 Record-to-Report / `Fact_Acct`, `C_AcctSchema`, `C_ElementValue`, `C_PeriodControl`, `reverseCorrectIt()`) highlighted proven enterprise foundations: multi-book accounting schemas, hierarchical chart of accounts, automated subledger posting rules, strict fiscal period lockouts, and immutable counter-document reversals.
- Preceding phases established canonical master data and upstream operations:
  - Phase 3 (`WI-OI-111`, ADR-0020): Core Parties (Customers, Vendors, Legal Entities).
  - Phase 4 (`WI-OI-112`, ADR-0021): Product Catalogue & Pricing.
  - Phase 5 (`WI-OI-091`, ADR-0022): Universal Inventory & Physical Stock Ledgers.
  - Phase 6 (`WI-OI-092`, ADR-0023): Universal Procurement, 3-Way Matching, and AP Bills.
  - Phase 7 (`WI-OI-093`, ADR-0024): Universal Order Management, Fulfillment, and AR Invoices.

Phase 8 now establishes the **Financial Operations, Subledgers, and General Ledger Module** (`modules/financial-operations`), reconciling Bigcapital's workflow completeness and iDempiere's accounting rigor within GigaLibs' zero-trust, metadata-driven architecture.

## Decision

### 1. Separation of Concerns: Metadata Foundations vs Architectural Foundations

To maintain strict financial safety while enabling flexible tenant customization, the architecture establishes a sharp separation of concerns:

| Domain | Governed by Architecture Foundations (Database, Code, Security) | Governed by Metadata Foundations (Application Dictionary & Dynamic Studio) |
|---|---|---|
| **Security & Isolation** | PostgreSQL 16 hardware-enforced Row-Level Security (`gigalibs_finance`), tenant isolation, signed token contexts. | Dynamic UI permission masks, read-only field flags, role-based screen visibility. |
| **Arithmetic & Invariants** | Zero JS float arithmetic using exact integer minor units (BigInt). Balanced invariant $\sum \text{Debits} = \sum \text{Credits}$ enforced at DB trigger and API boundary. | Formatting rules, currency display symbols, locale preferences. |
| **Data Integrity & Audit** | Immutable posted journals; anti-tamper delete/update triggers; cryptographic hash chains; period lockouts. | Custom accounting dimensions (`cost_center`, `project_code`, `tax_jurisdiction`) attached to journal lines as typed metadata. |
| **Correction Model** | Strict `reverseCorrectIt()` counter-documents referencing `reversed_journal_id`. Physical deletions are forbidden. | Workflow approval routing for reversal requests. |
| **Views & Experiences** | Certified core financial reports (Trial Balance, Balance Sheet, Income Statement). | Dynamic entry forms, custom inquiry grids, filter palettes rendered via `<DictionaryRenderer />` and Safe AST. |

### 2. Isolated PostgreSQL Schema (`gigalibs_finance`)

The module owns the dedicated PostgreSQL schema `gigalibs_finance` (`crossSchemaAccess: false`).
All tables feature:
- Mandatory `tenant_id VARCHAR(64)` with composite primary/foreign keys.
- Forced Row-Level Security (RLS) bound to `app.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')`.
- Optimistic concurrency control via `version INT NOT NULL DEFAULT 1`.
- Complete audit metadata (`created_at`, `updated_at`, `created_by`, `updated_by`).

### 3. Legal-Entity Accounting Books & Currencies (`accounting_books`)

- Multi-book support: Each tenant legal entity operates one or more accounting books (e.g. Primary US GAAP/IFRS Book, Local Statutory Book, Tax Book).
- Base functional currency (`ISO 4217` 3-letter code).
- Standard costing method configuration (`STANDARD`, `FIFO`, `AVERAGE`).
- Linked to tenant legal entity from Phase 3 Core Parties (`party_id`).

### 4. Hierarchical Chart of Accounts (`chart_of_accounts`)

Reconciles iDempiere's `C_ElementValue` and Bigcapital's account classification:
- Hierarchical account structure via `parent_account_id`.
- Natural account classes: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`.
- Governed sub-types: `BANK`, `ACCOUNTS_RECEIVABLE`, `CURRENT_ASSET`, `FIXED_ASSET`, `ACCOUNTS_PAYABLE`, `CURRENT_LIABILITY`, `LONG_TERM_LIABILITY`, `EQUITY`, `OPERATING_REVENUE`, `OTHER_REVENUE`, `COST_OF_GOODS_SOLD`, `OPERATING_EXPENSE`, `TAX_EXPENSE`.
- Normal balance direction (`DEBIT` or `CREDIT`).
- Control account flags: `is_reconcilable`, `is_subledger_control`, `is_system_reserved`.

### 5. Fiscal Years & Strict Period Controls (`fiscal_years`, `fiscal_periods`)

Reconciles iDempiere's `C_Period` and `C_PeriodControl`:
- Fiscal calendar divided into bounded accounting periods (e.g. monthly, quarterly, annual adjustment).
- Period lifecycle: `FUTURE -> OPEN -> SOFT_CLOSED -> LOCKED`.
- **Fail-Closed Posting Protection:** Postings targeting `LOCKED` periods are unconditionally rejected at both database trigger and application service boundaries. Postings targeting `SOFT_CLOSED` periods require explicit managerial privilege.

### 6. General Ledger Journals & Fact Lines (`gl_journals`, `gl_journal_lines`)

Reconciles iDempiere's `Fact_Acct` and Bigcapital's `manual_journals` / `accounts_transactions`:
- Journal Header (`gl_journals`):
  - `journal_number`, `accounting_book_id`, `fiscal_period_id`, `posting_date`, `entry_type` (`STANDARD_MANUAL`, `SUBLEDGER_AP`, `SUBLEDGER_AR`, `SUBLEDGER_INVENTORY`, `REVERSAL`, `YEAR_END_CLOSE`).
  - Source document link (`source_document_type`, `source_document_id`).
  - Status: `DRAFT -> POSTED -> REVERSED`.
- Journal Lines (`gl_journal_lines`):
  - `line_number`, `account_id`, `debit_amount_minor`, `credit_amount_minor`, `currency_code`, `exchange_rate`, `base_debit_amount_minor`, `base_credit_amount_minor`, `memo`, `dimensions` (JSONB metadata).
- **Double-Entry Invariant:**
  $$\sum \text{Base Debit Amount Minor} - \sum \text{Base Credit Amount Minor} = 0$$
  Enforced both in memory prior to commit and via database check constraint / trigger.
- **Strict Immutability:**
  A database trigger `trg_gl_journal_lines_immutable` rejects `UPDATE` and `DELETE` statements on lines whose parent journal status is `POSTED`.

### 7. Immutable Reversals (`reverseCorrectIt`)

- Following iDempiere's `reverseCorrectIt()` pattern, posted journals are never edited or dropped.
- Correction requires issuing an explicit reversal journal (`entry_type = 'REVERSAL'`) with debits and credits swapped, referencing `reversed_journal_id`.
- The original journal status transitions to `REVERSED`.

### 8. Contract-Driven Subledger Ingestion Handlers

Ingests upstream events from operational domains into balanced journal facts:
- **Accounts Payable (AP) Ingestion (Phase 6):**
  - Triggered by `procurement.bill.posted.v1`.
  - Debits: Expense or Inventory Accrual (GRNI - Goods Received Not Invoiced).
  - Credits: Accounts Payable Control Account.
- **Accounts Receivable (AR) Ingestion (Phase 7):**
  - Triggered by `orders.invoice.issued.v1`.
  - Debits: Accounts Receivable Control Account.
  - Credits: Revenue Account / Sales Tax Payable.
- **Inventory Receipts Costing Ingestion (Phase 5):**
  - Triggered by `inventory.receipt.confirmed.v1`.
  - Debits: Inventory Asset Account.
  - Credits: Inventory GRNI Clearing Account.

### 9. Real-Time Financial Statements & Reporting

- **Trial Balance:** Aggregates debit/credit turnover and ending balances for all active accounts, certifying $\sum \text{Ending Debits} = \sum \text{Ending Credits}$.
- **Balance Sheet:** Generates point-in-time financial position: $\text{Assets} = \text{Liabilities} + \text{Equity}$.
- **Income Statement (P&L):** Calculates period operating performance: $\text{Net Income} = \text{Revenues} - \text{Expenses}$.

### 10. Application Dictionary & Workspace Integration

- Registers `FinancialConfigurationAdapterV1` in the Application Dictionary compiler.
- Contributes dynamic dimensions, entity forms, and validation rules evaluated via Safe AST.
- Manifest-contributed Web Workspace `<FinancialOperationsWorkspace />` embedding `<DictionaryRenderer />`.

## Consequences

### Positive
- Unified, auditable general ledger and subledger integration across procurement, orders, and inventory.
- Zero risk of floating-point rounding errors through integer minor units.
- Complete regulatory and accounting compliance through immutable posted facts and `reverseCorrectIt()` counter-documents.
- Real-time visibility into financial statements without asynchronous batch lag.

### Negative / Trade-offs
- Strict balanced invariants reject any out-of-balance operational transactions, requiring upstream modules to provide valid accounting distributions.
- Immutability requires reversal transactions for corrections rather than in-place edits.
