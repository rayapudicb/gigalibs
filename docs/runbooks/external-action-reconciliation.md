# External Action Adapters, Two-Phase Commits & Reconciliation Runbook

Owner: Integration Engineer + Solution Architecture  
Work item: WI-OI-014  
Standard: FR-09, NFR-SEC-001, NFR-REL-002, NFR-REL-003

## 1. Outbound Provider Adapter Architecture

1. **Idempotency Header:** All outbound write requests attach a deterministic `Idempotency-Key` header derived from the SHA-256 hash of `tenantId + actionId + payload`.
2. **Circuit Breakers:** If an external provider (e.g. Stripe, Quickbooks) returns 5 consecutive 5xx errors or connection timeouts (30s limit), the connector trips to `OPEN` circuit mode for 300 seconds.

## 2. High-Value Action Approval Gates

- Actions with financial impact exceeding $10,000 transition to `PENDING_APPROVAL`.
- The execution engine holds the workflow lease until an authorized manager or CFO role posts an approval signature via `POST /api/v1/actions/:id/approve`.

## 3. Automated Reconciliation

- Every 24 hours, the reconciliation worker fetches settled transaction dumps from external payment/accounting providers and executes an automated 3-way match against the local `Payment` and `Invoice` tables in PostgreSQL.
- Mismatched transactions are flagged as `DISCREPANCY` and routed to the operator exception inbox.
