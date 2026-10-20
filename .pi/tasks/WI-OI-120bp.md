# WI-OI-120bp: remove the direct Finance ⇄ Inventory database coupling (F1.4, F2.5)

- **Status:** Approved for implementation (owner, 2026-10-20: "hand over this to cursor 120bp, D1"), D1 as recommended
  (local period replica). Implementer: Cursor. Found while fixing `pnpm verify`.
- **Work item:** WI-OI-120 (Table 2; ADR-0007, ADR-0013, ADR-0033 D3).
- **Size:** L. Two modules, one Finance migration, one new signed relay with its own keys, module-host settings,
  the F2.7 proof script, tests and a run on the isolated test stack.
- **Release impact:** none yet. F1.4 and F2.5 are not on UAT (UAT: Finance 9, Inventory 4). This must land before
  Table 2 is released.

## Problem (verified 2026-10-20)

`pnpm verify` fails `audit:layers` because Finance and Inventory each read or write the other's database schema with
the other's credentials. ADR-0013 forbids this ("use published contracts, APIs and events"); ADR-0007 routes
cross-module effects through outbox relays.

1. **F2.5, Finance writes Inventory** (`WI-OI-120fv`, `1fadfa4f`).
   `modules/financial-operations/apps/api/src/subledger/inventory-receipt-posting-status-sync.ts` connects with
   `FINANCE_INVENTORY_POSTING_DATABASE_URL` (WI-OI-120fp: "the same value as `UNIVERSAL_INVENTORY_DATABASE_URL`") and
   calls the `SECURITY DEFINER` function `gigalibs_inventory.set_receipt_finance_posting_status` (Inventory migration 5).
   Audit: `MODULE_SCHEMA_ACCESS … -> gigalibs_inventory`.
2. **F1.4, Inventory reads Finance** (`WI-OI-120fz`, `e7eaa3dd`).
   `modules/universal-inventory/apps/api/src/inventory/finance-period-lock-guard.ts` connects with
   `FINANCE_PERIOD_LOCK_DATABASE_URL` or `FINANCIAL_OPERATIONS_DATABASE_URL` (Finance's runtime credentials) and reads
   `gigalibs_finance.accounting_books` and `fiscal_periods` through `@gigalibs/posting-rules`. The audit missed it
   because the schema name is passed as a variable; it shows once `posting-rules` is classified as Finance-owned:
   `MODULE_IMPORTS_MODULE … finance-period-lock-guard.ts -> @gigalibs/posting-rules`.

No other module uses another module's database URL or schema (checked 2026-10-20).

## Design

Finance ⇄ Inventory talk only through the signed outbox relay that already carries receipts from Inventory to
Finance (ADR-0033 D3), now also in the other direction.

**A. Posting outcome back to Inventory (replaces the F2.5 direct write)**

1. Finance migration 12: `gigalibs_finance.relay_lease_finance_inventory_events`, which leases only the events meant
   for Inventory; settle reuses `relay_settle_finance_event`. Grants as for the existing relay functions.
2. Finance's inventory inbox service appends `finance.inventory-receipt.posting-outcome.v1` (receipt id, `POSTED` or
   `POSTING_REJECTED`, rejection code) to its outbox **in the same transaction** as the journal or the rejection.
   `InventoryReceiptPostingStatusSync` and `FINANCE_INVENTORY_POSTING_DATABASE_URL` are removed.
3. A Finance → Inventory `OutboxRelay` (source `finance`, audience Inventory's inbox) with its own Ed25519 key pair,
   generated like the Inventory → Finance pair; module-host settings for both modules.
4. Inventory's relay inbox (SDK `relay-inbox-guard` and `inbox-receipts`) records the message and updates its own
   receipt in one Inventory transaction. Idempotent; a later outcome never regresses (`POSTED` is final unless a
   newer rejection for a newer posting version arrives).
5. Inventory migration 5 (unreleased) is edited in place: the `SECURITY DEFINER` function goes; the two columns stay.

**B. Period-lock check before completing a receipt (replaces the F1.4 direct read)** — see D1.

**C. Hygiene**

- `posting-rules` stays Finance-owned (`config/package-layers.json`); Inventory no longer imports it.
- `scripts/verify-inventory-finance-relay-http.mjs` (F2.7 proof) drives the two relays instead of the database URL.
- WI-OI-120fp, WI-OI-120fv, WI-OI-120fz, `.pi/TABLE-2-UAT-CLOSURE.md` and `.pi/NOW.md` are updated; ADR-0033 D3
  gains the return leg.

## Decision for the owner

- **D1. How Inventory knows a Finance period is locked.** Approved 2026-10-20 as recommended: **a local replica**, like the organisation
  replica Inventory already keeps (ADR-0018). Finance relays `finance.fiscal-period.state-changed.v1` (book, period,
  dates, open or locked) over the channel from A; Inventory stores it in its own schema and checks it locally before
  completing a receipt. There's no runtime dependency on Finance and no shared credentials, and it keeps today's behaviour
  (completion is refused in a locked period, as iDempiere refuses completion in a closed period). The replica needs
  an initial full sync when the relay first starts.
  *Alternative:* drop the pre-check and rely on ADR-0033 D3's asynchronous rejection: the receipt completes and
  shows "Posting rejected: period locked" via A. Smaller, but warehouse staff learn about the lock only afterwards.

## Done when

- [x] `pnpm verify`: build, test, `audit:layers` (2 stale baseline entries removed, none added), migration pins, module
      windows pass; `audit:design-tokens` still fails on other-session UI files only. Slice certifications
      `inventory-finance-relay (F2.2)` and `inventory-finance-relay-http (F2.7)` **24/24** on test Postgres
      (`PROOF_DATABASE_URL`, port ≠ 5440).
- [x] No module code reads another module's database URL or schema; `rg` on `modules/` finds
      `set_receipt_finance_posting_status` only in migration 5 down; Inventory no longer depends on `@gigalibs/posting-rules`.
- [x] Unit tests: `inventory-inbox.test.ts` (outbox on post/reject), `finance-inbox.test.ts` (idempotent POSTED),
      `finance-period-replica-guard.test.ts` (no sync / missing period / locked).
- [ ] On `gigalibs-test` with images from `build-test-stack-images.sh`: receipt Posted, period lock refuses completion;
      `pnpm test:minimal-p2p-o2c` — **in progress** (test stack images rebuilding; prior run timed out on org replica
      before module-host picked up 120bp).
- [ ] Independent review of the migrations, the relay keys and the inbox security before release.

**Status:** Built (2026-10-20). Evidence: Finance migration **12**, Inventory **6**; `node scripts/verify-inventory-finance-relay.mjs`;
`IF2_PROOF_PORT=47940 node scripts/verify-inventory-finance-relay-http.mjs` → **24/24**; module-host `rawBody: true`;
relay env scoping in Finance `loadFinanceRelayConfig` / outbound loaders.

## Already fixed under "fix verify" (2026-10-20, uncommitted)

- `modules/universal-inventory/dictionary/windows.mjs` now declares the two Finance posting fields and their value list
  that the F2.5 commit had added to `inventory-receipts.window.json` by hand; `node scripts/generate-windows.mjs --check`
  passes and the generated window is byte-identical to the committed one.
- `config/package-layers.json`: `packages/document-lifecycle` is core (ADR-0033: "the primitives every transactional
  document uses"); `packages/posting-rules` is Finance-owned. No unit is unclassified any more.
