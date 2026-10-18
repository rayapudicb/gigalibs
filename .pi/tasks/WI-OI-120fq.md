# WI-OI-120fq (F2.1 / E3 slice 1): Inventory receipt outbox → Finance inbox

- **Status:** Built (not committed; owner, 2026-10-18)
- **Work item:** WI-OI-120 (F2 / E3 in plan v3 §5A). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** L (slice 1: relay + inbox + costing handoff; E2 posting rules and reconciliation follow)

## Goal

When Inventory completes a receipt, `inventory.receipt.completed.v1` is relayed to Finance; Finance inbox
receipts the message once and drives costing/GL through existing `CostingService.ingestReceiptLayer` when a cost
profile exists for the product.

## Scope

- **May change:** `universal-inventory` relay; `financial-operations` inbox + subledger handler; compose env examples; tests.
- **Must not change:** CMMS; receipt completion stock logic; CMMS import/export.

## Done when

- [x] Inventory exposes `GET v1/health/relays` with finance relay state when configured (`InventoryFinanceOutboxRelay` + relay health controller).
- [x] Finance `POST internal/v1/inbox` accepts signed relay deliveries for `inventory.receipt.completed.v1` (`rawBody: true` on bootstrap).
- [x] Unit proof: duplicate message id → DUPLICATE, costing not called again (`inventory-inbox.test.ts`).
- [x] `pnpm --filter @gigalibs/universal-inventory-api` and finance API build and test pass (54 + 2 tests on 2026-10-18).
- [ ] Owner: relay keys on module-host (`generate-inventory-finance-relay-credentials.sh`), deploy, live receipt→Finance proof on UAT.
