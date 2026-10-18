# WI-OI-120gh: Procurement PO header — first metadata window

- **Status:** Proposed
- **Work item:** Table 1 row 6 (UI). Evidence in `.pi/work/TABLE-1-AUDIT-2026-10-19.md`.
- **Size:** M

## Goal

Replace hard-coded procurement PO screen with one dictionary-driven window (header create/read) on workflow UI.

## Scope

- **May change:** `modules/universal-procurement/dictionary`, workflow routes for proc.
- **Must not change:** Table 2 posting/receipt engines.

## Done when

- [ ] Window published; UI renders from metadata; test covers create
- [ ] `pnpm verify` passes

## Stop and ask if

- F0 baseline missing shared field types.
