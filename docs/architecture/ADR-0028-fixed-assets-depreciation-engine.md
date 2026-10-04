# ADR-0028: Fixed Assets Management, Asset Register & Depreciation Engine

- **Status:** Accepted
- **Date:** 2026-10-04
- **Work item:** WI-OI-114
- **Depends on:** ADR-0016, ADR-0020, ADR-0022, ADR-0025, ADR-0026, ADR-0027

## Context

Capital assets (land, buildings, manufacturing machinery, fleet vehicles, IT infrastructure, and intangible assets) represent the major long-term physical value on an enterprise balance sheet. While Phase 8 (`WI-OI-094`, ADR-0025) established the double-entry General Ledger (`gigalibs_finance`) and Phase 9 (`WI-OI-095`, ADR-0027) delivered Treasury & Bank Reconciliation, enterprise financial operations require authoritative fixed asset capitalization, continuous depreciation schedule projection, periodic batch depreciation journal voucher generation, physical EAM cross-referencing, and disposal gain/loss recognition.

Historically:
- Bigcapital does not include an integrated fixed asset register or automated depreciation engine, relying on manual adjusting journal entries.
- iDempiere (§3.6 Fixed Assets / `A_Asset`, `A_Asset_Group`, `A_Depreciation_Workfile`, `A_Asset_Disposed`) provides asset depreciation capabilities but suffers from tightly coupled schema dependencies and complex procedural PL/SQL triggers.
- GigaLibs owns an operational physical asset management console (`modules/physical-operations-cmms`, `gigalibs_cmms`), but it focuses on physical maintenance, telemetry, uptime, and work orders rather than balance sheet capitalization, tax/book depreciation, and statutory compliance.

Phase 10 (`WI-OI-114`) introduces **Fixed Assets Management, Asset Register & Depreciation Engine** inside `modules/financial-operations`, establishing authoritative asset classification, multi-method depreciation calculation, batch GL journal runs, and disposal accounting.

---

## Decision

### 1. Separation of Concerns: Architecture vs Metadata

| Domain | Governed by Architecture Foundations (Database, Engine, Security) | Governed by Metadata Foundations (Application Dictionary & Studio) |
|---|---|---|
| **Security & Isolation** | Hardware Row-Level Security on `gigalibs_finance`, tenant isolation, financial authority guards. | Asset class visibility, role-based action permissions (Accountant vs Asset Manager). |
| **Arithmetic & Invariants** | Zero floating-point math; exact integer minor units (BigInt). Balanced depreciation entries: $\sum \text{Depr Expense} = \sum \text{Accumulated Depr}$. | Currency symbols, date formats, localized layout definitions. |
| **Depreciation Engine** | Deterministic Straight-Line and Declining Balance calculation with remainder-cent reconciliation. | Asset category metadata, custom warranty spec templates. |
| **Operational Linkage** | Clean-room architectural decoupling: loose foreign reference `physical_asset_ref` pointing to `gigalibs_cmms.assets` without cross-schema joins. | Deep links between `/finance` and `/cmms/assets`. |
| **Audit & Immutability** | Database triggers prohibiting modification or deletion of posted depreciation schedules and sealed disposal records. | Depreciation run notes, audit commentary, impairment justification tags. |

---

### 2. Fixed Assets Data Model (`gigalibs_finance`)

Extending the dedicated schema `gigalibs_finance` with RLS enforced on all tables:

1. **`fixed_asset_classes`**:
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `code VARCHAR(50) NOT NULL` (e.g. `BLD-01`, `MACH-01`, `IT-01`, `LAND-01`)
   - `name VARCHAR(200) NOT NULL`
   - `description TEXT`
   - `depreciation_method VARCHAR(30) NOT NULL DEFAULT 'STRAIGHT_LINE'` (`STRAIGHT_LINE`, `DECLINING_BALANCE`, `SUM_OF_YEARS_DIGITS`, `NO_DEPRECIATION`)
   - `default_useful_life_months INT NOT NULL CHECK (default_useful_life_months >= 0)`
   - `default_salvage_percentage INT NOT NULL DEFAULT 0 CHECK (default_salvage_percentage BETWEEN 0 AND 100)`
   - `asset_gl_account_id UUID NOT NULL REFERENCES chart_of_accounts(id)`
   - `depreciation_expense_gl_account_id UUID NOT NULL REFERENCES chart_of_accounts(id)`
   - `accumulated_depreciation_gl_account_id UUID NOT NULL REFERENCES chart_of_accounts(id)`
   - `disposal_gain_loss_gl_account_id UUID NOT NULL REFERENCES chart_of_accounts(id)`
   - `is_active BOOLEAN NOT NULL DEFAULT true`
   - `version INT NOT NULL DEFAULT 1`
   - `CONSTRAINT asset_classes_code_unique UNIQUE (tenant_id, code)`

2. **`fixed_assets`**:
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `asset_code VARCHAR(50) NOT NULL`
   - `asset_name VARCHAR(200) NOT NULL`
   - `description TEXT`
   - `asset_class_id UUID NOT NULL REFERENCES fixed_asset_classes(id)`
   - `status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'` (`DRAFT`, `CAPITALIZED`, `DEPRECIATING`, `FULLY_DEPRECIATED`, `DISPOSED`, `WRITTEN_OFF`)
   - `acquisition_date DATE NOT NULL`
   - `capitalization_date DATE`
   - `currency_code VARCHAR(3) NOT NULL DEFAULT 'USD'`
   - `acquisition_cost_minor BIGINT NOT NULL CHECK (acquisition_cost_minor >= 0)`
   - `salvage_value_minor BIGINT NOT NULL DEFAULT 0 CHECK (salvage_value_minor >= 0)`
   - `useful_life_months INT NOT NULL CHECK (useful_life_months >= 0)`
   - `depreciation_method VARCHAR(30) NOT NULL`
   - `convention VARCHAR(30) NOT NULL DEFAULT 'FULL_MONTH'` (`FULL_MONTH`, `HALF_YEAR`, `MID_MONTH`)
   - `current_book_value_minor BIGINT NOT NULL CHECK (current_book_value_minor >= 0)`
   - `accumulated_depreciation_minor BIGINT NOT NULL DEFAULT 0 CHECK (accumulated_depreciation_minor >= 0)`
   - `physical_asset_ref UUID` (loose link to `gigalibs_cmms.assets.id`)
   - `asset_tag VARCHAR(100)`
   - `serial_number VARCHAR(100)`
   - `org_unit_id VARCHAR(64)`
   - `place_id VARCHAR(64)`
   - `custodian_party_id UUID`
   - `version INT NOT NULL DEFAULT 1`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `CONSTRAINT fixed_assets_code_unique UNIQUE (tenant_id, asset_code)`

3. **`asset_depreciation_schedules`**:
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `asset_id UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE`
   - `fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id)`
   - `period_number INT NOT NULL`
   - `schedule_date DATE NOT NULL`
   - `depreciation_amount_minor BIGINT NOT NULL CHECK (depreciation_amount_minor >= 0)`
   - `accumulated_depreciation_minor BIGINT NOT NULL CHECK (accumulated_depreciation_minor >= 0)`
   - `book_value_minor BIGINT NOT NULL CHECK (book_value_minor >= 0)`
   - `status VARCHAR(20) NOT NULL DEFAULT 'PROJECTED'` (`PROJECTED`, `POSTED`, `REVERSED`)
   - `journal_entry_id UUID REFERENCES journal_entries(id)`
   - `version INT NOT NULL DEFAULT 1`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `CONSTRAINT depr_sched_asset_period_unique UNIQUE (tenant_id, asset_id, period_number)`

4. **`asset_depreciation_runs`**:
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `run_code VARCHAR(50) NOT NULL`
   - `fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id)`
   - `run_date DATE NOT NULL`
   - `total_depreciation_amount_minor BIGINT NOT NULL CHECK (total_depreciation_amount_minor >= 0)`
   - `asset_count INT NOT NULL CHECK (asset_count >= 0)`
   - `journal_entry_id UUID REFERENCES journal_entries(id)`
   - `status VARCHAR(20) NOT NULL DEFAULT 'POSTED'` (`DRAFT`, `POSTED`)
   - `notes TEXT`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `CONSTRAINT depr_run_code_unique UNIQUE (tenant_id, run_code)`

5. **`asset_disposals`**:
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `asset_id UUID NOT NULL REFERENCES fixed_assets(id)`
   - `disposal_date DATE NOT NULL`
   - `disposal_type VARCHAR(30) NOT NULL` (`SALE`, `SCRAP`, `WRITE_OFF`, `THEFT`)
   - `proceeds_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (proceeds_amount_minor >= 0)`
   - `net_book_value_minor BIGINT NOT NULL CHECK (net_book_value_minor >= 0)`
   - `gain_loss_amount_minor BIGINT NOT NULL` (positive = gain, negative = loss)
   - `clearing_bank_account_id UUID REFERENCES bank_accounts(id)`
   - `journal_entry_id UUID NOT NULL REFERENCES journal_entries(id)`
   - `notes TEXT`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

---

### 3. Depreciation Engine & Zero Floating-Point Arithmetic

All calculations strictly evaluate integer minor units (BigInt cents):

1. **Straight-Line Method:**
   $$\text{Depreciable Basis} = \text{Acquisition Cost} - \text{Salvage Value}$$
   $$\text{Monthly Base Amount} = \lfloor \frac{\text{Depreciable Basis}}{\text{Useful Life Months}} \rfloor$$
   $$\text{Remainder Cents} = \text{Depreciable Basis} - (\text{Monthly Base Amount} \times \text{Useful Life Months})$$
   - Periods $1$ through $\text{Useful Life Months} - 1$ receive $\text{Monthly Base Amount}$.
   - Period $\text{Useful Life Months}$ receives $\text{Monthly Base Amount} + \text{Remainder Cents}$.
   - Exact conservation invariant: $\sum_{m=1}^{N} \text{Depreciation}_m \equiv \text{Depreciable Basis}$.

2. **Declining Balance Method (200% Double-Declining):**
   $$\text{Annual Rate Numerator} = 2, \quad \text{Useful Life Years} = \lceil \frac{\text{Useful Life Months}}{12} \rceil$$
   $$\text{Monthly Rate} = \frac{2}{\text{Useful Life Months}}$$
   In each month $m$:
   $$\text{Calculated} = \lfloor \frac{\text{Current Book Value} \times 2}{\text{Useful Life Months}} \rfloor$$
   $$\text{Depreciation}_m = \min(\text{Calculated}, \text{Current Book Value} - \text{Salvage Value})$$
   - Book value cannot fall below Salvage Value.

---

### 4. Double-Entry Posting Invariants

All ledger impacts execute through the authoritative double-entry engine (`FinanceService.postJournal`):

1. **Periodic Depreciation Run:**
   - **Debit:** Depreciation Expense Account (`fixed_asset_classes.depreciation_expense_gl_account_id`)
   - **Credit:** Accumulated Depreciation Account (`fixed_asset_classes.accumulated_depreciation_gl_account_id`)
   - Invariant: $\text{Debit Total} \equiv \text{Credit Total}$.

2. **Asset Disposal / Retirement:**
   - **Debit:** Accumulated Depreciation (clearing total accumulated depreciation to zero)
   - **Debit:** Cash / Bank Clearing (for gross proceeds, if any)
   - **Credit:** Asset Cost Account (clearing original acquisition cost to zero)
   - **Balancing Balancing Line (Gain or Loss):**
     $$\text{Gain/Loss} = \text{Proceeds} - \text{Net Book Value}$$
     - If $\text{Gain/Loss} > 0$: **Credit** Gain on Asset Disposal (`fixed_asset_classes.disposal_gain_loss_gl_account_id`)
     - If $\text{Gain/Loss} < 0$: **Debit** Loss on Asset Disposal (`fixed_asset_classes.disposal_gain_loss_gl_account_id`)
   - Invariant: The asset cost and accumulated depreciation accounts are completely derecognized.

---

## Consequences

- Delivers complete Fixed Asset lifecycle management with zero floating-point arithmetic.
- Maintains architectural decoupling between physical EAM (`gigalibs_cmms`) and balance sheet finance (`gigalibs_finance`).
- Guarantees immutable audit trails and tamper-proof financial statement reporting.
