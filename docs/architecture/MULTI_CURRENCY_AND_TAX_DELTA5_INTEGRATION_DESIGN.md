# Architecture Design: Multi-Currency & Tax Configuration Foundation Adoption

## Document Metadata
- **Work Item:** `WI-OI-057`
- **Modules:** `modules/multi-currency` (`@gigalibs/currency-api`), `modules/tax-configuration` (`@gigalibs/tax-api`)
- **Blueprint References:** `FR-03` (Multi-Currency & FX Engine), `FR-04` (Tax Determination & Compliance), `TP-3` (Transactional Inbox), `TP-5` (Cryptographic Ledger Sealing)
- **Status:** Approved for Implementation (Gate G3)
- **Author:** Solution Architecture / Financial Systems / Security & Privacy / QA/SDET

---

## 1. Context & Business Drivers

The financial pipeline of GigaLibs requires deterministic, auditable, and tamper-evident conversion and tax calculation primitives. Under the Delta-5 platform baseline:
1. **Multi-Currency Conversion Ledger Hardening:**
   - Every FX conversion recorded in `gigalibs_currency.conversion_ledger` must be cryptographically sealed with monotonic sequence numbers and SHA-256 hash chains (`seal_hash`, `previous_seal_hash`, `seal_sequence`).
   - Fail-closed verification API (`VALID`, `UNSEALED`, `INVALID`, `INCOMPLETE`) to detect tampering with applied rates or conversion amounts.
   - Transactional inbox deduplication (`gigalibs_currency.inbox_events`) to absorb upstream market rate updates idempotently.
2. **Tax Calculation Ledger Hardening:**
   - Every tax determination recorded in `gigalibs_tax.tax_calculation_ledger` must be cryptographically sealed with hash chains (`seal_hash`, `previous_seal_hash`, `seal_sequence`).
   - Fail-closed verification API to detect tax rate tampering or calculation modifications.
   - Transactional inbox deduplication (`gigalibs_tax.inbox_events`) to handle tax rule events idempotently.
3. **Data Redaction & Audit Safety:**
   - Recursive masking of banking details, tokens, and PII before persistence in ledger audit logs or inbox records.

---

## 2. Technical Architecture & Component Design

```
                      [ Financial Events / Webhooks ]
                                     │
                ┌────────────────────┴────────────────────┐
                ▼                                         ▼
   ┌─────────────────────────┐               ┌─────────────────────────┐
   │  CurrencyInboxService   │               │     TaxInboxService     │
   │  (gigalibs_currency)    │               │     (gigalibs_tax)      │
   └────────────┬────────────┘               └────────────┬────────────┘
                ▼                                         ▼
   ┌─────────────────────────┐               ┌─────────────────────────┐
   │    ConversionService    │               │  CalculateTaxService    │
   │  - Sensitive Redaction  │               │  - Sensitive Redaction  │
   │  - FX Math Calculation │               │  - Tax Rule Execution   │
   └────────────┬────────────┘               └────────────┬────────────┘
                ▼                                         ▼
   ┌─────────────────────────┐               ┌─────────────────────────┐
   │conversion-ledger-seal.ts│               │   tax-ledger-seal.ts    │
   │(SHA-256 Ledger Sealing) │               │(SHA-256 Ledger Sealing) │
   └────────────┬────────────┘               └────────────┬────────────┘
                ▼                                         ▼
   ┌─────────────────────────┐               ┌─────────────────────────┐
   │  conversion_ledger RLS  │               │tax_calculation_ledgerRLS│
   └─────────────────────────┘               └─────────────────────────┘
```

### 2.1 Database Migrations
1. **Multi-Currency Migration (`000003_currency_ledger_seals_and_inbox.up.sql`):**
   - Add `seal_hash`, `previous_seal_hash`, `seal_sequence` to `gigalibs_currency.conversion_ledger`.
   - Unique index `curr_ledger_tenant_seal_sequence_idx` on `(tenant_id, seal_sequence) WHERE seal_sequence IS NOT NULL`.
   - Table `gigalibs_currency.inbox_events` with RLS and unique constraint `(tenant_id, source, event_id)`.
2. **Tax Configuration Migration (`000003_tax_ledger_seals_and_inbox.up.sql`):**
   - Add `seal_hash`, `previous_seal_hash`, `seal_sequence` to `gigalibs_tax.tax_calculation_ledger`.
   - Unique index `tax_ledger_tenant_seal_sequence_idx` on `(tenant_id, seal_sequence) WHERE seal_sequence IS NOT NULL`.
   - Table `gigalibs_tax.inbox_events` with RLS and unique constraint `(tenant_id, source, event_id)`.

### 2.2 Ledger Sealing Algorithms
- **FX Conversion Seal:** Computes deterministic SHA-256 hash over `tenantId`, `sequence`, `conversionId`, `sourceModule`, `documentId`, `fromCurrency`, `toCurrency`, `sourceAmountMinor`, `convertedAmountMinor`, `appliedRateMicros`, `timestamp`, `previousSealHash`.
- **Tax Calculation Seal:** Computes deterministic SHA-256 hash over `tenantId`, `sequence`, `calculationId`, `sourceModule`, `documentId`, `jurisdictionCode`, `taxableAmountMinor`, `calculatedTaxMinor`, `appliedRateBasisPoints`, `timestamp`, `previousSealHash`.

---

## 3. Governance & Quality Gates
- Preserve all 7 CMMS protected file hashes unchanged.
- Ensure all 6 SDLC repository audits remain green.
- Deliver 100% test pass rate with zero mock data in production runtime surfaces.
