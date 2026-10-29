# WI-OI-124: Material and Warehouse Ledger (Module 2)

- **Status:** In Progress (2026-10-28); no module-completion commit or deployment.
- **Scope:** `universal-inventory` migration 10, contracts, Finance cost relay, Orders reserve client, generated windows and bounded verification-baseline fixes.
- **Deploy sequence:** F0 and Module 1 precede Module 2; owner deploys all seven reference modules together after build verification.

## Implemented in the worktree

| Slice | Current implementation |
|---|---|
| Locators and stock | Existing locator/lot/serial balances and immutable stock ledger; exact reservation-to-balance allocations, locator-bound issue/release and quarantined-lot ATP exclusion. Legacy reservation groups reconcile automatically only when a single balance exactly matches all outstanding demand; others fail closed. |
| ATP and Orders | Exact never-negative ATP, signed check/reserve/release gateway contracts and Orders client when configured. |
| Finance cost | Finance posting outcome now carries its immutable cost layer per receipt line. Inventory validates exact receipt-line set, quantity, product and replay, then stores append-only, tenant-RLS, organization-scoped Finance-posted cost records. Inventory snapshots an organization-selected Finance profile and method in the signed receipt fact; Finance rejects missing/inactive/mismatched profiles and preflights every line's cost before posting any. A product screen edits the organization mapping. A bounded retry action republishes receipts rejected before any Finance value was posted, with idempotency, audit and outbox. Older outcomes without cost lines remain visible as posting status but need reconciliation. |
| Picks and putaway | Browser camera/connected-scanner drawer uses real barcode resolution, available balance selection, movement command and sales-order reservation issue. The issue endpoint validates the input, owning order and line, and persists a fulfillment key so identical retries return the first result and conflicting retries fail. Movement refuses locator/warehouse mismatches and moving reserved stock. Barcode lookup is organization scoped. Reserve, release and issue write audit and reservation-change outbox facts in the same transaction. |
| Screens | Generated reservation, stock ledger, movement cost mirror, posted receipt cost and warehouse-map windows. The warehouse map is a real locator grid. |
| Migration | Additive migration 10, forced RLS, grants for new tables, immutable cost and issue records, and conservative legacy allocation backfill. [Verification and recovery](../../modules/universal-inventory/docs/material-ledger-migration-10.md) documents post-migration checks and roll-forward. |

## Verification

- Inventory and Finance API typechecks, workflow typecheck, contracts build and generated window check pass.
- `pnpm module:conformance universal-inventory`: **15/15 static checks pass** after the latest window change.
- `pnpm verify --audits`: **passes all runnable audits**; log `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-28T12-49-39-956Z.log` (14 database-dependent proofs not run).
- Targeted Finance inbox tests: **9/9 pass**, including organization profile selection, method mismatch, missing mapping and multi-line cost preflight. Inventory and Finance API typechecks, workflow typecheck and audit-only verification pass after these changes. Earlier isolated PostgreSQL 16 proof passed **9/9** before the later migration backfill and organization profile requirement, so it does not verify the final migration text.
- Full sandboxed `pnpm test`: **442 files pass**, 7 files fail (including a loopback-listener denial, `listen EPERM 127.0.0.1`); 48 files skipped. The two earlier timeout tests passed. Full `pnpm verify` previously failed during Next export (`TypeError: a[d] is not a function`), log `verify-2026-10-28T11-02-28-055Z.log`. After deleting only generated `.next`, a standalone workflow production build passed all 159 static pages.
- The latest required unsandboxed `pnpm verify` did **not run**: automatic approval review rejected the escalation because its service reached a usage limit, with no safety finding. No attempt was made to bypass that approval check.

## Completion (2026-10-29)

Proven on isolated PostgreSQL 16 (throwaway container; the owner's UAT stack and data were never touched):

1. **Migration 10 / v9→v10 upgrade** — `material-ledger-upgrade.integration.test.ts` (2/2) covers the seeded v9→v10 upgrade, ambiguous legacy-reservation refusal, profile mapping and cost-record immutability. Migration 10 applies cleanly in every proof (`module host` migrates universal-inventory to 10).
2. **Signed Inventory→Finance→Inventory receipt posting/cost journey + HTTP org/scanner behaviour** — F2.7 (`inventory-finance-relay-http`) PASS and F0.5 (`inventory-windows`) **29/29**, which now drives the full window CRUD + receipt→complete→stock balance + ledger with an org-selected Finance cost profile. Legacy-receipt recovery is exercised by the bounded retry action and Finance inbox tests (9/9).
3. **Reservation concurrency + movement reversal** — `reservation-concurrency.integration.test.ts` (12/12) proves atomic reserve/release, idempotent movement replay and reused-key rejection; `reverseMovement` (balanced, uncosted internal transfers) is wired at `POST /v1/records/inventory.movements/:id/reverse`. Live ATP is implemented as a client-polling panel (`AtpLivePanel.tsx`); true WebSocket streaming is deferred as a future differentiator (the plan's `> iDempiere` note, not a numbered slice).
4. **Clean verify** — full proof verify **28/28, 0 fail** on a fresh isolated database (`verify --audits` with `PROOF_DATABASE_URL`); inventory suite **39/39**. Bounded verify-baseline fixes aligned the `module-host-http` (U2), `finance-proof-bootstrap` and `inventory-windows` (F0.5) harnesses to the canonical `gigalibs_<schema>_runtime` role that the migrations grant to (regression introduced by finance migrations 12–15), and seeded F0.5's owning unit + Finance cost profile.

**Deploy position:** the live journey on the running stack is validated in the owner's single batch deploy with Modules 1–7 (UAT = production; deploys are owner-run). No `configuration-local`/UAT service was changed.
