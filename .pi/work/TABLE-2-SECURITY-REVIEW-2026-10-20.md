# Table 2 engines: independent Security review (2026-10-20)

- **Reviewer:** Claude Code. Independent: it produced none of the Table 2 code (WI-OI-120fl to 120gb). Owner's request:
  "review Table 2".
- **Scope:** F1.1 to F1.4 and F2.1 to F2.8 in `.pi/TABLE-2-ENGINES.md`, as committed at `1b2df602`:
  - Finance migrations 10 and 11, Inventory migration 5;
  - `packages/document-lifecycle`, `packages/posting-rules`;
  - the module SDK relay changes;
  - Finance's inbox, posting, reconciliation, close guard and journal drafts;
  - Inventory's receipt lifecycle and relay.

  F2.9 (accounting sign-off) is a human review and is out of scope.
- **Method:** reading the code at the commit (not the working tree, which Cursor is changing for WI-OI-120bp), plus
  read-only catalogue queries on UAT for the privileges of released functions.
- **Records:** none of the 12 Table 2 cards recorded an independent Security review before this one.

## Verdict

**Not releasable yet.** There are four High findings, three of them about money:

- a partial posting can double inventory valuation;
- one rejected posting can block period close for good;
- valuation uses one standard cost for every product, in USD.

The relay security itself is sound. Fix H1 to H4 and M1 to M3, then re-review before any Table 2 deploy.

## Findings

| # | Severity | Finding | Where | Fix |
| --- | --- | --- | --- | --- |
| H1 | **High** (financial value) | **A partly processed receipt doubles inventory valuation on retry.** `ingestReceiptLayer` opens its own transaction for each line, outside the inbox transaction. ADR-0033 D3 requires one Finance transaction. If a multi-line receipt fails after line 1, the inbox receipt rolls back and the relay retries. Journals are safe, because `postJournal` returns the existing one (unique index `uq_gl_journals_source_document`). But `inventory_cost_layers` gets a **second row** for every line already committed (a random id, and no unique key), so stock value and FIFO quantities double. | `subledger/inventory-inbox.service.ts` (`apply`); `costing/costing.service.ts` (`ingestReceiptLayer`, `withTenantTransaction` at the top) | Pass the inbox transaction's client into `ingestReceiptLayer` (`postJournal` already takes one). Add a unique key on cost layers by source document, with `ON CONFLICT DO NOTHING` (new Finance migration). Test: fail line 2, retry, assert one layer and one journal per line. |
| H2 | **High** | **One rejected posting blocks period close permanently.** `receiveOnce` stores a rejection as FAILED, and a redelivery returns DUPLICATE, so it can never be retried. The reconciliation counts every FAILED receipt ever, with no period filter, and the close guard refuses while any exist. So one early `FINANCE_COST_PROFILE_MISSING`, for example, stops every future period close. The only way out is manual SQL. ADR-0033 D3 requires "can be retried after correction". | `posting/inventory-receipt-posting-reconciliation.ts`, `posting/inventory-receipt-posting-close-guard.ts`, `module-sdk/inbox-receipts.ts` | A permissioned, audited "retry rejected posting" action that re-applies the stored message once its cause is fixed. Scope the close guard to postings dated in the period being closed. Test both. |
| H3 | **High** (financial value; disclosed in the F2.9 packet) | **Wrong values for any real workspace.** Every line of every product is valued at the default cost profile's single `standard_unit_cost_scaled`, not per product and not at the purchase order's price. Journal lines are hard-coded `currencyCode: 'USD'` with `exchangeRate: '1.000000'` (10 places), although every accounting book has its own `currency_code`. The USD literals predate Table 2 (`babd0b9b`), but Table 2's posting runs through them. | `subledger/inventory-inbox.service.ts` (cost profile query); `costing/costing.service.ts` | Unit cost per product, or the PO price carried in the event. Currency from the book. No literals: the zero hard-coding rule. Until then, release only if the owner and the accountant accept a single-product, USD pilot in writing. |
| H4 | **High** (tenancy and credentials; already being fixed) | **Finance and Inventory use each other's database credentials** (F2.5 posting-status write, F1.4 period-lock read) | See WI-OI-120bp | WI-OI-120bp (Cursor, in progress) |
| M1 | Medium (hardening) | **Privileged functions are executable by PUBLIC.** On UAT, `gigalibs_finance.relay_lease_finance_events` / `relay_settle_finance_event` and `gigalibs_inventory.relay_lease_inventory_events` / `relay_settle_inventory_event` carry `=X/gigalibs`. CMMS revoked the same (CMMS migration 13; the runner's WI-OI-068 note). The same gap is in Finance 11 (`list_inventory_receipt_posting_reconciliation_tenants`, which reads across workspaces), Inventory 5 (`set_receipt_finance_posting_status`, which takes the workspace as a parameter) and the new Finance 12 in the working tree. Today only each module's own role has USAGE on its schema, so no other role can reach them. That's defence in depth, not an open door. | Finance 1, 11, 12; Inventory 2, 5 | Forward migrations: `REVOKE EXECUTE … FROM PUBLIC`, then grant to the module's runtime role only. A test that another module's role cannot call them. |
| M2 | Medium | **Inventory relays every event type to Finance.** The lease has no event-type filter. Finance refuses `stock.moved`, `stock.issued`, `kit.staged` and `kit.issued` with 400, so they are dead-lettered and relay health turns red. And a stock issue never posts its cost of goods: ADR-0033 D3 wants an explicit posting policy for each document type. | Inventory 2 lease function; Finance inbox | Lease only the event types the peer consumes, or route per audience. Declare a posting policy for each type: posts, commitment-only or none. |
| M3 | Medium | **Undelivered events are invisible to reconciliation.** Finance compares only its inbox with its journals. Receipts stuck or dead-lettered in Inventory's outbox don't count, so a period can close while Inventory still holds unposted receipts for it (against ADR-0033 D3). | Reconciliation and close guard | Inventory reports its delivery status per period over the WI-OI-120bp channel; the close guard checks it. |
| L1 | Low | `receivedQuantity` in the inbox payload is any string: a negative, an exponent or a huge value is accepted. That's on top of the signed relay, so it's defence in depth. | `inventory-inbox.service.ts` schema | Decimal pattern, positive, scale limit |
| L2 | Low | Finance's relay config reads `FINANCE_INBOX_RELAY_PRIVATE_KEY_BASE64`, but Finance only verifies and needs only the public key. | `relay/relay-config.ts` | Load the public key only (least privilege) |
| L3 | Low | The daily reconciliation job has no single-runner lock. With two module-host replicas it would write duplicate audit rows. | `inventory-receipt-posting-reconciliation-job.ts` | Advisory lock or a job lease |

## What is sound

- **Relay authority** (`RelayInboxGuardBase`): an Ed25519 token signed for this inbox, bound to the exact body,
  audience and source checked, and the token's tenant and message id must match the envelope. User tokens are refused.
- **Deduplication** per tenant, consumer and message (`receiveOnce`); journals exactly once per source document,
  book and entry type.
- **Tenant context** always comes from the verified relay claims or the signed-in principal, never from free input.
  The new register table has forced row-level security. The reconciliation job sets tenant context for each tenant.
- **Journal drafts** (F1.2): balanced and non-zero guards, and the submitter cannot approve.
- **Receipt completion** (F1.3): the receipt row is locked, and stock movements and the outbox event are written in
  one transaction.
- **New routes** (`posting-status`, `posting-reconciliation`) require `finance:read`. The SDK's configurable inbox
  path refuses relative paths, `..` and schemes.

## For WI-OI-120bp (Cursor)

Finance migration 12 in the working tree defines `relay_lease_finance_inventory_events` as `SECURITY DEFINER` without
revoking PUBLIC execute. Add the `REVOKE` and the runtime-role `GRANT` in the same migration (M1).
