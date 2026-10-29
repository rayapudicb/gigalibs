# WI-OI-125 evidence — Advanced SCM & transfers (Module 3)

## Status (2026-10-29)

**In Progress → Built pending owner verify.** Slices S1–S6 implemented in working tree; migration **v12**; Finance + Procurement relay consumers wired.

## Delivered

- **S1/S6:** Inter-warehouse transfer DocAction (DRAFT → dispatch → receive), BLOCKED in-transit locator, idempotent replay; isolated PG proof (prior session, 57/57 inventory suite).
- **S2:** Outbox `inventory.transfer.dispatched/received.v1`; Finance `InventorySubledgerInboxService` posts in-transit GL (inventory ↔ landed-cost clearing) at standard cost; posting policies in `@gigalibs/posting-rules`.
- **S3/S5:** Replenishment rules, radar, PO-draft outbox; payload includes `orgUnitId` + `uomId`; `InventoryProcurementOutboxRelay` → Procurement `internal/v1/inbox` → draft PO.
- **S4:** Kanban transfer board + Replenishment Radar tabs in `UniversalInventoryWorkspace`.
- **Infra:** Migration `000012_transfer_and_procurement_relay.up.sql`; `pnpm modules:catalog` → inventory migration **12** in `compose.module-host.yaml`; `generate-inventory-finance-relay-credentials.sh` extended for Inventory→Procurement keys.

## Verification (this session)

- Typecheck: `@gigalibs/universal-inventory-api`, `@gigalibs/financial-operations-api`, `@gigalibs/universal-procurement-api`, `@gigalibs/posting-rules`.
- Vitest: `inventory-inbox.test.ts` (10/10 incl. transfer dispatch), `inventory-transfer-dispatched.v1.test.ts` (1/1).
- PG integration tests skipped without `INVENTORY_PG_TEST_URL` (owner opt-in).

## Owner next

1. Run `infra/compose/scripts/generate-inventory-finance-relay-credentials.sh` (adds Procurement relay keys when module env files exist).
2. Rebuild module-host image; migrate inventory to **v12**; journey: transfer dispatch/receive + Finance journals; replenishment → draft PO.
3. Full `pnpm verify` when ready; say **commit** for module-completion.
