# WI-OI-120gv: O2C allocate + fulfillment dispatch F0 actions

- **Status:** Built (2026-10-19; not on UAT)
- **Work item:** Table 1 row 7 — O2C metadata lifecycle on local compose.

## Goal

Operators can allocate inventory on a confirmed sales order and dispatch a fulfillment from metadata windows (issue-id for inventory proof).

## Done when

- [x] `allocate` on `orders-sales-orders` → `POST v1/orders/{id}/allocate`
- [x] `dispatch` on `orders-fulfillment-orders` → `POST v1/fulfillments/{id}/dispatch` with `issue-id`
- [x] Record adapter `run` handlers + unit test for allocate input mapping
- [x] `node scripts/generate-windows.mjs universal-orders --check` + `pnpm modules:catalog`
