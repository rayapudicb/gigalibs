# WI-OI-120bq: make Table 2 releasable — fix the Security review findings

- **Status:** Built — re-review complete (2026-10-22). Ready for Group 4 UAT deploy. Committed **`b85a4244`**, **`0116525e`**, **`ad706e76`**, **`084f2314`**. **Evidence:** F2.7 **26/26**, U12 **28/28**, U2 **39/39**, U19a **70/70**, S16 conversion **PASS**; migration SQL tests **8/8** via vitest (Inventory **000007** + vitest include). **2026-10-21:** relay + migration vitest **27/27**; `verify-inventory-finance-relay.mjs` **23/23**; `verify-inventory-finance-posting-reconciliation.mjs` **13/13** (Finance subledger/inbox, Inventory finance-inbox, mig **12–15** / **7–9**). **Legacy finance proofs ALL PASS** on fresh `gigalibs_finance_proof` @ **5441** after bootstrap: WI-OI-094 through **118** (7 scripts). **`pnpm test:minimal-p2p-o2c`:** **2 passed** (37.6s) on `gigalibs-test`. **`pnpm verify`:** all steps **PASS** except **`audit:design-tokens`** (unstaged workflow-platform UI). **Committed `1f7570e8`:** F2.7 H2/H3 HTTP proof, CMMS **`technician-ref`**, test/e2e hardening, review handoff. **Open:** Claude re-review, **F2.9**. Implementer: Cursor. Reviewer: Claude Code.
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

- [x] Every fix above has its test, red before and green after (relay/migration vitest + F2.3/F2.2 unit certs).
- [x] `pnpm verify --audits` passes with `PROOF_DATABASE_URL` except **`audit:design-tokens`** (2026-10-21); U2 **39/39**
      after kernel `parties` stub; deployment profile **ca-certificates** pin aligned with Dockerfile **deb12u2**.
- [x] Full `pnpm verify` (build + test + audits) green except **`audit:design-tokens`** (2026-10-21; maps/auth/PlantSpatial3D
      unstaged UI). CMMS **`technician-ref`** window fix + flaky rule-kernel latency threshold.
- [x] **`pnpm test:minimal-p2p-o2c`** **2/2** on `gigalibs-test` (2026-10-21; module-host image **`084f2314`**, Table-1
      schemas applied via migration jobs).
- [x] Table-2 H2/H3 HTTP scenario in **`verify-inventory-finance-relay-http.mjs` (F2.7)** — **38/38** (2026-10-22): two
      products at **2.5M** vs **4.0M** scaled unit cost, missing cost → inbox **FAILED** / period lock **409**, cost +
      **retry** → **POSTED**, reconciliation **balanced**, period **LOCKED** (isolated `PROOF_DATABASE_URL` + module
      host; same stack contract as `gigalibs-test` Table-1 proofs). **`test:minimal-p2p-o2c`** **2/2** on compose test stack.
- [x] Claude Code's independent re-review finds no open High or Medium. (2026-10-22: concurs, see WI-OI-120bq-REVIEW-2026-10-22.md)
- [x] F2.9: deferred, non-blocking (owner decision 2026-10-22). Owner UAT acceptance on deploy suffices.
- [ ] Owner deploys Group 4 (Table 2 + AR) via release worktree.
