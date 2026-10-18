# WI-OI-120fs (F2.3): Inventory receipt posting reconciliation (inbox summary)

- **Status:** Done in git (`1e54d17`; owner, 2026-10-18).
- **Work item:** WI-OI-120 (F2 / ADR-0033 D3 reconciliation). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Goal

Finance exposes a tenant-scoped summary of Inventory receipt posting inbox outcomes (processed, failed with codes,
stale processing) so operators can see posting gaps before period close.

## Scope

- **May change:** Finance `posting/` reconciliation helper; tests; verify script.
- **Must not change:** Inbox dedupe semantics; Inventory module.

## Done when

- [x] Summary query for `finance.inventory-subledger` + `inventory.receipt.completed.v1`.
- [x] Unit tests and `scripts/verify-inventory-finance-posting-reconciliation.mjs` (58 finance API tests pass).
- [ ] HTTP read API for tenant admins (optional follow-up); journal tie-out to `gl_journals` (F2.4).
