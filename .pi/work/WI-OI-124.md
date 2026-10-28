# WI-OI-124: Material and Warehouse Ledger (Module 2)

- **Item ID:** `WI-OI-124`
- **Status:** In Progress (2026-10-28)
- **Builds on:** `modules/universal-inventory` (WI-OI-091 foundation: migrations 000001–000009, ledger, balances, reservations)

## Gap vs parity plan (initial)

| Plan concept | Current mapping |
|---|---|
| Locators / bins | `locations` (aisle/rack/shelf/bin) |
| Storage on hand | `stock_balances` + generated `available_quantity` |
| Immutable transactions | `stock_ledger_transactions` / entries |
| Lot/serial | `inventory_lots`, serial fields on balances |
| `inventory.atp.check` | **Added** `POST v1/atp/check` + handshake schemas |
| `inventory.reserve/release` | Existing `POST v1/reservations` + `.../release` |
| Cost records / valuation layers | Partial (Finance relay migrations); full costing TBD |
| Warehouse map / scanner UI slices | Existing workspace; parity-specific windows TBD |

## Evidence log

| Date | Slice | Evidence |
|---|---|---|
| 2026-10-28 | S2 ATP | Pure `calculateAtp` (`atp.ts` + unit tests); `InventoryAtpCheckRequestV1` / `ResponseV1` contracts; `InventoryService.checkAtp`; gateway route in `module.yaml`; `workItem` → WI-OI-124 |
| 2026-10-28 | S2 reserve/release | `InventoryReserveRelease*` contracts; `POST v1/reserve-release`; internal `atp-check-command` + `reserve-release-command`; Orders `InventoryAtpCheckClient` gates allocation when `ORDERS_INVENTORY_RELAY_URL` set |

## Remaining (card steps)

- S1: confirm locator grain / migrations only if true gaps
- S3–S7: costing facts, warehouse map, scanner, concurrency proofs, live conformance, full verify
