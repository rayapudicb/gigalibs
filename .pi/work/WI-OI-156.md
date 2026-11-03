# WI-OI-156 evidence — Cross-module references: entity events, replicas, validation

## 2026-11-03 — slice A: master facts (queue item 4, claimed by Claude)

Finding: owners already wrote facts to their outboxes, but in many shapes (`PRODUCT_CREATED_V1`, `UOM_CREATED_V1`
with only code and dimension, Inventory's `inventory.warehouse.created.v1`, Business partners' generic `RECORD_*`,
none for General ledger accounts), so a consumer could not keep one kind of replica from them.

Built:
- Contract `MasterFactV1` (`packages/contracts/src/master-data/master-fact.ts`, event type `MASTER_FACT_V1`): entity
  key, change (CREATED, UPDATED, ARCHIVED), id, code, name, status (only ACTIVE allows new use), version, a few
  attributes.
- `recordMasterFact` in `@gigalibs/module-sdk`: validates the fact and writes it to the module's outbox in the
  caller's transaction, next to the module's own fact.
- Owners writing it: Products — products (created, updated, archived and restored through the archive command),
  units (created, and each standard unit added), categories (created, updated; ended categories are EXPIRED);
  Inventory — warehouses (created, updated; inactive warehouses are INACTIVE); General ledger — accounts (created,
  updated; inactive accounts are INACTIVE).
- Customers and vendors: the control plane's party facts (`party.created|updated|archived.v1`, already relayed to
  Business partners) already carry id, code, name, status and version — the party is the master (ADR-0037), so they
  are the partner master facts; no second fact is written.

Tests: Products fact shapes, archived product, one fact per standard unit added and none on a second run
(`modules/product-catalogue/apps/api/src/catalogue/master-facts.test.ts`); the warehouse fact shape and an inactive
warehouse (`modules/universal-inventory/apps/api/src/inventory/master-facts.test.ts`).

Checked before reporting: the archive command and the warehouse edit first wrote no fact (fixed above); Inventory's
outbox has the topic and aggregate columns (migration 000002) and Products' command context always carries a
correlation id, so the insert meets both tables' NOT NULL columns.

Slice A built; `pnpm verify` PASS. The active slot is freed: slices B–C are queue item 10 (milestone B), so the row
stays In Progress until then.

Next: slice B — reference replicas in the consumers from these facts, the backfill, and the Compose relay
generation moved here from WI-OI-160.
