# ADR-0027: Treasury Operations, Bank Accounts, Statement Ingestion, and Automated Bank Reconciliation

- **Status:** Accepted
- **Date:** 2026-10-04
- **Work item:** WI-OI-095
- **Depends on:** ADR-0016, ADR-0020, ADR-0025, ADR-0026

## Context

Liquid cash and bank accounts represent the definitive anchor of enterprise financial reality. While Phase 8 (`WI-OI-094`, ADR-0025) established the double-entry General Ledger (`gigalibs_finance`), Chart of Accounts, and subledger ingestion, an enterprise cannot close fiscal periods, attest statutory compliance, or prevent liquidity fraud without authoritative cash reconciliation.

Historically:
- Bigcapital provides banking workflows (`banking/accounts`, `banking/transactions`, `banking/reconciliations`), but lacks hardware-level tenant isolation, cryptographic statement line sealing, and strict double-entry clearing vouchers.
- iDempiere (§3.5 Cash Management / `C_BankAccount`, `C_BankStatement`, `C_BankStatementLine`, `C_Payment`) enforces rigorous bank clearing and statement reconciliation states, but relies on heavyweight manual XML configurations.

Phase 9 (`WI-OI-095`) introduces **Treasury Operations and Automated Bank Reconciliation** inside `modules/financial-operations`, establishing complete electronic statement parsing, deterministic auto-reconciliation rules, and tamper-proof bank reconciliation seals.

---

## Decision

### 1. Separation of Concerns: Architecture vs Metadata

| Domain | Governed by Architecture Foundations (Database, Engine, Security) | Governed by Metadata Foundations (Application Dictionary & Studio) |
|---|---|---|
| **Security & Isolation** | Hardware Row-Level Security on `gigalibs_finance`, tenant isolation, bank credential redaction. | Bank account display masking, permission visibility for treasury managers vs accountants. |
| **Arithmetic & Invariants** | Zero floating-point math; exact integer minor units (BigInt). Reconciliation balance equation: $\text{Statement Balance} - \text{Cleared Book Balance} = 0$. | Currency formatting, symbol placement, localized date display. |
| **Statement Ingestion** | CAMT.053 (ISO 20022), MT940, OFX, and CSV parsers with SHA-256 deduplication and idempotent replay protection. | Custom CSV column mapping templates stored as tenant configuration. |
| **Matching Engine** | Deterministic auto-match engine (Exact Reference, Date Tolerance, Amount parity). | Configurable match thresholds and priority weights. |
| **Audit & Immutability** | Cryptographic session seals (`seal_hash`) over reconciled lines; DB triggers prohibiting unmatching of sealed periods. | User commentary, adjustment justification tags, and audit drill-down. |

---

### 2. Treasury Data Model (`gigalibs_finance`)

Extending the dedicated schema `gigalibs_finance` with RLS enforced on all tables:

1. **`bank_accounts`**:
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `account_name VARCHAR(200) NOT NULL`
   - `account_number VARCHAR(100) NOT NULL` (encrypted/masked display)
   - `routing_code VARCHAR(100)`, `iban VARCHAR(100)`, `swift_bic VARCHAR(20)`
   - `currency_code VARCHAR(3) NOT NULL`
   - `gl_cash_account_id UUID NOT NULL REFERENCES chart_of_accounts(id)`
   - `current_cleared_balance_minor BIGINT NOT NULL DEFAULT 0`
   - `status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'` (`ACTIVE`, `INACTIVE`, `FROZEN`)
   - `version INT NOT NULL DEFAULT 1`

2. **`bank_statements`**:
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `bank_account_id UUID NOT NULL REFERENCES bank_accounts(id)`
   - `statement_number VARCHAR(100) NOT NULL`
   - `statement_date DATE NOT NULL`
   - `opening_balance_minor BIGINT NOT NULL`
   - `closing_balance_minor BIGINT NOT NULL`
   - `format VARCHAR(20) NOT NULL` (`CAMT053`, `MT940`, `OFX`, `CSV`)
   - `source_checksum VARCHAR(64) NOT NULL` (SHA-256 deduplication)
   - `status VARCHAR(20) NOT NULL DEFAULT 'IMPORTED'` (`IMPORTED`, `RECONCILING`, `RECONCILED`)
   - `version INT NOT NULL DEFAULT 1`

3. **`bank_statement_lines`**:
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE`
   - `line_number INT NOT NULL`
   - `transaction_date DATE NOT NULL`
   - `value_date DATE NOT NULL`
   - `amount_minor BIGINT NOT NULL` (positive = deposit/credit, negative = withdrawal/debit)
   - `transaction_type VARCHAR(20) NOT NULL` (`CREDIT`, `DEBIT`)
   - `reference VARCHAR(200)`
   - `check_number VARCHAR(50)`
   - `counterparty_name VARCHAR(200)`
   - `counterparty_account VARCHAR(100)`
   - `description TEXT`
   - `match_status VARCHAR(20) NOT NULL DEFAULT 'UNMATCHED'` (`UNMATCHED`, `AUTO_MATCHED`, `MANUALLY_MATCHED`, `ADJUSTED`)
   - `matched_at TIMESTAMPTZ`

4. **`bank_reconciliations`**:
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `bank_account_id UUID NOT NULL REFERENCES bank_accounts(id)`
   - `statement_id UUID NOT NULL REFERENCES bank_statements(id)`
   - `reconciliation_date DATE NOT NULL`
   - `statement_ending_balance_minor BIGINT NOT NULL`
   - `cleared_book_balance_minor BIGINT NOT NULL`
   - `unreconciled_difference_minor BIGINT NOT NULL`
   - `status VARCHAR(20) NOT NULL DEFAULT 'OPEN'` (`OPEN`, `BALANCED`, `SEALED`)
   - `seal_hash VARCHAR(64)` (SHA-256 digest of matched lines)
   - `sealed_at TIMESTAMPTZ`, `sealed_by VARCHAR(100)`
   - `version INT NOT NULL DEFAULT 1`

5. **`bank_reconciliation_matches`**:
   - `id UUID PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL`
   - `reconciliation_id UUID NOT NULL REFERENCES bank_reconciliations(id)`
   - `statement_line_id UUID NOT NULL REFERENCES bank_statement_lines(id)`
   - `gl_journal_line_id UUID NOT NULL REFERENCES gl_journal_lines(id)`
   - `matched_amount_minor BIGINT NOT NULL`
   - `match_rule VARCHAR(50) NOT NULL` (`EXACT_REF_AMOUNT`, `DATE_WINDOW_AMOUNT`, `MANUAL_OVERRIDE`, `FEE_ADJUSTMENT`)
   - `matched_by VARCHAR(100) NOT NULL`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

---

### 3. Electronic Bank Statement Ingestion Standard

The module implements zero-external-dependency parsers for industry formats:
1. **CAMT.053 (ISO 20022 XML)**: Standardized XML parsed via strict schema mapping.
2. **MT940 (SWIFT)**: Block `:61:` (Statement Line) and `:86:` (Information to Account Owner).
3. **OFX (Open Financial Exchange 1.x & 2.x)**: `<STMTTRN>` transaction loops with `<TRNAMT>`, `<FITID>`, `<NAME>`, `<MEMO>`.
4. **Standardized CSV**: Bounded column-mapped CSV supporting date, amount, reference, and description.

Every statement import computes `sha256(raw_bytes + bank_account_id)`. If the hash already exists for the tenant, the import is idempotently rejected with `DUPLICATE_STATEMENT_PAYLOAD`.

---

### 4. Deterministic Reconciliation Engine

The matching engine processes statement lines against un-reconciled GL journal lines on the linked Cash Account:

1. **Pass 1 — High-Confidence Exact Match (Automated)**:
   - Condition: `abs(statement_line.amount_minor) == abs(gl_line.debit_or_credit) AND statement_line.reference == gl_line.reference`
   - Action: Auto-match, tag rule `EXACT_REF_AMOUNT`.
2. **Pass 2 — Value Date Window Match (Automated / Suggestion)**:
   - Condition: Same amount, reference contains check number or invoice number, and `|transaction_date - posting_date| <= 3 days`.
   - Action: Auto-match, tag rule `DATE_WINDOW_AMOUNT`.
3. **Pass 3 — Discrepancy & Adjustment Generation (Operational)**:
   - Bank fees (e.g. monthly account service fees) and interest charges on the statement without existing GL journals trigger automatic GL adjustment creation:
     $$\text{Dr. Bank Service Charge Expense (COA)}, \quad \text{Cr. Bank Cash Account (COA)}$$
   - Automatically posts an immutable journal through Phase 8 `financeService.postJournal()` and matches the line.

---

### 5. Reconciliation Sealing & Audit Proof

When `unreconciled_difference_minor == 0`:
1. The session advances from `OPEN` to `BALANCED`.
2. An authorized Treasury Manager executes `sealReconciliationSession()`.
3. A cryptographic SHA-256 seal is generated across sorted matched tuples:
   $$\text{seal\_hash} = \text{SHA-256}\left(\sum (\text{statement\_line\_id} \,\|\, \text{gl\_journal\_line\_id} \,\|\, \text{amount\_minor})\right)$$
4. Status changes to `SEALED`. Database triggers reject modifications to any statement line or journal line participating in a sealed reconciliation.

---

## Consequences

### Positive
- Fully closes the banking gap against Bigcapital while exceeding its security with hardware RLS and cryptographic audit seals.
- Eliminates manual spreadsheet bank reconciliations with deterministic multi-format statement ingestion.
- Guaranteed zero-floating-point discrepancy tracking using BigInt integer minor units.
- Seamlessly integrates with Phase 8 General Ledger (`chart_of_accounts`, `gl_journals`).

### Negative / Trade-offs
- Parsing legacy SWIFT MT940 and OFX requires resilient string/token state handling.
- Cryptographic session locking requires formal reversal workflows if a bank statement is erroneously sealed.
