# WI-OI-156: Cross-module references — entity events, reference replicas and validation

- **Status:** Approved (owner, 2026-11-03, execution plan approval). Slice A in phase 0 (now); B and C in phase 1 after
  WI-OI-160.
- **Work item:** WI-OI-156. Evidence goes in `.pi/work/WI-OI-156.md`.
- **Size:** L (A events, B replicas, C validation). **Decisions:** ADR-0039.

## Goal

A module can only use a product, unit, partner or warehouse that exists, and an archived one cannot be used on a new
document — without cross-module foreign keys.

## Scope

- **May change:** outbox publishing in Products, Business partners, Inventory, General ledger; event contracts in
  `packages/contracts` (additive); a new `packages/module-sdk/src/reference-replica.ts` generalizing
  `organization-replica.ts`; consumer migrations (replica tables, RLS) and inbox handlers in Inventory, Orders,
  Procurement, General ledger, Manufacturing, Accounts receivable; `spec.references` in manifests; the record
  dispatcher's validation; hub replica health; tests.
- **Must not change:** existing records (validation applies to new and changed values only). Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Read first

ADR-0039; `packages/module-sdk/src/organization-replica.ts`, `outbox-relay.ts`, `relay-inbox-guard.ts`,
`inbox-receipts.ts`; `apps/playground-api/src/parties/party-projection-relay.service.ts`;
`packages/contracts/src/catalogue/catalogue.ts` (`product.created.v1` defined, never published).

## Steps

1. **A — events.** Owners publish `<entity>.created|updated|archived.v1` with a version: products, units, categories,
   price lists, partners, warehouses and locations, accounts.
2. **B — replicas.** Replica table (id, code, name, status, version, small payload) per referenced entity; signed relay
   into an idempotent, version-ordered inbox; a backfill job from the owner's list API.
3. **C — validation.** `spec.references` (field → entity, `onArchive: BLOCK_NEW` by default); the dispatcher checks
   new and changed values; module flags: shadow (log `REFERENCE_VIOLATION`) then enforce (plain refusal, for example
   "This product is archived"); the hub shows replica lag and count against the owner.

## Done when

- [ ] Product events appear in the outbox on the test stack (A)
- [ ] Backfilled replica counts equal the owners'; a stopped relay shows in the hub and loses nothing on restart (B)
- [ ] With enforce on, an archived product cannot be added to a new order line; shadow mode logged zero violations on the
      proof data before enforce (C)
- [ ] `pnpm verify` passes; `audit:layers` classifies every new model, `audit:design-tokens` and `audit:ui-shell` pass
- [ ] Evidence is recorded in `.pi/work/WI-OI-156.md`, and `.pi/NOW.md` is updated

## Stop and ask if

- a decision is needed that ADR-0037–0040, the execution plan or the owner has not settled;
- a step would change a running service, the UAT database or the owner's data;
- existing UAT data already violates a reference (report it; do not fix data), or a consumer needs a large payload.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
