# WI-OI-122 — seven-module foundation evidence

## 2026-10-28 baseline and design reconciliation

- Owner direction: complete F0 and seven modules in order; do not pause implementation for UAT; owner deploys one
  seven-module batch. No deployment or completion claim is made here.
- The committed source plan is `c4d58f69`. ADR-0018 already owns tenant-bounded, versioned organization units and
  explicit UNIT/SHARED/EITHER ownership; `packages/module-sdk/src/organization-access.ts` and
  `organization-replica.ts` implement access resolution. The proposed Org-0 and Prisma query injection conflicted
  with this architecture and were removed from the plan.
- ADR-0033 already defines per-document graphs and asynchronous Finance posting. The current
  `packages/document-lifecycle` has a transition runner; Inventory uses it for receipt completion, and its local
  transaction emits a Finance outbox fact. The runner does not yet supply the whole idempotency/audit/outbox primitive
  contract. This is a gap, not a completed foundation.
- ADR-0007's signed HTTP relay is the current transport. The plan's BullMQ and same-transaction cross-module GL
  wording was corrected. Posting has awaiting/posted/rejected states and needs reconciliation evidence per module.
- `pnpm verify --audits` baseline failed four unrelated steps on 2026-10-28; see `.pi/NOW.md` for the exact failures
  and log path. `audit:sdlc` passed with the new work-item rows.

## Open foundation work

- Apply the existing ownership policy and signed organization scope to a representative tenant/sibling-unit table;
  each module card owns its own row, endpoint, migration and reversal proof.
- Integrate the document-action coordinator into the first applicable module document; its real PostgreSQL proof
  covers the transaction contract but not an actual business document or cross-module relay.
- Establish the build-gate baseline on an isolated branch or resolve the four unrelated verification failures before
  claiming any module Built.

## Implemented and verified locally

- `packages/document-lifecycle/src/transactional-action.ts` adds a transaction-bound coordinator for document
  actions. It locks the document through the owning module's adapter, checks authorization even on replay, refuses a
  reused key with a changed request hash, runs the document-specific graph, and writes audit, outbox and outcome
  through the same transaction handle. It makes no cross-module ACID claim. The module adapter still needs a real
  database implementation and integration proof.
- `pnpm --filter @gigalibs/document-lifecycle typecheck` passed; 8 package tests passed, including replay,
  authorization, changed-payload refusal and rollback when outbox writing fails.
- An opt-in PostgreSQL 16 proof ran against a throwaway Docker container as a least-privilege role with forced RLS:
  all 3 integration tests passed (one audit/event on replay, changed-hash and revoked-actor refusal, cross-tenant
  isolation, rollback after outbox failure, and immediate refusal on a held row). The test container was removed.
- An opt-in PostgreSQL 16 organization proof ran against a second throwaway container as a least-privilege role:
  both integration tests passed. A scoped member read the North and explicit shared records, not South or another
  tenant's record; South and shared writes were refused; a grouping unit could not own records; an unreceived tree
  version failed closed. The test container was removed.
- `pnpm --filter @gigalibs/module-sdk typecheck` and its normal suite passed (78 tests). Both opt-in proof files
  skip by default in the normal unit suite and run only when their named environment switches are set against
  disposable containers.
- `pnpm module:new business-partners ... --work-item WI-OI-123` created a host module scaffold only. Its manifest is
  explicitly `PLANNED`/`CONCEPT`; the source plan now keeps kernel Party as master-data authority. Gateway/navigation
  equivalence tests passed 79/79 after registering the new module.
- Full `pnpm verify` (outside the sandbox because network-binding tests returned EPERM inside it): build passed;
  tests and audits failed. See `.pi/NOW.md` for the log and outstanding categories. No module-completion commit or
  deployment was made.
