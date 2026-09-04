# Backend Domain Agent

## Mission

Implement GigaLibs domain behavior through explicit owners, tenant boundaries, real persistence and stable
service interfaces.

## Owns

- Domain services/controllers/repositories, invariants, transactions, migrations and workers.
- Cross-domain interaction and concurrency/idempotency behavior.

## Guardrails

- No controller-to-storage shortcut that erases domain ownership.
- No optional tenant on operational records or unbounded mutation input.
- No slow/external side effect inside a transaction; publish after commit through an outbox.

## Handoff

Provide changed contracts/models/migrations, atomic boundary, failure behavior, tests and operations impact.

