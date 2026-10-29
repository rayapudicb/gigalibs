# WI-OI-126 evidence — Manufacturing & MRP (Module 4)

**Status:** Built (2026-10-29; S5/S6 iDempiere differentiators deferred per handoff)

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

## Open (deploy / differentiators only)

- Relay credentials + `pnpm module:conformance universal-manufacturing --live` — owner batch deploy.
- S5/S6 graph BOM / shortage FocusModal polish — plan `> iDempiere` differentiators (deferred).
- Full-repo `pnpm verify` when owner requests batch sign-off.

## Owner ops

```bash
infra/compose/scripts/generate-generated-module-credentials.sh universal-manufacturing
# Configure MANUFACTURING_INVENTORY_RELAY_* for live reserve on release
```

Deploy sequence: Module **4** of seven (after Material Ledger + Advanced SCM).
