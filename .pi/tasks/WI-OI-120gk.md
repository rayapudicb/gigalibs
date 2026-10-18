# WI-OI-120gk: Orders sales quote header — second metadata window

- **Status:** Built (2026-10-19, `6e9cb4bd`; not on UAT)
- **Work item:** Table 1 row 7 (O2C UI). Follows WI-OI-120gj.
- **Size:** M

## Goal

Add dictionary-driven sales quotations (create/read) on `/orders` alongside sales orders.

## Done when

- [x] Window `orders-sales-quotes` published via `dictionary/windows.mjs`
- [x] Record dispatcher + quote mapping test
- [x] Workspace tabs: quotes | orders

## Evidence

- `pnpm modules:catalog`, `node scripts/generate-windows.mjs --check universal-orders`
- `@gigalibs/universal-orders-api` tests
