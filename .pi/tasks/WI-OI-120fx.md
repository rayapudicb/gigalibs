# WI-OI-120fx (F2.8): Block period close on Inventory posting gaps

- **Status:** Done in git (owner, 2026-10-18)
- **Work item:** WI-OI-120 (F2 / ADR-0033 D3). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Goal

Fiscal period soft-close/lock and Inventory subledger hard lock refuse to proceed while Inventory receipt
posting reconciliation is not balanced (failed inbox, stale processing, or missing journals).

## Done when

- [x] Guard on `updatePeriodStatus` → `SOFT_CLOSED` / `LOCKED`.
- [x] Guard on Inventory subledger `HARD_LOCKED` / `SOFT_LOCKED`.
- [x] Guard on `executeYearEndClose` before fiscal periods are locked.
- [x] Unit tests; included in `verify-inventory-finance-posting-reconciliation.mjs`.
