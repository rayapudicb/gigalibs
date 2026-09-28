# WI-OI-020 — Enterprise Spend Management & AP Studio (Coupa / Ramp Standard)

Status: Review
Parent requirements: FR-02, FR-04, FR-09, FR-14, FR-15, FR-16, NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-OPS-001–004
Producer: SDLC Orchestrator coordinating Product, Finance, Architecture, Backend, Web, Data, Security, QA, SRE, Release, and Documentation roles
Independent reviewers: Finance/Domain, Solution Architecture, Security & Privacy, QA/SDET, Product
Current gate: G4 complete, transitioned to Review; ready for G5 release validation

Prioritization record: on 2026-09-04, repository owner authorized Enterprise Spend Management & AP Studio development (Coupa/Ramp standard: Budgets & Cost Centers, Expense & Corporate Card Ledger, Travel Desk & GSA Per-Diem, Imprest Multi-Wallets, SaaS Sprawl & Software Subscriptions, Spend Analytics) on Port 5180 with Port 3500 dedicated microservice and PostgreSQL 16 schema gigalibs_spend.

## Outcome

A multi-tenant, enterprise spend orchestration platform modeled after Coupa, Ramp Enterprise, and Brex Enterprise. Features departmental cost-center budget envelopes, corporate card expense itemization with receipt uploads and GL coding, GSA per-diem policy ceilings, multi-wallet petty cash imprest funds, SaaS subscription renewal management, and dynamic approval rule hierarchies.

## Product boundary

The module owns `cost_centers`, `expenses`, `expense_lines`, `travel_requests`, `imprest_wallets`, `imprest_transactions`, `saas_subscriptions`, `approval_rules`, `audit_events`, and `outbox_events` in the dedicated schema `gigalibs_spend`.
It integrates with Port 5180 unified UI via `/spend` and BFF `/api/spend/[...path]`.
Microservice runs independently on Port 3500.

## G4 Completeness Evidence

1. **PostgreSQL 16 Persistence & Multi-Tenancy Migrations**:
   - Schema `gigalibs_spend` with forward migrations applied and tracked on live PostgreSQL (Port 5440):
     - `000001_spend_foundation.up.sql`
     - `000002_spend_rls_and_ledger.up.sql`
   - Row-Level Security (RLS) enabled across all 10 tenant tables (`cost_centers`, `expenses`, `expense_lines`, `travel_requests`, `imprest_wallets`, `imprest_transactions`, `saas_subscriptions`, `approval_rules`, `audit_events`, `outbox_events`) with strict tenant isolation via `current_setting('app.tenant_id', true)`.
   - Action receipt column (`action_receipt`) added for tracking external settlement.

2. **Cost Center Budget Control & Overdraft Protection (SP-01)**:
   - Concurrent allocation locks (`FOR UPDATE`) in `withTenantTransaction`.
   - Committed budget reservation upon expense submission (`committed_budget_minor`).
   - Budget adjustments verified against obligated totals (`allocated >= committed + spent`).
   - Transition of committed to spent budget upon approval.

3. **Expense Itemization, Receipt Policy & Approvals (SP-02)**:
   - Line-item minor integer aggregation verification: ensures sum of line items strictly matches expense total.
   - Receipt policy enforcement: automatic violation flag and notes if expense >= $75.00 (7,500 minor units) lacks receipt attachment or URL.
   - Optimistic concurrency control (`version` check) preventing race conditions during approval.

4. **Durable Reimbursement Action Gateway & Outbox (SP-03)**:
   - Atomic state transition `APPROVED -> REIMBURSED` with `FOR UPDATE` lock.
   - Durable settlement action receipt generation with unique idempotency keys (`reimburse_${id}_...`).
   - Emits atomic outbox event (`spend.expense.reimbursed.v1`) and audit log for downstream Action Gateway/payroll disbursement.

5. **Imprest Petty Cash Lifecycle & Real Funding Proof (SP-05)**:
   - Wallets initialized with actual opening balance and initial funding vouchers instead of synthetic pre-funding.
   - Disbursement receipt attachment verification with policy threshold ($50.00).
   - Dynamic threshold monitoring: drops to `REPLENISHMENT_PENDING` and emits `spend.imprest.replenishment_needed.v1` outbox event when balance drops below threshold.

6. **Verification Evidence**:
   - Unit tests: 17/17 passing in `modules/spend-management` across 4 test suites.
   - Total workspace tests: 84 test files, 738 tests passing (734 TS + 4 Python, 100% pass rate).
   - Turbo monorepo build: 100/100 tasks successful.
   - All 6 SDLC static audits green (`status: "passed"`).
