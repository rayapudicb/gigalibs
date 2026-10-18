# WI-OI-120fy (F1.3): Inventory receipt lifecycle graph on `@gigalibs/document-lifecycle`

- **Status:** Done in git (owner, 2026-10-18)
- **Work item:** WI-OI-120 (F1 / ADR-0033 D2). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** S

## Goal

Receipt **complete** uses the shared lifecycle runner with an explicit graph (DRAFT / EXPECTED / RECEIVING →
COMPLETED); stock movement, Finance posting status, and outbox behaviour unchanged.

## Done when

- [x] `receipt-lifecycle.ts` + unit tests.
- [x] `InventoryService.completeReceipt` delegates to the runner.
- [ ] Owner deploy not required for this slice.
