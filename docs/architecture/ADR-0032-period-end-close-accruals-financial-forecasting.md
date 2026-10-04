# ADR-0032: Period-End Close Orchestration, Accruals/Deferrals, Financial Health & Multi-Period Forecasting Engine

- **Status:** Accepted
- **Date:** 2026-10-04
- **Work item:** WI-OI-118
- **Depends on:** ADR-0016, ADR-0020, ADR-0024, ADR-0025, ADR-0026, ADR-0027, ADR-0028, ADR-0029, ADR-0030, ADR-0031

## Context

With Financial Operations (`WI-OI-094`), Treasury (`WI-OI-095`), Fixed Assets (`WI-OI-114`), Multi-Company Consolidation (`WI-OI-115`), Inventory Costing (`WI-OI-116`), and Budgeting & Commitment Control (`WI-OI-117`), GigaLibs has established robust double-entry general ledger and subledger operations.

However, enterprise financial accounting requires closing cycles, accrual management, retained earnings rollovers, forward-looking forecasting, and financial statement auditability:
1. **Uncontrolled Period Posting & Missing Subledger Lockouts:** Without progressive subledger lockouts (AP, AR, Inventory, Fixed Assets, Treasury, GL), transactions can be posted into past periods after month-end financial reviews have commenced, invalidating tax reports and management accounts.
2. **Ad-Hoc Period-End Close Checklists:** Month-end close involves multiple sequential steps (reconciling cash, capitalizing landed costs, running depreciation, amortizing prepayments, executing intercompany eliminations). Without an orchestrated checklist with maker-checker approvals, critical milestones are skipped or completed out of order.
3. **Manual Accruals, Prepayments & Deferrals:** Companies must recognize uninvoiced expenses (accruals), amortize prepaid assets over time, and recognize unearned revenue under ASC 606 / IFRS 15. Without automated amortization schedules with cent-conserving distributions and auto-reversing entries on day 1 of the following period, accounting teams suffer manual spreadsheet errors and duplicate postings.
4. **Year-End Close & Retained Earnings Rollover:** At fiscal year-end, temporary P&L accounts (revenues and expenses) must be zeroed out and net income/loss rolled into the balance sheet Retained Earnings equity account with an immutable closing journal voucher, locking the fiscal year.
5. **No Multi-Period Financial Forecasting:** Financial controllers require rolling 3, 6, and 12-month projections blending historical GL actuals, seasonality weights, and active budget commitments (encumbrances).
6. **Financial Statement Drill-Through Auditability:** Auditors and CFOs require instantaneous drill-through from Balance Sheet and Income Statement line items down to underlying GL journal vouchers and subledger source documents.

Phase 14 (`WI-OI-118`) delivers the **Period-End Close Orchestration, Accruals/Deferrals, Financial Health & Multi-Period Forecasting Engine** in `modules/financial-operations` (`gigalibs_finance` v7).

---

## Decision

### 1. Separation of Concerns: Architecture vs Metadata

| Domain | Governed by Architecture Foundations (Database, Engine, Security) | Governed by Metadata Foundations (Application Dictionary & Studio) |
|---|---|---|
| **Security & Isolation** | Hardware Row-Level Security on `gigalibs_finance`, tenant isolation, signed token contexts. | Controller role assignments, close dashboard visibility. |
| **Subledger Lockouts** | Hardware database constraints and trigger blocks preventing postings to locked subledgers (`HARD_LOCKED` vs `SOFT_LOCKED` vs `OPEN`). | Subledger badge indicators, warning toasts. |
| **Accrual Amortization** | Exact integer minor unit calculations (BigInt). Cent-conserving rounding distribution: $\sum \text{periods} = \text{TotalPrincipal}$. Automatic Day 1 reversing vouchers. | Schedule names, recurrence descriptions. |
| **Year-End Rollover** | Automated zeroing of temporary accounts (`REVENUE`, `EXPENSE`), transferring exact Net Income to Retained Earnings (`3000`), locking fiscal year. | Year-end wizard UI, confirmation modal. |
| **Forecasting Engine** | Multi-period historical actuals aggregation, weighted moving average, budget commitment inclusion, financial ratio computations. | Chart color palettes, metric card layouts. |
| **Statement Drill-Through** | Multi-level recursive query from financial statement line $\to$ GL accounts $\to$ journal lines $\to$ subledger document source. | Accordion UI expansion, export formatting. |

---

### 2. Progressive Subledger Lockout & Checklist Architecture

Financial close is executed progressively across six subledger domains in strict dependency order:

```
[1. Accounts Payable] ---> [2. Accounts Receivable] ---> [3. Inventory & Costing]
         |                          |                           |
         v                          v                           v
[4. Fixed Assets]     ---> [5. Treasury & Bank]     ---> [6. General Ledger]
```

- **Lockout States (`SubledgerLockStatusEnum`):**
  - `OPEN`: Postings permitted normally.
  - `SOFT_LOCKED`: Subledger closed to regular operations; postings require Controller approval override with an audit trail note.
  - `HARD_LOCKED`: Complete immutable freeze. Database constraints and API service guards unconditionally reject any document or journal posting referencing this subledger in this period.
- **Milestone Checklist Tasks (`ChecklistTaskTypeEnum`):**
  - `BANK_RECONCILIATION`: All bank accounts cleared and reconciled.
  - `INVENTORY_VALUATION`: Landed cost capitalized, FIFO/AVCO layer consumption finalized.
  - `DEPRECIATION_RUN`: Asset depreciation schedules generated and posted to GL.
  - `ACCRUAL_AMORTIZATION`: Recurring accruals, prepayments, and deferred revenue amortized.
  - `INTERCOMPANY_ELIMINATION`: Bilateral intercompany transaction pairs matched and eliminated.
  - `TAX_CALCULATION`: Sales/VAT and withholding taxes calculated and reconciled.
  - `TRIAL_BALANCE_VERIFICATION`: Debits equal credits across all accounts; out-of-balance rejected.
  - `MAKER_CHECKER_APPROVAL`: Period close signed off by Financial Controller and CFO.

---

### 3. Recurring Accruals, Prepayments & Deferrals Amortization

Amortization schedules manage three primary types of period adjustments with exact cent conservation:

1. **Expense Accruals (`EXPENSE_ACCRUAL`):**
   - For incurred expenses with pending vendor invoices (e.g., month-end utilities, legal retainers).
   - Posts in closing period $P$: Dr Expense Account, Cr Accrued Expenses Liability Account.
   - Automatically posts an auto-reversal voucher on the first day of period $P+1$: Dr Accrued Expenses Liability Account, Cr Expense Account.
2. **Prepayment Amortization (`PREPAYMENT_AMORTIZATION`):**
   - For prepaid expenses (e.g., annual insurance, prepaid rent).
   - Total amount is amortized across $N$ periods using straight-line distribution.
   - Any remainder cents $R = \text{TotalMinor} - (\text{MonthlyBase} \times N)$ are allocated to the final period, guaranteeing exact zero-remainder amortization.
   - Posts each period: Dr Operating Expense Account, Cr Prepaid Asset Account.
3. **Deferred Revenue Amortization (`DEFERRED_REVENUE_AMORTIZATION`):**
   - ASC 606 / IFRS 15 unearned revenue recognition from customer contracts.
   - Posts each period: Dr Deferred Revenue Liability Account, Cr Earned Revenue Account.

---

### 4. Year-End Retained Earnings Rollover Engine

At the conclusion of a fiscal year:
1. The engine inspects all GL journal lines across all fiscal periods in the target fiscal year.
2. It aggregates net balances for all temporary accounts:
   $$\text{TotalRevenueMinor} = \sum \text{Credits} - \sum \text{Debits} \quad (\text{for account\_type} = \text{'REVENUE'})$$
   $$\text{TotalExpenseMinor} = \sum \text{Debits} - \sum \text{Credits} \quad (\text{for account\_type} = \text{'EXPENSE'})$$
   $$\text{NetIncomeMinor} = \text{TotalRevenueMinor} - \text{TotalExpenseMinor}$$
3. The engine generates an immutable closing journal voucher (`document_type = 'YEAR_END_CLOSE'`):
   - Debits every revenue account by its net credit balance (zeroing the account).
   - Credits every expense account by its net debit balance (zeroing the account).
   - Balances the voucher by Crediting `RETAINED_EARNINGS` (for Net Income > 0) or Debiting `RETAINED_EARNINGS` (for Net Loss < 0).
4. The fiscal year status is updated to `CLOSED` and all fiscal periods are locked.

---

### 5. Multi-Period Rolling Forecasting & Financial Health Analytics

1. **Forecasting Models:**
   - Methods: `HISTORICAL_RUN_RATE`, `WEIGHTED_MOVING_AVG`, `BUDGET_ADJUSTED`.
   - Projects 3, 6, or 12 future fiscal periods for revenue and operating expense categories.
   - In `BUDGET_ADJUSTED` mode, the engine dynamically adds active commitments from `gigalibs_finance.budget_commitments` to historical run-rates to generate high-confidence expense forecasts.
2. **Financial Health Indicators:**
   - **Current Ratio:** $\frac{\text{Current Assets}}{\text{Current Liabilities}}$
   - **Quick Ratio:** $\frac{\text{Cash} + \text{Accounts Receivable}}{\text{Current Liabilities}}$
   - **Working Capital:** $\text{Current Assets} - \text{Current Liabilities}$
   - **Debt-to-Equity:** $\frac{\text{Total Liabilities}}{\text{Total Equity}}$
   - **Operating Margin:** $\frac{\text{Operating Income}}{\text{Total Revenue}}$

---

### 6. Interactive Financial Statement Drill-Through

The drill-through service supports a 3-tier audit trace:
1. **Tier 1 (Statement Line):** Balance Sheet or Income Statement line item (e.g., "Accounts Payable: $145,200.00").
2. **Tier 2 (Account Detail):** Natural accounts mapping to the line with opening balance, debit movements, credit movements, and closing balance.
3. **Tier 3 (Journal Voucher & Source Document):** Individual GL journal lines linking to journal vouchers and subledger source documents (`source_document_type`, `source_document_id`).

---

## Consequences

### Positive
- Strict, progressive subledger lockouts prevent unauthorized retroactive postings.
- Checklist orchestration enforces maker-checker control for fiscal period closures.
- Zero-float, cent-conserving amortization automates accruals and prepayments without spreadsheet reconciliation.
- Automated year-end rollover seamlessly transfers net income to Retained Earnings with complete auditability.
- Multi-period rolling forecasting integrates real GL actuals and budget commitments for forward-looking clarity.
- Full drill-through guarantees regulatory auditability from financial statements down to source records.

### Negative / Trade-Offs
- Hard-locked subledgers require formal reopening workflows (with audit trail) if adjustments are required.
- Year-end rollover requires all temporary accounts to be properly classified in the Chart of Accounts.
