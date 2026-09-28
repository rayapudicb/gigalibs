# Accounts Receivable Delta-5 Platform Foundation Adoption Design

- **Status:** Approved Architecture Specification
- **Work Item:** WI-OI-053
- **Target Module:** `modules/accounts-receivable` (FR-01, FR-02)
- **Deployment Profile:** `configuration-local-development-v1`
- **Authors:** Solution Architecture, Financial Systems / Backend Domain, Security & Privacy, QA/SDET
- **Date:** 2026-09-25

---

## 1. Executive Summary & Intent

Accounts Receivable (AR) is GigaLibs' core financial and revenue engine (FR-01 Invoicing & Recurring Billing, FR-02 Payments, Collections & Cash Application). Under the value-first release directive, AR is the primary business adopter of the converged platform foundations established in **ADR-0005 (Delta-5)**.

This specification details the technical alignment of AR with:
1. **Durable Ledger & Audit Seals (`AuditEvidenceV1`):** Cryptographic SHA-256 invoice seal chains with fail-closed verification (`VALID`, `UNSEALED`, `INVALID`, `INCOMPLETE`).
2. **Schema-Aware Financial Redaction:** Automatic sanitization of credit card details, payment tokens, CVVs, and bank account numbers prior to audit and event persistence.
3. **Transactional Inbox / Webhook Deduplication:** Idempotent processing of inbound Stripe and Adyen payment webhooks, eliminating double-credit and replay risks.
4. **Workload Class Partitioning:** Bounded concurrency classification (`INTERACTIVE` vs `BACKGROUND_WORKER`) to protect the financial ledger from connection starvation.

---

## 2. Architectural Components & Invariants

### 2.1 Cryptographic Invoice Ledger Seals
In migration `000003_ar_ledger_seals_and_installments.up.sql`, columns `seal_hash`, `previous_seal_hash`, and `seal_sequence` were allocated in `gigalibs_ar.invoices`. 
Delta-5 connects these columns to active cryptographic hashing:
- **Genesis Hash:** `0000000000000000000000000000000000000000000000000000000000000000`
- **Canonical Payload Digest:** The invoice financial core (`tenantId`, `invoiceNumber`, `currency`, `subtotalMinor`, `taxMinor`, `totalMinor`, `issuedAt`) is canonically JSON-serialized and hashed with the previous record's `seal_hash`.
- **Unique Sequence Constraint:** `(tenant_id, seal_sequence)` ensures an unbroken, gap-free, non-forking ledger sequence per tenant.
- **Fail-Closed Ledger Verification:** An authoritative `verifyInvoiceLedgerChain` function validates contiguous sequences and hash integrity, returning `VALID`, `INVALID`, `INCOMPLETE`, or `UNSEALED`.

### 2.2 Schema-Aware Financial Redaction
Financial transactions often handle sensitive tokens and payment instruments.
Before writing to `gigalibs_ar.audit_events` or emitting domain events:
- Inbound payloads are passed through schema-aware redaction.
- Keys such as `cardNumber`, `cvv`, `clientSecret`, `apiKey`, `bankAccount`, `routingNumber`, and `token` are masked as `[REDACTED]`.
- Redacted field paths are tracked explicitly in metadata (`redactedFields`).

### 2.3 Transactional Webhook Inbox (Stripe & Adyen)
Payment webhooks are asynchronous and prone to duplicate delivery and network replays:
- Inbound webhooks are recorded in `gigalibs_ar.payment_webhook_events` with unique key `(tenant_id, provider, event_id)`.
- Replayed webhooks transition immediately to `PROCESSED` with `replayed: true` without invoking financial side-effects (no duplicate payment allocation or credit notes).
- Failed webhooks record structured error classifications and allow bounded replay.

### 2.4 Workload Admission & Pooling
- **Interactive Operations (`INTERACTIVE`):**
  - Invoice issuance, customer retrieval, checkout session generation, payment recording.
- **Background Operations (`BACKGROUND_WORKER`):**
  - Statement generation, aged debt recalculation, bulk PDF rendering.
- Rejection of `SUSPENDED` tenants at the admission boundary before financial queries execute.

---

## 3. Verification Matrix (WI-OI-053 Baseline)

| Test ID | Scenario | Target Component | Success Criteria |
|---|---|---|---|
| **AR-D5-01** | Invoice Issuance Cryptographic Sealing | `InvoicesService` | Generates contiguous `seal_sequence` and `seal_hash` linked to `previous_seal_hash`. |
| **AR-D5-02** | Ledger Chain Verification (VALID) | Ledger Verifier | Unbroken chain of issued invoices returns state `VALID` with verified count. |
| **AR-D5-03** | Ledger Tamper Detection (INVALID) | Ledger Verifier | Modifying `total_minor` or invoice payload returns fail-closed `INVALID` state. |
| **AR-D5-04** | Ledger Gap Detection (INCOMPLETE) | Ledger Verifier | Skipping a sequence number returns fail-closed `INCOMPLETE` state. |
| **AR-D5-05** | Sensitive Financial Redaction | Audit Logger | Credit card tokens, CVV, and secrets are sanitized to `[REDACTED]`. |
| **AR-D5-06** | Webhook Idempotency (DEDUPLICATED) | `WebhooksController` / `PaymentsService` | Replay of Stripe/Adyen event returns `PROCESSED (replayed)` without duplicate payment rows. |
| **AR-D5-07** | Workload Admission Classification | AR Admission Gate | Suspended tenants rejected; interactive vs background workloads classified. |

---

## 4. Governance & Constraints
- All 7 CMMS protected file hashes must remain completely untouched.
- All 6 SDLC audits must remain 100% green.
- Single-module WIP limit strictly respected (`activeImplementationWorkItems: ["WI-OI-053"]`).
