# WI-OI-022 — Enterprise MultiCurrency & Global Treasury Foundation Engine

Status: Review
Parent requirements: FR-02, FR-04, FR-06, FR-12, FR-16, NFR-FIN-001–004, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-OPS-001–004
Producer: SDLC Orchestrator coordinating Product, Finance, Architecture, Backend, Web, Data, Security, QA, SRE, Release, and Documentation roles
Independent reviewers: Finance/Domain, Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 first vertical slice; no G5/G6 certification or release authorization

Prioritization record: on 2026-09-05, repository owner authorized Enterprise MultiCurrency & Global Treasury Foundation Engine development (Real-Time Central Bank FX Feeds, Cross-Currency Settlement Engine with ACID Ledger, Forward Hedging Derivatives, GAAP ASC 830 / IAS 21 Balance Sheet Revaluation, and Global Localization Framework across all modules including Universal Data Studio, Accounts Receivable, and Spend Management) on Port 5180 with Port 3700 dedicated microservice and PostgreSQL 16 schema gigalibs_currency.

## Outcome

A multi-tenant, enterprise currency orchestration and internationalization platform. Features institutional exchange rate matrices, cross-currency settlements with ACID idempotency, treasury hedging forward contracts, foreign currency financial statement translation, and a platform-wide localization provider enabling any module to dynamically present data in any tenant's target currency and language locale.

## 2026-09-12 evidence correction

The module is accessible for local UAT, but the outcome above is not production-certified. Tenant setup
previously inserted hard-coded exchange rates labeled as central-bank data. That behavior and its
attributable local records were removed. Setup now persists tenant currency preferences only, and
conversion requires both a caller-owned idempotency key and an already persisted rate. The local UAT tenant
therefore has zero rates and zero conversions until an authoritative, versioned rate import/provider is
implemented.

Focused tests prove setup cannot insert `currency_pairs` and conversion rejects a missing idempotency key
before reading rates or writing the ledger. Live evidence proves repeated setup leaves rates and ledger
counts at `0 → 0`. Rate ingestion provenance, freshness/expiry, correction policy, hedging execution,
revaluation approval, outbox/reconciliation, PostgreSQL 16 rehearsal and independent Finance/Security/QA
acceptance remain open. Current gate remains G4 Review / No-Go.

## Product boundary

The module owns `currency_pairs`, `rate_history`, `conversion_ledger`, `hedging_contracts`, `tenant_currency_preferences`, `audit_events`, and `outbox_events` in the dedicated schema `gigalibs_currency`.
It integrates with Port 5180 unified UI via `/currency` and BFF `/api/currency/[...path]`.
Microservice runs independently on Port 3700.
Shared `CurrencyLocaleContext` provides cross-module localization across all present and future modules.
