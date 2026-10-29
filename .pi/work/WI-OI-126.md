# WI-OI-126 evidence — Manufacturing & MRP (Module 4)

**Status:** In progress (2026-10-29)

## Built

- Migrations **v2–v3**: BOM/production/MRP tables; `finished_uom_id`, `inventory_receipt_id` on production orders.
- Engines + tests: BOM explosion, scrap/cost rollup, MRP netting.
- API: BOM tree, production create → **release** (reserve) → **issue** (component issue) → **complete** (FG receipt + outbox).
- Inventory (Material Ledger): WORK_ORDER issue via `issueStockForWorkOrderDemand`; signed **issue-demand** and **production-receipt** inboxes; reserve/release accepts **universal-manufacturing** relay source.
- Web workspace: BOM explode, release/issue/complete actions, MRP preview.
- Outbox: `manufacturing.production.completed.v1` includes `componentLines` + `inventoryReceiptId`; **ManufacturingFinanceOutboxRelay** → Finance inbox.
- Finance S7: `manufacturingProductionCompletedPostingPolicyV1` — Dr WIP clearing / Cr inventory per component standard cost (+ unit test in finance inbox suite).
- Migration **v4**: relay lease/settle for production-completed events.

## Verification (local)

- Manufacturing API `tsc --noEmit` — run after `pnpm install` at repo root.
- Vitest manufacturing API src — **14/14** (prior run).
- Re-run `pnpm modules:catalog` after install (gateway route `production-orders/{id}/issue`).

## Open (not Built)

- Relay credential script: inventory inboxes for manufacturing issue/receipt (`INVENTORY_ISSUE_DEMAND_*`, `INVENTORY_PRODUCTION_RECEIPT_*`); manufacturing uses shared Finance inbox signing key via `generate-inventory-finance-relay-credentials.sh`.
- Compensation / pending states across failed issue or receipt.
- S5/S6: shortage badges, FocusModal execution UX, graph BOM editor (plan differentiator).
- PG integration test + `pnpm module:conformance universal-manufacturing --live`.
- Full `pnpm verify`; module-completion commit (owner says **commit**).

## Owner ops

```bash
infra/compose/scripts/generate-generated-module-credentials.sh universal-manufacturing
# Configure MANUFACTURING_INVENTORY_RELAY_* for live reserve on release
```

Deploy sequence: Module **4** of seven (after Material Ledger + Advanced SCM).
