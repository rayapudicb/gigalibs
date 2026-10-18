# WI-OI-120fr (F2.2 / E2): Inventory receipt posting policy and GL context

- **Status:** Done in git (`14845ae`; owner, 2026-10-18). UAT journal proof still open.
- **Work item:** WI-OI-120 (F2 / ADR-0033 D3, plan v3 §5A E2). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Goal

Finance applies an explicit posting policy for `inventory.receipt.completed.v1`: resolve the tenant's primary book and
open fiscal period, then post inventory receipt layers to GL with stable source-document keys (idempotent with F2.1 inbox).

## Scope

- **May change:** `packages/posting-rules`; Finance subledger inbox and posting context helpers; tests; optional isolated verify script.
- **Must not change:** Inventory receipt completion logic; CMMS import/export files.

## Done when

- [x] `@gigalibs/posting-rules` defines the inventory receipt completed policy (event type, entry type, source document).
- [x] Finance inbox resolves primary book + open period; rejects locked/missing period with keyed codes.
- [x] Unit tests + `scripts/verify-inventory-finance-relay.mjs` (57 finance API tests, 3 posting-rules tests).
- [x] `pnpm --filter @gigalibs/financial-operations-api` build and test pass (2026-10-18).
- [ ] Owner: deploy with F2.1; live receipt→journal proof on UAT when book/period/cost profile exist.
