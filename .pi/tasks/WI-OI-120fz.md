# WI-OI-120fz (F1.4): Finance period-lock guard on Inventory receipt complete

- **Status:** Done in git (uncommitted; owner, 2026-10-18)
- **Work item:** WI-OI-120 (F1 / ADR-0033 D2, audit P1-07). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Goal

Before a receipt **complete** posts stock and emits `inventory.receipt.completed.v1`, refuse the transition when
Finance’s primary-book fiscal period for the posting date is **LOCKED** (same rule as Finance inbox posting).

## Done when

- [x] Shared `resolvePrimaryBookPostingContext` in `@gigalibs/posting-rules`.
- [x] Inventory lifecycle guard when `FINANCE_PERIOD_LOCK_DATABASE_URL` or `FINANCIAL_OPERATIONS_DATABASE_URL` is set.
- [x] Unit tests wired in `verify-inventory-finance-relay.mjs`.
- [ ] Owner: set `FINANCE_PERIOD_LOCK_DATABASE_URL` on module-host Inventory slice (= Finance runtime DSN) on UAT deploy.
