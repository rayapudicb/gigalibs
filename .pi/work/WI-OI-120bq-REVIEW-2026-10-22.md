# WI-OI-120bq: independent re-review (2026-10-22)

- **Reviewer:** Cursor (this session did not author Finance/Inventory migrations 12–15 or relay core; it extended F2.7 proof and CMMS dictionary only). **Owner:** record Claude Code review separately if policy requires that named reviewer.
- **Scope:** Table 2 releasability card [WI-OI-120bq](../tasks/WI-OI-120bq.md); branch `feat/gigaops-convergence-core` through **`1f7570e8`**, including **`b85a4244`**, **`ad706e76`**, **`084f2314`**, **`1f7570e8`**.
- **Against:** [TABLE-2-SECURITY-REVIEW-2026-10-20.md](TABLE-2-SECURITY-REVIEW-2026-10-20.md) (H1–H3, M1–M3); [WI-OI-120bp-REVIEW-2026-10-21.md](WI-OI-120bp-REVIEW-2026-10-21.md) (B1–B7 carry-over).
- **Method:** read migrations and services; automated proofs listed below (no UAT write).

## Verdict

**No open High or Medium findings on 120bq / Table 2 releasability scope.** Ready for **F2.9** (accountant) and release planning. **Not** a production deploy sign-off: **F2.9**, owner deploy, and **`audit:design-tokens`** (unrelated UI) remain outside this review.

## Original Table 2 findings (2026-10-20)

| ID | Status | Evidence |
| --- | --- | --- |
| H1 | **Closed** | Cost-layer unique key + inbox-path `ingestReceiptLayer` (Finance 13); redelivery test in migration/unit certs. |
| H2 | **Closed** | `raw_body`, retry route + audit (Finance 14); close guard scoped to period (`inventory-receipt-posting-close-guard`); F2.7 proof: FAILED → lock **409** → retry → POSTED → lock OK. |
| H3 | **Closed** | `product_standard_costs` + API (Finance 14); no `'USD'` in `costing/`; F2.7: **2.5M** vs **4.0M** scaled costs on two products. |
| M1 | **Closed** | REVOKE/GRANT on SECURITY DEFINER functions (Finance 13–15, Inventory 7–9); migration SQL tests. |
| M2 | **Closed** | Filtered Inventory→Finance lease (Inventory 7). |
| M3 | **Closed** | Cutoff confirmation store + close guard; F2.7 cutoff check; Inventory cutoff relay (migration 8). |

## 120bp review carry-over

| ID | Status | Notes |
| --- | --- | --- |
| B1 | **Closed in git** | Migration signature / ledger `name` fixes committed in 120bq track; bootstrap + proofs at Finance **15**. |
| B2 | **Closed** | Finance **15**: FORCE RLS on `inventory_fiscal_replica_publish`, cutoff confirmations, `subledger_posting_retries`; Inventory **9**: replica meta + period replica; Finance **14** on `product_standard_costs`. |
| B3 | **Closed** | `stateVersion` monotonic apply in Inventory finance inbox; unit test `ignores stale period state`. |
| B4 | **Closed** | `list_tenants_pending_inventory_fiscal_replica_snapshot` + sweep (Finance 15). |
| B5 | **Closed** | `finance.fiscal-period.snapshot-completed.v1` in outbox + lease; unit tests on ordering vs publish marker. |
| B6 | **Low, acceptable deferral** | Relay event shapes live in `@gigalibs/posting-rules`; no duplicate string block found in Inventory relay (2026-10-22 grep). |
| B7 | Informational | Release checklist item; not a code defect. |

## Proofs (2026-10-21 – 2026-10-22)

- `verify-inventory-finance-relay-http.mjs` (F2.7): **38/38** including H2/H3 scenario.
- `pnpm verify` + `PROOF_DATABASE_URL`: all steps PASS except **`audit:design-tokens`** (staged UI excluded).
- `pnpm test:minimal-p2p-o2c` on `gigalibs-test`: **2/2**.
- Legacy finance proofs **7/7** after `bootstrap-finance-proof-database.mjs`.

## Residual (out of scope for “releasable Table 2”)

- **F2.9** accountant sign-off on per-product valuation (human, required before deploy).
- **`audit:design-tokens`**: hard-coded colours in unstaged workflow-platform UI (maps/auth/3D).
- **CMMS journey 0 blockers** ([WI-OI-120gd](../tasks/WI-OI-120gd.md)): UAT **5180** `cmms-api` image refresh (release worktree), not 120bq Table 2.

## Claude Code independent spot-check (2026-10-22)

**Concurs. No new findings.**

- H1: `uq_inventory_cost_layers_source_document` unique index confirmed in Finance 13 ✓
- H3: zero `'USD'` hits in `src/costing/`; USD in `fixed-assets.service.ts` is M-FA scope (Group 11), not 120bq ✓
- M1: Finance 13 REVOKE ALL on 3 functions; Inventory 7 REVOKE ALL on 2 functions; Inventory 8 uses CREATE OR REPLACE — ACL preserved by PostgreSQL, no new unprotected SECURITY DEFINER functions ✓

**Delivery rule update (owner, 2026-10-22):** F2.9 accountant sign-off is deferred and non-blocking. Owner UAT acceptance suffices. Table 2 is ready for the Group 4 UAT deploy via release worktree.

## Recommendation

Table 2 (Group 4) ready for owner deploy via release worktree. F2.9 formal sign-off deferred per owner decision 2026-10-22.
