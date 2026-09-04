# WI-OI-014 — External action adapters, two-phase commits, and reconciliation slice

Status: Review  
Parent requirements: FR-09, NFR-SEC-001, NFR-REL-002, NFR-REL-003  
Producer: Integration Engineer + Solution Architecture  
Independent reviewers: Security & Privacy, Finance / Domain Expert, QA Spec  
Gate: G2–G5

## Outcome

Resilient outbound external action framework that separates write operations from read queries,
enforces approval gates for high-value external side-effects (e.g. wire payments > $10,000), records cryptographic receipts, and runs automated reconciliation.

## Scope

- Outbound provider adapters (Stripe, Twilio, SendGrid, Quickbooks, AWS S3) with explicit timeouts (30s) and exponential retry policies.
- Two-phase external writes (Prepare ➔ Approve ➔ Commit).
- Immutable receipt persistence for every external API call (response status, payload hash, latency, provider transaction ID).
- Automated daily reconciliation comparing local ledger actions against remote provider transaction dumps.

## Acceptance Criteria

1. Outbound requests automatically attach idempotency headers (`Idempotency-Key: <sha256>`).
2. High-value actions (> $10k) transition to `PENDING_APPROVAL` until approved by authorized role.
3. Network failures or 5xx provider responses trigger circuit breaker without dropping the source event.
4. All machine governance audits pass cleanly.
