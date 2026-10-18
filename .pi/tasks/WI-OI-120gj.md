# WI-OI-120gj: Orders sales order header — first metadata window

- **Status:** Built (2026-10-19, `530c2597`; not on UAT)
- **Work item:** Table 1 row 7 (UI). Evidence in `.pi/work/TABLE-1-AUDIT-2026-10-19.md`.
- **Size:** M

## Goal

Replace the unavailable `/orders` placeholder with one dictionary-driven sales-order window (header create/read) on the workflow UI.

## Scope

- **May change:** `modules/universal-orders/dictionary`, orders API record routes, workflow `/orders` page.
- **Must not change:** Table 2 posting engines; mock maps/auth/comms edits.

## Done when

- [x] Window published (`orders-sales-orders.window.json` via `dictionary/windows.mjs`)
- [x] UI renders from metadata (`UniversalOrderWorkspace` + `/orders` from catalog)
- [x] Record dispatcher + create mapping test (`orders-record-adapters.test.ts`)
- [ ] `pnpm verify` passes (full tree)

## Evidence

- `modules/universal-orders/dictionary/windows.mjs` + generated window baseline
- `orders-record-adapters.ts`, `app.module.ts` record controller
- `pnpm modules:catalog` + `node scripts/generate-windows.mjs --check universal-orders`

## Stop and ask if

- F0 baseline missing shared field types.
