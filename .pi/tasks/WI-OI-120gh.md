# WI-OI-120gh: Procurement PO header — first metadata window

- **Status:** Built (2026-10-19, local; not on UAT)
- **Work item:** Table 1 row 6 (UI). Evidence in `.pi/work/TABLE-1-AUDIT-2026-10-19.md`.
- **Size:** M

## Goal

Replace hard-coded procurement PO screen with one dictionary-driven window (header create/read) on workflow UI.

## Scope

- **May change:** `modules/universal-procurement/dictionary`, workflow routes for proc.
- **Must not change:** Table 2 posting/receipt engines.

## Done when

- [x] Window published (`procurement-purchase-orders.window.json` via `dictionary/windows.mjs`)
- [x] UI renders from metadata (`UniversalProcurementWorkspace` + `/procurement` page from catalog)
- [x] Record dispatcher + create mapping test (`procurement-record-adapters.test.ts`)
- [ ] `pnpm verify` passes (full tree)

## Evidence

- `modules/universal-procurement/dictionary/windows.mjs` + generated window baseline
- `procurement-record-adapters.ts`, `app.module.ts` record controller
- `pnpm modules:catalog` + `node scripts/generate-windows.mjs --check universal-procurement`

## Stop and ask if

- F0 baseline missing shared field types.
