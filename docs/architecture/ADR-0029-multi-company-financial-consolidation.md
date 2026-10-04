# ADR-0029: Multi-Company Financial Consolidation & Intercompany Eliminations

- **Status:** Accepted
- **Date:** 2026-10-04
- **Work item:** WI-OI-115
- **Depends on:** ADR-0016, ADR-0020, ADR-0025, ADR-0026, ADR-0027, ADR-0028

## Context

Enterprise groups typically consist of a parent holding company and multiple subsidiary operating entities across jurisdictions, currencies, and regulatory environments. While Phase 8 (`WI-OI-094`, ADR-0025) established the double-entry General Ledger (`gigalibs_finance`), Phase 9 (`WI-OI-095`, ADR-0027) delivered Treasury & Bank Reconciliation, and Phase 10 (`WI-OI-114`, ADR-0028) established Fixed Assets & Depreciation, multi-entity corporations require group-level financial consolidation under IFRS 10 / ASC 810 and IAS 21 / ASC 830.

Without group consolidation:
- Multi-company enterprises must export disjointed subsidiary trial balances to external spreadsheets, creating audit risks and manual calculation errors.
- Intercompany transactions (intercompany sales, shared service charges, intra-group loans, and management fees) artificially inflate group gross revenues, expenses, receivables, and payables.
- Subsidiary accounts maintained in local functional currencies (e.g., GBP, EUR, JPY) cannot be reliably translated into the group reporting currency (e.g., USD) while maintaining balance sheet equity integrity.
- Non-controlling interests (minority shareholders holding < 100% equity in subsidiaries) cannot be accounted for systematically.

Phase 11 (`WI-OI-115`) introduces **Multi-Company Financial Consolidation & Intercompany Eliminations** inside `modules/financial-operations` (`gigalibs_finance` v4), establishing authoritative consolidation group hierarchies, multi-currency foreign exchange translation with Cumulative Translation Adjustment (CTA), bilateral intercompany matching and automated elimination journal vouchers, non-controlling interest allocation, and consolidated financial reporting.

---

## Decision

### 1. Separation of Concerns: Architecture vs Metadata

| Domain | Governed by Architecture Foundations (Database, Engine, Security) | Governed by Metadata Foundations (Application Dictionary & Studio) |
|---|---|---|
| **Security & Isolation** | Hardware Row-Level Security on `gigalibs_finance`, tenant isolation, signed token contexts. | Entity visibility masks, consolidation run initiation permissions. |
| **Arithmetic & Invariants** | Zero floating-point math; exact integer minor units (BigInt). Balanced invariant $\sum \text{Debits} = \sum \text{Credits}$ on translated trial balances and elimination journals. | Currency display formatting, percentage representations. |
| **FX Translation (IAS 21)** | Deterministic translation: Closing rate for BS assets/liabilities, Period Average rate for P&L revenues/expenses, Historical rate for equity, with CTA equity reserve balancing. | Exchange rate provider labels, manual FX rate override notes. |
| **Eliminations Engine** | Bilateral account pairing; automated balanced elimination vouchers clearing intercompany positions. | Rule tags, discrepancy threshold warnings in UI. |
| **Audit & Immutability** | Database triggers prohibiting alteration or deletion of sealed consolidation runs and posted elimination entries. | Consolidation run notes, review sign-off commentary. |

---

### 2. Multi-Entity Consolidation Architecture & Data Model (`gigalibs_finance`)

Extending the dedicated schema `gigalibs_finance` with hardware RLS enforced on all tables:

1. **`consolidation_groups`**:
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `code VARCHAR(50) NOT NULL` (e.g. `GRP-GLOBAL`, `GRP-EMEA`, `GRP-APAC`)
   - `name VARCHAR(200) NOT NULL`
   - `description TEXT`
   - `reporting_currency VARCHAR(3) NOT NULL` (ISO 4217, e.g. `USD`)
   - `parent_entity_id UUID NOT NULL REFERENCES accounting_books(id)` (The holding company book)
   - `cta_gl_account_id UUID NOT NULL REFERENCES chart_of_accounts(id)` (Equity account for Cumulative Translation Adjustment)
   - `nci_gl_account_id UUID REFERENCES chart_of_accounts(id)` (Equity account for Non-Controlling Interest)
   - `is_active BOOLEAN NOT NULL DEFAULT true`
   - `version INT NOT NULL DEFAULT 1`
   - `CONSTRAINT consolidation_groups_code_unique UNIQUE (tenant_id, code)`

2. **`consolidation_entities`**:
   - Member accounting books participating in the consolidation group.
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `consolidation_group_id UUID NOT NULL REFERENCES consolidation_groups(id) ON DELETE CASCADE`
   - `book_id UUID NOT NULL REFERENCES accounting_books(id)`
   - `ownership_percentage INT NOT NULL CHECK (ownership_percentage BETWEEN 1 AND 100)` (e.g., 100 for wholly-owned, 80 for 80% majority owned)
   - `consolidation_method VARCHAR(30) NOT NULL DEFAULT 'FULL'` (`FULL` for >= 50% control, `PROPORTIONAL`, `EQUITY`)
   - `is_parent BOOLEAN NOT NULL DEFAULT false`
   - `version INT NOT NULL DEFAULT 1`
   - `CONSTRAINT consolidation_entities_unique UNIQUE (tenant_id, consolidation_group_id, book_id)`

3. **`consolidation_fx_rates`**:
   - Fiscal-period-specific exchange rates between subsidiary functional currencies and group reporting currency.
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `consolidation_group_id UUID NOT NULL REFERENCES consolidation_groups(id)`
   - `fiscal_year_id UUID NOT NULL REFERENCES fiscal_years(id)`
   - `fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id)`
   - `from_currency VARCHAR(3) NOT NULL`
   - `to_currency VARCHAR(3) NOT NULL`
   - `closing_rate_scaled BIGINT NOT NULL CHECK (closing_rate_scaled > 0)` (Scaled by $10^6$, e.g. 1.250000 = 1250000)
   - `average_rate_scaled BIGINT NOT NULL CHECK (average_rate_scaled > 0)` (Scaled by $10^6$)
   - `historical_rate_scaled BIGINT NOT NULL CHECK (historical_rate_scaled > 0)` (Scaled by $10^6$)
   - `version INT NOT NULL DEFAULT 1`
   - `CONSTRAINT consolidation_fx_rates_unique UNIQUE (tenant_id, consolidation_group_id, fiscal_period_id, from_currency, to_currency)`

4. **`intercompany_pairs`**:
   - Configured bilateral intercompany relationships and mirror accounts between legal entities.
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `consolidation_group_id UUID NOT NULL REFERENCES consolidation_groups(id)`
   - `code VARCHAR(50) NOT NULL`
   - `entity_a_book_id UUID NOT NULL REFERENCES accounting_books(id)`
   - `entity_a_gl_account_id UUID NOT NULL REFERENCES chart_of_accounts(id)` (e.g., Sub A: Intercompany Receivable from Sub B)
   - `entity_b_book_id UUID NOT NULL REFERENCES accounting_books(id)`
   - `entity_b_gl_account_id UUID NOT NULL REFERENCES chart_of_accounts(id)` (e.g., Sub B: Intercompany Payable to Sub A)
   - `pair_type VARCHAR(30) NOT NULL DEFAULT 'BALANCE_SHEET'` (`BALANCE_SHEET` [Due-To/Due-From], `INCOME_STATEMENT` [Intercompany Sales/Purchases], `DIVIDEND`)
   - `elimination_target VARCHAR(30) NOT NULL DEFAULT 'BILATERAL'`
   - `is_active BOOLEAN NOT NULL DEFAULT true`
   - `version INT NOT NULL DEFAULT 1`
   - `CONSTRAINT intercompany_pairs_unique UNIQUE (tenant_id, consolidation_group_id, code)`

5. **`consolidation_runs`**:
   - Immutable audit records of executed consolidation runs.
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `consolidation_group_id UUID NOT NULL REFERENCES consolidation_groups(id)`
   - `run_number VARCHAR(50) NOT NULL` (e.g. `CRUN-2026-M09-001`)
   - `fiscal_year_id UUID NOT NULL REFERENCES fiscal_years(id)`
   - `fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id)`
   - `status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'` (`DRAFT`, `TRANSLATED`, `ELIMINATED`, `SEALED`, `REVERSED`)
   - `total_subsidiary_debit_minor BIGINT NOT NULL DEFAULT 0`
   - `total_subsidiary_credit_minor BIGINT NOT NULL DEFAULT 0`
   - `total_elimination_debit_minor BIGINT NOT NULL DEFAULT 0`
   - `total_elimination_credit_minor BIGINT NOT NULL DEFAULT 0`
   - `total_cta_minor BIGINT NOT NULL DEFAULT 0`
   - `total_consolidated_debit_minor BIGINT NOT NULL DEFAULT 0`
   - `total_consolidated_credit_minor BIGINT NOT NULL DEFAULT 0`
   - `executed_by VARCHAR(64) NOT NULL`
   - `executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `sealed_at TIMESTAMPTZ`
   - `version INT NOT NULL DEFAULT 1`
   - `CONSTRAINT consolidation_runs_unique UNIQUE (tenant_id, run_number)`

6. **`consolidation_entries`**:
   - Snapshot of translated line-item balances contributed by each member entity for the run.
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `consolidation_run_id UUID NOT NULL REFERENCES consolidation_runs(id) ON DELETE CASCADE`
   - `book_id UUID NOT NULL REFERENCES accounting_books(id)`
   - `gl_account_id UUID NOT NULL REFERENCES chart_of_accounts(id)`
   - `local_currency VARCHAR(3) NOT NULL`
   - `local_debit_minor BIGINT NOT NULL DEFAULT 0`
   - `local_credit_minor BIGINT NOT NULL DEFAULT 0`
   - `fx_rate_type VARCHAR(20) NOT NULL` (`CLOSING`, `AVERAGE`, `HISTORICAL`, `ONE_TO_ONE`)
   - `fx_rate_applied_scaled BIGINT NOT NULL`
   - `reporting_currency VARCHAR(3) NOT NULL`
   - `reporting_debit_minor BIGINT NOT NULL DEFAULT 0`
   - `reporting_credit_minor BIGINT NOT NULL DEFAULT 0`

7. **`consolidation_eliminations`**:
   - Elimination journal vouchers generated during the run.
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `consolidation_run_id UUID NOT NULL REFERENCES consolidation_runs(id) ON DELETE CASCADE`
   - `intercompany_pair_id UUID REFERENCES intercompany_pairs(id)`
   - `gl_journal_id UUID REFERENCES gl_journals(id)` (Balanced journal created in consolidation book if booked)
   - `debit_gl_account_id UUID NOT NULL REFERENCES chart_of_accounts(id)`
   - `credit_gl_account_id UUID NOT NULL REFERENCES chart_of_accounts(id)`
   - `elimination_amount_minor BIGINT NOT NULL CHECK (elimination_amount_minor > 0)`
   - `currency_code VARCHAR(3) NOT NULL`
   - `discrepancy_amount_minor BIGINT NOT NULL DEFAULT 0`
   - `description TEXT NOT NULL`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

---

### 3. Currency Translation Engine (IAS 21 / ASC 830)

When a subsidiary operates in a functional currency different from the group reporting currency, its trial balance is translated deterministically:
1. **Balance Sheet Monetary Assets & Liabilities**: Translated at the **Closing Rate** (spot rate at period end).
2. **Income Statement Revenues & Expenses**: Translated at the **Period Average Rate**.
3. **Equity Accounts (Common Stock, Paid-in Capital)**: Translated at the **Historical Rate**.
4. **Cumulative Translation Adjustment (CTA)**:
   Because different accounts are translated at different rates, an arithmetic imbalance arises between total translated debits and credits:
   $$\text{CTA} = \sum \text{Translated Credits} - \sum \text{Translated Debits}$$
   The translation engine generates an offsetting entry to the group's designated `cta_gl_account_id` in equity, ensuring exact conservation of the fundamental accounting equation:
   $$\sum \text{Translated Debits} = \sum \text{Translated Credits}$$
   Zero JavaScript floating-point arithmetic is permitted; all conversions use integer math scaled by $10^6$.

---

### 4. Bilateral Intercompany Elimination Mechanics

1. **Balance Sheet Elimination (Due-To / Due-From)**:
   - Entity A holds Intercompany Receivable $R_A$.
   - Entity B holds Intercompany Payable $P_B$.
   - When $R_A = P_B$, the engine creates an elimination voucher:
     - **Debit:** Intercompany Payable ($P_B$)
     - **Credit:** Intercompany Receivable ($R_A$)
   - When $R_A \neq P_B$, the lesser amount is eliminated, and the discrepancy variance is flagged for reconciliation.
2. **Profit & Loss Elimination (Intercompany Sales & COGS)**:
   - Entity A records Intercompany Revenue $S_A$.
   - Entity B records Intercompany Cost of Goods Sold $C_B$.
   - Elimination voucher:
     - **Debit:** Intercompany Revenue
     - **Credit:** Intercompany COGS / Operating Expense
3. **Consolidation Scope**:
   Elimination vouchers affect only the consolidated view or dedicated group consolidation books; they never overwrite subsidiary operational subledgers.

---

### 5. Non-Controlling Interest (NCI) Allocation

For subsidiaries with ownership share $S < 100\%$:
- Consolidated balance sheet reflects 100% of subsidiary assets and liabilities.
- The minority portion of subsidiary equity ($(1 - S) \times \text{Subsidiary Equity}$) is reclassified to the Non-Controlling Interest line in Consolidated Equity.
- In the consolidated income statement, minority profit share is segregated:
  $$\text{Net Income Attributable to NCI} = (1 - S) \times \text{Subsidiary Net Income}$$

---

### 6. Consequences

#### Positive
- Complete IFRS 10 / ASC 810 and IAS 21 group consolidation capability.
- Exact integer minor unit math; zero float rounding artifacts across currencies.
- Automated bilateral intercompany eliminations eliminate double-counting.
- Full audit traceability from group financial statements down to subsidiary journal vouchers.
- Hardware Row-Level Security and immutability triggers prevent unauthorized edits to sealed consolidation runs.

#### Negative / Trade-Offs
- Requires configuring intercompany account pairs and fiscal-period FX rates before running consolidation.
- Advanced unrealized inventory profit eliminations with complex supply chains require tiered multi-echelon margin tracking (addressed in Phase 12).
