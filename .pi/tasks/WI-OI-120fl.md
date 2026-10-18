# WI-OI-120fl (F1.1 / E1): `@gigalibs/document-lifecycle` shared transition runner

- **Status:** Done (slice 1 committed with WI-OI-120fm, 2026-10-18)
- **Work item:** WI-OI-120 (F1 in `remediation-backlog.md`; E1 in `platform-implementation-plan.md`; ADR-0033 D2). Evidence goes in
  `.pi/work/WI-OI-120.md`.
- **Size:** M (slice 1 of F1; pilot wiring is F1.2)

## Goal

Ship the shared document lifecycle primitives every transactional module will use: a transition runner with
per-document graphs, version concurrency, optional guards, and structured errors — without changing runtime behaviour
on UAT until F1.2 wires a pilot document (Finance journal drafts per E1).

## Scope

- **May change:**
  - new package `packages/document-lifecycle`;
  - root/workspace references needed for build and test;
  - `.pi/work/WI-OI-120.md`, `.pi/NOW.md`, this card.
- **Must not change:**
  - CMMS, running UAT services, applied migrations;
  - Finance or Inventory domain behaviour in this slice (F1.2);
  - CMMS import/export files.

## Read first

- `docs/architecture/ADR-0033-metadata-driven-windows-document-lifecycle-and-posting.md` D2.
- `modules/financial-operations/apps/api/src/finance/journal-drafts.service.ts` (pilot for F1.2).
- `packages/module-sdk/src/record-idempotency.ts` (idempotency semantics for F1.2).

## Steps

1. Add `@gigalibs/document-lifecycle` with a typed transition graph and `runTransition` (guards, version check, errors).
2. Unit tests: allowed transition, refused transition, stale version, guard failure.
3. `pnpm build` and `pnpm test` for the package; full `pnpm verify` when F1.2 touches modules.

## Done when

- [x] The package builds (`pnpm --filter @gigalibs/document-lifecycle build`).
- [ ] Unit tests pass in CI/local vitest (local Node 23 hit a vitest/utils mismatch; run `pnpm test` on the repo Node pin before commit).
- [ ] F1.2 card (pilot on journal drafts) is proposed for owner approval before any Finance refactor.
- [ ] Evidence recorded; `NOW.md` updated.

## Stop and ask if

- F1.2 would change posting or UAT-deployed Finance data without owner deploy approval.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
