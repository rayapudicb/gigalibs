# WI-OI-021 — Enterprise Tax Nexus & Multi-Jurisdiction Engine

Status: Review
Parent requirements: FR-02, FR-04, FR-06, FR-14, FR-16, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-OPS-001–004
Producer: SDLC Orchestrator coordinating Product, Finance, Architecture, Backend, Web, Data, Security, QA, SRE, Release, and Documentation roles
Independent reviewers: Finance/Domain, Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 local UAT vertical slice implemented and evidenced; no G5/G6 certification or release authorization

Prioritization record: on 2026-09-05, repository owner authorized Enterprise Tax Nexus & Multi-Jurisdiction Engine development (Nexus Jurisdictions, SST & EU VAT matrix, Exemption Certificates with FAR 52.229-3, Real-Time Calculation Ledger with Idempotency, and Statutory Threshold Monitoring) on Port 5180 with Port 3600 dedicated microservice and PostgreSQL 16 schema gigalibs_tax.

## Outcome

A multi-tenant, enterprise tax orchestration platform modeled after Avalara and Vertex Enterprise. Features nexus jurisdiction envelopes, sales tax & VAT rate matrices, exemption certificate lifecycles, real-time quotation and calculation ledger with ACID idempotency, and statutory revenue/transaction threshold tracking.

## Product boundary

The module owns `tax_jurisdictions`, `tax_rates`, `exemption_certificates`, `tax_calculation_ledger`, `audit_events`, and `outbox_events` in the dedicated schema `gigalibs_tax`.
It integrates with Port 5180 unified UI via `/tax` and BFF `/api/tax/[...path]`.
Microservice runs independently on Port 3600.

## 2026-09-11 implementation evidence

- `/tax` is an actionable suite workbench for tenant setup, jurisdictions, rates, exemptions,
  calculation ledger and nexus monitoring.
- Verified OIDC identity and permissions replace caller-selected tenant headers.
- Migration `000002_tax_authority_hardening.up.sql` installs module tenant bindings, composite tenant
  constraints, forced RLS, domain checks and scoped idempotency request hashes.
- Business commands use tenant transactions with audit and outbox evidence; new certificates require an
  explicit verification action; unknown jurisdictions are rejected.
- Real local API and browser evidence:
  `docs/audits/2026-09-09-readiness/evidence/uat/tax-actionable-result.json` and
  `docs/audits/2026-09-09-readiness/evidence/uat/tax-actionable-workbench.png`.

Release remains No-Go. Statutory source/version lineage, lifecycle/revocation, production federation,
dedicated database runtime identity, concurrency and outbox recovery, PostgreSQL backup/restore/load,
accessibility and independent Finance/Security/QA/Product approval remain open.
