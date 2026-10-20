# WI-OI-120bp: independent review (2026-10-21)

- **Reviewer:** Claude Code (did not write this code). Owner's request: "review 120bp".
- **Scope:** commit `6ea5a927` ("WI-OI-120bp/120bq: Finance–Inventory signed relays and Table 2 hardening start"), read
  from the commit, plus the state of Cursor's uncommitted fixes where they change a finding. The 120bq parts in the
  same commit (Finance 13, Inventory 7, cost-layer idempotency, filtered lease) are covered too; the rest of 120bq
  (Finance 14, Inventory 8, uncommitted) is for the 120bq review.
- **Method:** reading the code; read-only catalogue queries on UAT (function signatures, ledger columns, RLS) and on
  the `gigalibs-test` database (ledgers).

## Verdict

**The design is right and most of it is sound; not releasable until B1 is committed and B2 to B5 are fixed.**

## What is sound

- **The coupling is gone.** No module code reads another module's database URL or schema
  (`FINANCE_INVENTORY_POSTING_DATABASE_URL`, `FINANCE_PERIOD_LOCK_DATABASE_URL`, `set_receipt_finance_posting_status`
  are gone); Inventory no longer imports `@gigalibs/posting-rules`.
- **One Finance transaction per receipt** (ADR-0033 D3): `ingestReceiptLayer` runs on the inbox client; cost layers,
  journals, the register and the posting-outcome event commit together. With the cost-layer unique key and
  `ON CONFLICT` (Finance 13), a redelivery can no longer double a layer (Table 2 H1 fixed). Quantity is validated
  (L1 fixed).
- **Signed relays both ways.** Finance signs with its own key; Inventory's guard checks audience
  `gigalibs-inventory-inbox` and source `finance`; Finance no longer loads the unused private key (L2 fixed).
- **Filtered leases** in both directions (Finance 12, Inventory 7): each relay leases only the events its peer
  consumes (M2 fixed on the Inventory side). PUBLIC execute is revoked on the relay functions (M1), once B1 is fixed.
- **Period changes publish events** on create and on status change; a tenant without Finance is never blocked; a
  late rejection does not overwrite a posted receipt.

## Findings

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| B1 | **High (deploy blocker); fixed, not committed** | In the commit, Finance 13 revokes and grants on `relay_settle_finance_event(uuid, …)`, but the function takes `p_id text` (UAT catalogue) — the migration fails. Inventory 7 inserts its ledger row without `name`, which is `NOT NULL` — the migration fails. Cursor's working tree fixes both exactly (`text`; `(7, '000007_inventory_finance_relay_filter')`), and the test stack applied 13 and 7 with the fixes. | Commit the fixes before any release; the commit on the branch must never be deployed. |
| B2 | **High (tenancy)** | New tenant tables without forced row-level security: Finance `inventory_fiscal_replica_publish` (12); Inventory `finance_period_replica_meta` and `finance_fiscal_period_replica` (6). Both modules force RLS on every other table (UAT: Inventory 28 of 29, Finance 50 of 51, the ledger excepted). Cursor's uncommitted Finance 14 adds three tables with RLS forced on only one. | `ENABLE` and `FORCE ROW LEVEL SECURITY` plus the module's tenant policy on each (in place: none is released). A test that queries the catalogue for every tenant table. |
| B3 | **Medium-High (D1 correctness)** | Period events are applied without an order check: if "open" fails and is retried after a newer "locked" has been applied, the late "open" overwrites it, and Inventory accepts receipts in a locked period. The relay leases the oldest pending rows, but a retried row can be overtaken. | Carry a monotonic version in the payload (the outbox aggregate version, or the period's update time) and apply only a newer one (`ON CONFLICT … DO UPDATE … WHERE excluded.version > existing.version`). Test: deliver v2 then v1. |
| B4 | **Medium (D1 requirement)** | The snapshot is published only when the first receipt event reaches Finance. Until then Inventory's guard allows every receipt (correct for a tenant without Finance), so a period locked before 120bp went live is not refused for the first receipts — D1 required it. Finance's own posting check still rejects them later, so the effect is "posting rejected" instead of "completion refused". | Finance publishes the snapshot proactively: a sweep (startup and with the daily reconciliation job) for every tenant with fiscal periods and no row in `inventory_fiscal_replica_publish`. Test: lock a period, deploy, complete a receipt in it → refused. |
| B5 | **Medium** | Inventory marks the initial sync complete on the first period event, not after the whole snapshot. While the snapshot drains, receipts in periods not yet received are refused ("No fiscal period covers…"), and if the first event is a non-primary book, "Finance has no active accounting book". | Finance appends `finance.fiscal-period.snapshot-completed.v1` (primary book, period count) after the snapshot's period events in the same transaction; Inventory sets `initial_sync_completed_at` only on it. |
| B6 | Low | Event names and payload shapes are duplicated in Inventory ("Duplicated from @gigalibs/posting-rules"). They will drift. | Move the relay event contracts (type names and payload schemas) to `@gigalibs/contracts`; both modules import them. |
| B7 | Low | A posting outcome for an unknown receipt updates nothing and reports PROCESSED silently. | Count and log it (relay health), so a misrouted outcome is visible. |

## Process notes

- Cursor committed `6ea5a927` although its prompt said not to commit; the commit also carries part of 120bq. The fixes
  for B1 exist only in the working tree.
- Re-review after the fixes: the 120bq review covers B2 (Finance 14), and this card's B2 to B7 are re-checked then.
