# WI-OI-120bq: make Table 2 releasable — fix the Security review findings

- **Status:** Built (partial, 2026-10-20): Finance migration **13** (H1 source-document idempotency, M1 relay revokes),
  Inventory **7** (M2 receipt-only lease, M1 revokes), book currency on receipt posting (H3 partial), L1 quantity schema,
  L3 reconciliation advisory lock. **Open:** H2 retry + period-scoped close, H3 per-product standard costs + API, M3
  posting-cutoff relay, full stack proof, Security re-review. Implementer: Cursor. Reviewer: Claude Code.
- **Work item:** WI-OI-120 (Table 2; ADR-0007, ADR-0013, ADR-0033 D3).
- **Size:** L.
- **Source:** [TABLE-2-SECURITY-REVIEW-2026-10-20.md](../work/TABLE-2-SECURITY-REVIEW-2026-10-20.md) — findings H1–H3,
  M1–M3, L1–L3 (H4 is WI-OI-120bp).
- **Migrations:** use the next free numbers after WI-OI-120bp (Finance 12 and Inventory 6 are 120bp's). Finance 1 and
  Inventory 2 are on UAT: never edit them; fix them with forward migrations.

## Fixes (one test that fails before and passes after, per item)

| # | Finding | Fix |
| --- | --- | --- |
| H1 | A retry after a partial failure doubles cost layers | Whatever 120bp leaves undone: `ingestReceiptLayer` runs on the inbox transaction's client (no own transaction on the inbox path). A unique key on `inventory_cost_layers` by tenant, source document type and source document id, inserted with `ON CONFLICT DO NOTHING` (new Finance migration). Test: line 2 fails, the message is redelivered, there is exactly one layer and one journal per line. |
| H2 | One rejected posting blocks period close for ever | (a) **Retry:** `POST v1/subledger/inventory/postings/{messageId}/retry`, new permission `finance:subledger:retry` (added to the Finance administrator role in `module.yaml`), audited with a reason; it re-applies the stored message once in one transaction, and a second retry of a now-processed message is a no-op. The stored envelope must be kept for this (store the raw body or payload with the inbox receipt if it is not stored today; forward migration). (b) **Scope:** the close guard counts only postings whose posting date falls in the period being closed. Tests: a rejected receipt for a missing cost blocks close of its period only; after the cost is set and the retry runs, close passes. |
| H3 | One standard cost for every product; hard-coded USD | (a) **Per-product standard cost in Finance:** a Finance-owned table (tenant, cost profile, product id, standard unit cost, effective from), with API routes (list, get, create, update with reason, archive), a metadata window and permission `finance:costing:manage`. The inbox values each line at its product's cost in force on the posting date; no cost → that receipt is rejected with `FINANCE_STANDARD_COST_MISSING` (retryable through H2). No fallback to the profile's single cost. (b) **Currency:** journal lines use the accounting book's `currency_code`; remove every `'USD'` and `'1.000000'` literal from `costing/costing.service.ts` (10 places) — the book currency is the functional currency, so the rate is 1 by definition and must come from that rule, not a literal. Tests: two products with different costs post different values; a book in INR posts INR lines; `rg "'USD'" modules/financial-operations/apps/api/src` finds nothing. |
| M1 | Privileged functions executable by PUBLIC | Forward migrations in Finance and Inventory: `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC` and `GRANT EXECUTE … TO` the module's runtime role, for every `SECURITY DEFINER` function in both schemas (the relay lease and settle functions, Finance 11's tenant list, anything 120bp adds), as CMMS migration 13 did. Test: a query of `pg_proc.proacl` shows no PUBLIC execute; another module's role cannot call them. |
| M2 | Inventory relays every event type to Finance | Inventory forward migration: a lease function that returns only the event types Finance consumes (from the declared posting policies), used by the Finance relay. Every Inventory event type gets an explicit posting policy: receipt completed → posts; stock moved, stock issued, kit staged, kit issued → **none in this release** (recorded in the policy, so the choice is visible; issue costing is a later card). Test: a stock move never reaches Finance's inbox and no dead letter appears. |
| M3 | Undelivered events are invisible to reconciliation | Inventory reports its posting backlog per period over the relay (an event such as `inventory.posting-cutoff.v1` carrying the period end and the count of undelivered receipt events dated in it, sent when the count reaches zero and on request); Finance stores it, and the close guard refuses to close a period until Inventory has confirmed zero undelivered receipts for it. If this cannot be built cleanly, stop and write the question on the card — do not close the gap with a cross-module read. |
| L1 | Quantity accepted as any string | Inbox schema: decimal pattern, strictly positive, scale ≤ the contract's scale |
| L2 | Finance loads an unused private key | Finance's relay config loads only what Finance uses (verification key; plus its own outbound key from 120bp) |
| L3 | No single-runner lock on the daily job | `pg_try_advisory_lock` per sweep, released at the end; a second runner skips |

## Done when

- [ ] Every fix above has its test, red before and green after.
- [ ] `pnpm verify` passes, including `audit:layers`, `audit:production-data` and migration pins; only the other
      session's `audit:design-tokens` files may fail.
- [ ] On the isolated `gigalibs-test` stack, fresh database, images built by `build-test-stack-images.sh`: two
      products with different standard costs are received, posted and reconciled; a receipt with no standard cost is
      rejected, the cost is added, the retry posts it, and the period then closes; `pnpm test:minimal-p2p-o2c` and the
      F2.7 proof pass.
- [ ] Claude Code's independent re-review finds no open High or Medium.
- [ ] Then, and only then: F2.9 accountant sign-off on the per-product valuation, the release worktree, the owner's
      deploy.
