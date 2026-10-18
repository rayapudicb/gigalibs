# WI-OI-120fu (F2.6): Daily Inventory receipt posting reconciliation job

- **Status:** Done in git (owner, 2026-10-18; commit pending tag in NOW). UAT deploy + Finance migration **11** still open.
- **Work item:** WI-OI-120 (F2 / ADR-0033 D3). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Goal

Finance runs a scheduled sweep that compares Inventory receipt inbox state with posted journals per tenant and
records an audit event when gaps remain (failed inbox, stale processing, or missing journals).

## Scope

- **May change:** Finance migration 000011, reconciliation job service, definer tenant list, tests, env knobs.
- **Must not change:** Inventory receipt completion or relay envelope shape.

## Done when

- [x] `list_inventory_receipt_posting_reconciliation_tenants` SECURITY DEFINER function.
- [x] `InventoryReceiptPostingReconciliationJob` on a configurable interval (default 24h).
- [x] `RECONCILIATION_GAP` audit rows when `balanced` is false.
- [x] Unit tests; `scripts/verify-inventory-finance-posting-reconciliation.mjs` includes job tests.
- [x] Finance schema contract / migration version **11**.
